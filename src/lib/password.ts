import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hachage de mot de passe interne (comptes juristes/administrateurs) via scrypt
 * (node:crypto — stdlib, zéro dépendance, pas de code edge). Format stocké :
 * `scrypt$N$r$p$selHex$cleHex`.
 */
const FORMAT = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SCRYPT_OPTS = { N: 1 << 15, r: 8, p: 1 } as const;

/** Hache un mot de passe interne (scrypt + sel aléatoire). */
export function hashPassword(motDePasse: string): string {
  const sel = randomBytes(SALT_BYTES);
  const cle = scryptSync(motDePasse, sel, KEY_BYTES, SCRYPT_OPTS);
  return [
    FORMAT,
    SCRYPT_OPTS.N,
    SCRYPT_OPTS.r,
    SCRYPT_OPTS.p,
    sel.toString("hex"),
    cle.toString("hex"),
  ].join("$");
}

/**
 * Vérifie un mot de passe (comparaison à temps constant). Retourne false pour
 * tout format inconnu ou si aucun mot de passe n'est défini (comptes clients —
 * connexion magic-link uniquement).
 */
export function verifyPassword(
  motDePasse: string,
  stocke: string | null | undefined,
): boolean {
  if (!stocke) return false;
  const parties = stocke.split("$");
  if (parties.length !== 6 || parties[0] !== FORMAT) return false;
  const N = Number(parties[1]);
  const r = Number(parties[2]);
  const p = Number(parties[3]);
  const sel = Buffer.from(parties[4], "hex");
  const attendu = Buffer.from(parties[5], "hex");
  if (!sel.length || !attendu.length) return false;
  const calcule = scryptSync(motDePasse, sel, attendu.length, { N, r, p });
  return timedEqualCalcule(attendu, calcule);
}

function timedEqualCalcule(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
