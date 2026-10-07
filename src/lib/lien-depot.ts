import { createHash, randomBytes } from "crypto";
import { baseUrlApp } from "@/lib/base-url";
import { prisma } from "@/lib/prisma";
import { notifierLienDepot, notifierStatut } from "@/lib/notifications";

/** Validité du lien de dépôt assisté envoyé au client (7 jours). */
export const LIEN_DEPOT_DUREE_JOURS = 7;

/**
 * RGPD (minimisation de la conservation) : les liens expirés sont conservés
 * 30 jours après leur expiration (trace de support : « mon lien ne marche
 * plus ») puis purgés de la base par `purgerLiensDepotExpires` (cron rappels).
 * Seul le hash y figure — mais il n'a plus aucune utilité une fois expiré.
 */
export const LIEN_DEPOT_PURGE_JOURS = 30;

/** Seuil de purge : tout lien expiré depuis plus de `LIEN_DEPOT_PURGE_JOURS`. */
export function dateSeuilPurgeLiens(now: Date): Date {
  return new Date(now.getTime() - LIEN_DEPOT_PURGE_JOURS * 24 * 60 * 60 * 1000);
}

/** Supprime les liens de dépôt expirés depuis plus de 30 jours. Retourne le nombre purgé. */
export async function purgerLiensDepotExpires(now: Date = new Date()): Promise<number> {
  const res = await prisma.lienDepot.deleteMany({
    where: { expireLe: { lt: dateSeuilPurgeLiens(now) } },
  });
  return res.count;
}

/** Canaux en ligne concernés par le dépôt assisté (jamais LRAR). */
export type CanalDepotEnLigne = "ANTAI" | "TELERECOURS";

export function peutActiverDepotEnLigne(canal: string | null | undefined): canal is CanalDepotEnLigne {
  return canal === "ANTAI" || canal === "TELERECOURS";
}

/**
 * Hash sha256 du token (le token clair n'est jamais stocké — RGPD : seuls le
 * hash et les métadonnées vivent en base).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Crée (ou régénère) le lien de dépôt assisté d'un dossier dont le juriste a
 * validé la lettre avec un canal en ligne (ANTAI/Télérecours). Retourne le
 * token CLAIR (envoyé par e-mail) et le lien complet ; le token est stocké
 * haché. Idempotent : un lien existant non consommé est remplacé.
 */
export async function creerLienDepot(opts: {
  dossierId: string;
  canal: CanalDepotEnLigne;
}): Promise<{ token: string; url: string; expireLe: Date }> {
  const token = randomBytes(24).toString("base64url");
  const expireLe = new Date(Date.now() + LIEN_DEPOT_DUREE_JOURS * 24 * 60 * 60 * 1000);

  await prisma.lienDepot.upsert({
    where: { dossierId: opts.dossierId },
    create: {
      dossierId: opts.dossierId,
      tokenHash: hashToken(token),
      canal: opts.canal,
      expireLe,
    },
    update: {
      tokenHash: hashToken(token),
      canal: opts.canal,
      expireLe,
      consommeLe: null,
    },
  });

  const base = await baseUrlApp("http://localhost:3200");
  const url = `${base}/recours/finaliser?token=${encodeURIComponent(token)}`;
  return { token, url, expireLe };
}

/**
 * Valide un token et retourne le dossier concerné (avec ses données). Un lien
 * expiré, consommé ou introuvable → null. On ne filtre PAS le statut ici : la
 * page d'arrivée adapte son affichage à l'état réel du dossier (PRET → actions
 * de dépôt ; EN_ATTENTE_PRE_SIGNATURE → inviter à signer ; ENVOYE/RESOLU →
 * déjà transmis). Side-serveur uniquement.
 */
export type FichierDepot = {
  id: string;
  nom: string;
  type: string;
};

