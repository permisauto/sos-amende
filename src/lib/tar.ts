/**
 * Lecteur TAR minimal (ustar/GNU) pour extraire les archives `.tar.gz`
 * publiées par la DILA (CASS, JADE, JORF). Évite d'ajouter une dépendance
 * externe : le format est trivial (en-têtes de 512 octets, taille en octal,
 * deux blocs nuls en fin d'archive) et `node:zlib` suffit pour le gunzip.
 *
 * Uniquement des fichiers réguliers sont retournés (les répertoires et liens
 * sont ignorés) : la veille DILA n'a besoin que des `.xml`.
 */

import { gunzipSync } from "node:zlib";

const BLOC = 512;

export type EntreeTar = {
  chemin: string;
  contenu: Buffer;
};

/** Champ texte de l'en-tête (longueur fixe, terminé par NUL). */
function lireChaine(buf: Buffer, debut: number, longueur: number): string {
  const brut = buf.subarray(debut, debut + longueur);
  const fin = brut.indexOf(0);
  return brut.subarray(0, fin === -1 ? brut.length : fin)
    .toString("utf8")
    .trim();
}

/** Taille en octal (ou base-256 GNU au-delà de 8 Gio). */
function lireTaille(buf: Buffer, debut: number, longueur: number): number {
  const brut = buf.subarray(debut, debut + longueur);
  if (brut.length === 0) return 0;
  if ((brut[0] & 0x80) !== 0) {
    let v = 0;
    for (let i = 1; i < brut.length; i++) v = v * 256 + brut[i];
    return v;
  }
  const s = brut.toString("ascii").replace(/\0.*$/, "").trim();
  const n = s ? Number.parseInt(s, 8) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Extrait les fichiers d'une archive tar.gz déjà en mémoire.
 * Fonction pure (hors E/S) : ne touche jamais au disque.
 */
export function extraireTarGz(gz: Buffer): EntreeTar[] {
  const buf = gunzipSync(gz);
  const entrees: EntreeTar[] = [];
  let off = 0;

  while (off + BLOC <= buf.length) {
    // Deux octets nuls en tête de bloc = fin d'archive.
    if (buf[off] === 0 && buf[off + 1] === 0) break;

    const nom = lireChaine(buf, off, 100);
    const taille = lireTaille(buf, off + 124, 12);
    const type = buf[off + 156];
    // `prefix` n'est renseigné que par les en-têtes ustar (noms > 100 car.).
    const prefixe = lireChaine(buf, off + 345, 155);
    const chemin = prefixe ? `${prefixe}/${nom}` : nom;

    // '0' (NUL) et '0' ASCII = fichier régulier.
    if (type === 0x30 || type === 0) {
      entrees.push({
        chemin,
        contenu: buf.subarray(off + BLOC, off + BLOC + taille),
      });
    }

    off += BLOC + Math.ceil(taille / BLOC) * BLOC;
  }

  return entrees;
}

/** Garde-fous d'ingestion : on n'ingère jamais une archive absurdement grosse. */
export const TAILLE_MAX_ARCHIVE = 64 * 1024 * 1024;
