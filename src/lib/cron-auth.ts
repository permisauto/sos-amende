import { createHash, timingSafeEqual } from "node:crypto";

export type ResultatAuthCron = "ok" | "non-autorise" | "secret-absent";

/**
 * Comparaison de secrets à temps constant. `timingSafeEqual` exige des
 * tampons de même longueur : comparer deux chaînes de longueurs différentes
 * lèverait une exception (et fuirait la longueur via le type d'erreur).
 * Hasher les deux côtés en sha256 égalise la longueur (32 octets) tout en
 * préservant l'égalité — jamais de `!==` sur un secret.
 */
export function secretsEgaux(fourni: string, secret: string): boolean {
  const a = createHash("sha256").update(fourni, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Authentification d'un endpoint cron (Vercel Cron ou appel manuel) :
 * header `Authorization: Bearer <CRON_SECRET>`.
 *
 * - sans `CRON_SECRET` : `secret-absent` en production (la route répond 500 —
 *   le cron ne doit pas tourner sans secret), `ok` en dev local ;
 * - avec secret : comparaison constante du temps (jamais `!==`).
 */
export function verifierSecretCron(req: Request): ResultatAuthCron {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "production" ? "secret-absent" : "ok";
  }
  const header = req.headers.get("authorization") ?? "";
  const fourni = header.replace(/^Bearer\s+/i, "").trim();
  return secretsEgaux(fourni, secret) ? "ok" : "non-autorise";
}