export async function verifierLienDepot(token: string): Promise<{
  dossier: {
    id: string;
    type: string;
    statut: string;
    numRef: string;
    plaque: string;
    canal: string;
    montant: number;
    radar: boolean;
    nomClient: string;
    fichiers: {
      lettrePdf: string | null;
      pv: string | null;
      preuves: FichierDepot[];
      /** Pack Télérecours (3F/48SI) : requête, référé L. 521-2, bordereau. */
      pack: {
        requete: string | null;
        refere: string | null;
        bordereau: string | null;
      };
    };
  };
  expireLe: Date;
} | null> {
  if (!token) return null;
  const lien = await prisma.lienDepot.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      dossier: {
        include: {
          user: { select: { name: true } },
          courriers: { orderBy: { createdAt: "asc" } },
          preuves: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!lien) return null;
  if (lien.consommeLe) return null;
  if (lien.expireLe < new Date()) return null;

  const ex = (lien.dossier.extractedData ?? {}) as Record<string, unknown>;
  const numRef =
    typeof ex["num_pv"] === "string"
      ? ex["num_pv"]
      : typeof ex["num_telepaiement"] === "string"
        ? ex["num_telepaiement"]
        : "—";
  const plaque = typeof ex["plaque"] === "string" ? ex["plaque"] : "—";
  const montant = Number(ex["montant"] ?? 0);
  const courriers = lien.dossier.courriers ?? [];
  const dernierCourrier = courriers[courriers.length - 1];
  // Pack Télérecours (3F/48SI) : rattaché au courrier validé ou signé — on
  // remonte le dernier qui en porte (un courrier plus récent peut l'ignorer).
  const courrierPack = [...courriers]
    .reverse()
    .find((c) => c.packUrls != null);
  const pack = (courrierPack?.packUrls ?? null) as {
    requete?: string | null;
    refere?: string | null;
    bordereau?: string | null;
  } | null;

  return {
    dossier: {
      id: lien.dossier.id,
      type: lien.dossier.type,
      statut: lien.dossier.statut,
      numRef,
      plaque,
      canal: lien.canal,
      montant,
      radar: lien.dossier.type === "AMENDE" && Boolean(ex["radarId"] || ex["typeRadar"]),
      nomClient: lien.dossier.user.name ?? "Client",
      fichiers: {
        lettrePdf: dernierCourrier?.pdfUrl ?? null,
        pv: lien.dossier.pvUrl ?? null,
        preuves: (lien.dossier.preuves ?? [])
          .filter((p) => p.url && p.url.trim() !== "")
          .map((p) => ({ id: p.id, nom: p.nom, type: p.type })),
        pack: {
          requete: pack?.requete ?? null,
          refere: pack?.refere ?? null,
          bordereau: pack?.bordereau ?? null,
        },
      },
    },
    expireLe: lien.expireLe,
  };
}

/**
 * Action commune de passage ENVOYE : le client confirme avoir déposé sa
 * contestation sur le portail officiel (bouton « J'ai déposé » de la page
 * /recours/finaliser OU de son espace client — dépôt assisté). Garde-fou :
 * statut PRET uniquement. Écrit le statut + événement ENVOI dans la même
 * transaction puis notifie le client (cas ENVOYE). Retourne un message
 * d'erreur lisible sinon.
 */
export async function marquerDepotEnvoye(opts: {
  dossierId: string;
  canal: string;
  statut: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (opts.statut !== "PRET") {
    return {
      ok: false,
      error:
        opts.statut === "ENVOYE" || opts.statut === "RESOLU"
          ? "Votre contestation a déjà été transmise."
          : "Votre lettre n'est pas encore prête à déposer (signature ou validation en cours).",
    };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: opts.dossierId },
      data: { statut: "ENVOYE", decisionAttendueLe: new Date(), updatedAt: new Date() },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: opts.dossierId,
        type: "ENVOI",
        detail: `Contestation déposée par le client sur le portail ${opts.canal} (lien assisté)`,
      },
    }),
  ]);

  await notifierStatut(opts.dossierId).catch(() => false);
  return { ok: true };
}

/**
 * Confirme le dépôt via le lien de dépôt assisté (page /recours/finaliser).
 * Valide le lien (présent, non consommé, non expiré) puis applique
 * `marquerDepotEnvoye` et consomme le lien dans la même logique.
 */
export async function confirmerDepotSurPortail(token: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!token) return { ok: false, error: "Lien invalide." };
  const lien = await prisma.lienDepot.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { dossier: { select: { id: true, statut: true } } },
  });
  if (!lien || lien.consommeLe || lien.expireLe < new Date()) {
    return { ok: false, error: "Ce lien n'est plus valable." };
  }

  const res = await marquerDepotEnvoye({
    dossierId: lien.dossierId,
    canal: lien.canal,
    statut: lien.dossier.statut,
  });
  if (!res.ok) return res;

  await prisma.lienDepot.update({
    where: { id: lien.id },
    data: { consommeLe: new Date() },
  });
  return { ok: true };
}

/**
 * Boucle de bout en bout : crée le lien de dépôt assisté puis envoie au client
 * l'e-mail avec le lien (défensif : sans AUTH_RESEND_KEY, aucun envoi mais le
 * lien reste créé). Appelée quand le juriste valide la lettre avec un canal
 * en ligne — le client accède à /recours/finaliser?token=...
 */
export async function activerDepotEnLigne(opts: {
  dossierId: string;
  canal: CanalDepotEnLigne;
}): Promise<{ url: string } | null> {
  const lien = await creerLienDepot({ dossierId: opts.dossierId, canal: opts.canal });
  await notifierLienDepot({
    dossierId: opts.dossierId,
    url: lien.url,
    expireLe: lien.expireLe,
  }).catch(() => false);
  return { url: lien.url };
}