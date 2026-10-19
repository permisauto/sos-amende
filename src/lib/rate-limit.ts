/**
 * Rate-limit à fenêtre glissante, par clé (email, IP, etc.) : garde-fou
 * anti-abus des endpoints publics (magic-links, virement, démo, health).
 *
 * Moteurs (`RATE_LIMIT_STORE`) :
 *  - `memory` (défaut — dev/E2E) : Map en processus, une instance ;
 *  - `postgres` (prod) : table `RateLimitBucket` partagée — la fenêtre est
 *    lue-modifiée sous verrou de ligne (UPSERT `ON CONFLICT … RETURNING`),
 *    toutes les instances serverless confondues.
 *
 * Toute erreur BDD bascule l'appel sur le moteur mémoire : le rate-limit n'est
 * jamais une source d'erreur 500 (garde-fou best-effort, comme en mémoire).
 */

import { prisma } from "@/lib/prisma";

const fenetres = new Map<string, number[]>();

export type RateLimitStore = "memory" | "postgres";

/** Moteur actif : `postgres` seulement sur choix explicite (`RATE_LIMIT_STORE`). */
export function rateLimitStore(): RateLimitStore {
  // `trim()` + nettoyage du BOM : une valeur saisie via un pipe Windows peut
  // arriver polluée d'un U+FEFF invisible, ce qui ferait basculer silencieusement
  // en mémoire. On compare donc sur la valeur normalisée.
  const brut = (process.env.RATE_LIMIT_STORE ?? "").replace(/^\uFEFF/, "").trim();
  return brut === "postgres" ? "postgres" : "memory";
}

function consommerMemoire(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const recents = (fenetres.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recents.length >= max) return 0;
  recents.push(now);
  fenetres.set(key, recents);
  return max - recents.length;
}

/** Horodatages (epoch ms) valides d'une fenêtre stockée en JSONB. */
function parserEssais(brut: unknown): number[] {
  let valeur = brut;
  if (typeof valeur === "string") {
    try {
      valeur = JSON.parse(valeur);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(valeur)) return [];
  return valeur.filter(
    (t): t is number => typeof t === "number" && Number.isFinite(t),
  );
}

async function consommerPostgres(
  key: string,
  max: number,
  windowMs: number,
): Promise<number | null> {
  const now = Date.now();
  try {
    return await prisma.$transaction(async (tx) => {
      // L'upsert prend le verrou de ligne à la clé : deux instances qui
      // consomment la même fenêtre sont sérialisées (la seconde lit la
      // fenêtre déjà écrite par la première).
      const rows = await tx.$queryRaw<{ essais: unknown }[]>`
        INSERT INTO "RateLimitBucket" (key, essais, "expireLe", "updatedAt")
        VALUES (${key}, ${"[]"}::jsonb, ${new Date(now + windowMs)}, now())
        ON CONFLICT (key) DO UPDATE SET essais = "RateLimitBucket".essais
        RETURNING essais`;
      const vivants = parserEssais(rows[0]?.essais).filter(
        (t) => now - t < windowMs,
      );
      if (vivants.length >= max) return 0;
      const suite = [...vivants, now];
      await tx.$executeRaw`
        UPDATE "RateLimitBucket"
           SET essais = ${JSON.stringify(suite)}::jsonb,
               "expireLe" = ${new Date(now + windowMs)},
               "updatedAt" = now()
         WHERE key = ${key}`;
      return max - suite.length;
    });
  } catch (e) {
    // BDD indisponible : repli mémoire (une instance) plutôt qu'une 500.
    console.warn("[rate-limit] postgres indisponible, repli mémoire :", e);
    return null;
  }
}

/**
 * Tente de consommer un créneau pour une clé. Retourne le nombre d'essais
 * restants (>= 0 ; 0 = bloqué). max = nombre max d'essais dans windowMs.
 */
export async function consommerCreneau(
  key: string,
  max: number,
  windowMs: number,
): Promise<number> {
  if (rateLimitStore() === "postgres") {
    const depuis = await consommerPostgres(key, max, windowMs);
    if (depuis !== null) return depuis;
  }
  return consommerMemoire(key, max, windowMs);
}

/**
 * Purge les fenêtres entièrement expirées (`expireLe` passé) — cron quotidien,
 * meilleur effort. Aucune purge côté mémoire : les entrées y sont écrasées à
 * chaque essai et de toute façon perdues au redémarrage de l'instance.
 */
export async function purgerFenetresExpirees(): Promise<number> {
  if (rateLimitStore() !== "postgres") return 0;
  try {
    const r = await prisma.rateLimitBucket.deleteMany({
      where: { expireLe: { lt: new Date() } },
    });
    return r.count;
  } catch {
    return 0;
  }
}
