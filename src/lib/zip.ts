/**
 * Lecteur ZIP minimal (répertoire central) pour extraire les archives
 * mensuelles des tribunaux administratifs publiées par la DILA
 * (`opendata.justice-administrative.fr/DTA/…/TA_AAAAMM.zip`). Évite d'ajouter
 * une dépendance externe : on lit la **table du répertoire central** (seule
 * place où les tailles sont toujours présentes, même quand l'entrée porte le
 * bit « data descriptor »), puis on inflate chaque entrée à la volée.
 *
 * Générateur plutôt que tableau : les zip mensuels font ~19 000 XML et ~64 Mo
 * compressés (400 Mo décompressés) — les garder tous en mémoire d'un coup
 * ferait monter le pick du cron inutilement.
 *
 * Seuls les fichiers « stored » (méthode 0) et « deflate » (méthode 8) sont
 * retournés ; les répertoires et les méthodes exotiques sont ignorés. Garde-fous
 * anti zip-bomb : entrée bornée, total décompressé borné, zip64 refusé.
 */

import { inflateRawSync } from "node:zlib";

export type EntreeZip = {
  chemin: string;
  contenu: Buffer;
};

/** Un XML de décision ne pèse jamais des dizaines de mégaoctets. */
export const TAILLE_MAX_ENTREE_ZIP = 50 * 1024 * 1024;
/** Total décompressé borné (les zip DILA réels restent largement en dessous). */
export const TAILLE_MAX_DONNEES_ZIP = 512 * 1024 * 1024;

const SIGNATURE_EOCD = 0x06054b50; // fin du répertoire central
const SIGNATURE_CENTRAL = 0x02014b50; // entrée du répertoire central
const SIGNATURE_LOCALE = 0x04034b50; // en-tête local
const TAILLE_EOCD = 22;
const COMMENT_MAX = 0xffff;

/** Position de la signature de fin (EOCD), en remontant depuis la fin. */
function trouverEocd(buf: Buffer): number {
  const born = Math.max(0, buf.length - TAILLE_EOCD - COMMENT_MAX);
  for (let i = buf.length - TAILLE_EOCD; i >= born; i--) {
    if (buf.readUInt32LE(i) === SIGNATURE_EOCD) return i;
  }
  throw new Error("fin du répertoire central (EOCD) introuvable");
}

/**
 * Extrait les fichiers d'un archive ZIP déjà en mémoire, un par un.
 * Fonction pure (hors E/S) : ne touche jamais au disque. Lance si
 * l'archive est illisible (corrompue, zip64, méthode inconnue…) —
 * l'appelant décide de sauter ou d'abandonner.
 */
export function* lireZip(zip: Buffer): Generator<EntreeZip> {
  const eocd = trouverEocd(zip);
  const nbEntrees = zip.readUInt16LE(eocd + 10);
  if (nbEntrees === 0xffff) throw new Error("archive zip64 non gérée");

  let off = zip.readUInt32LE(eocd + 16); // offset du répertoire central
  let total = 0;

  for (let i = 0; i < nbEntrees; i++) {
    if (off + 46 > zip.length || zip.readUInt32LE(off) !== SIGNATURE_CENTRAL) {
      throw new Error("répertoire central illisible");
    }
    const methode = zip.readUInt16LE(off + 10);
    const tailleCompressee = zip.readUInt32LE(off + 20);
    const taille = zip.readUInt32LE(off + 24);
    const nomL = zip.readUInt16LE(off + 28);
    const extraL = zip.readUInt16LE(off + 30);
    const commentaireL = zip.readUInt16LE(off + 32);
    const debutLocal = zip.readUInt32LE(off + 42);
    const chemin = zip.subarray(off + 46, off + 46 + nomL).toString("utf8");
    off += 46 + nomL + extraL + commentaireL;

    if (chemin.endsWith("/")) continue; // répertoire
    if (taille > TAILLE_MAX_ENTREE_ZIP) {
      throw new Error(`entrée trop grosse : ${chemin}`);
    }
    total += taille;
    if (total > TAILLE_MAX_DONNEES_ZIP) throw new Error("archive trop gonflée");
    // Méthode exotique (bzip2, lzma…) : sans objet pour des XML, on passe.
    if (methode !== 0 && methode !== 8) continue;

    if (debutLocal + 30 > zip.length || zip.readUInt32LE(debutLocal) !== SIGNATURE_LOCALE) {
      throw new Error(`en-tête local illisible : ${chemin}`);
    }
    const nomLocal = zip.readUInt16LE(debutLocal + 26);
    const extraLocal = zip.readUInt16LE(debutLocal + 28);
    const debut = debutLocal + 30 + nomLocal + extraLocal;
    const donnees = zip.subarray(debut, debut + tailleCompressee);
    if (donnees.length !== tailleCompressee) {
      throw new Error(`données tronquées : ${chemin}`);
    }

    let contenu: Buffer;
    if (taille === 0) contenu = Buffer.alloc(0);
    else if (methode === 0) contenu = Buffer.from(donnees);
    else contenu = inflateRawSync(donnees);

    yield { chemin, contenu };
  }
}
