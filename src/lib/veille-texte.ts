/**
 * Lecture côte à côté (lot M) : extraction locale du **dispositif** d'une
 * décision publiée — le passage qui prononce le jugement, là où la juridiction
 * dit ce qu'elle ORDONNE / DÉCIDE / ARRÊTE.
 *
 * Module **pur**, sans base ni réseau : regex tolérantes aux espacements de
 * lettres (les PDF de la justice administrative espacent les majuscules des
 * marqueurs : « O R D O N N E : », « D É C I D E : »). Aucune IA — le
 * dispositif doit être le texte publié, pas une reformulation.
 *
 * `null` = aucun marqueur fiable → l'interface affiche le texte intégral.
 */

/** Nombre minimal de caractères pour qu'un extrait soit un dispositif utile. */
const SEUIL_DISPOSITIF = 40;

/** Un mot-clé en majuscules, lettre par lettre, tolérant les espacements. */
const lettres = (mot: string): string =>
  [...mot]
    .map((c) => {
      if (c === "É" || c === "E") return "[ÉE]";
      if (c === "Ê" || c === "E") return "[ÊE]";
      if (c === "È" || c === "E") return "[ÈE]";
      return c;
    })
    .join("\\s*");

/** Marqueurs de début de dispositif (dans l'ordre de recherche). */
const MARQUEURS_DEBUT: RegExp[] = [
  new RegExp(`D\\s*${lettres("ECIDE")}\\s*:`, "i"),
  new RegExp(`O\\s*${lettres("RDONNE")}\\s*:`, "i"),
  new RegExp(`A\\s*${lettres("RR")}\\s*[ÊE]\\s*${lettres("TE")}\\s*:`, "i"),
  /Dit\s+et\s+jug[ée]\s*:/i,
];

/**
 * Marqueurs de fin : tout ce qui suit le dispositif (signature, formule
 * d'exécution, mention de mise à disposition) n'en fait pas partie.
 */
const MARQUEURS_FIN: RegExp[] = [
  /\n\s*D[ée]lib[ée]r[ée] après/i,
  /\n\s*Sign[ée]\s*:/i,
  /\n\s*La R[ée]publique mande et ordonne/i,
  /\n\s*Pour exp[ée]dition conforme/i,
  /\n\s*Rendu public par mise à disposition/i,
];

/**
 * Extrait le dispositif d'une décision, ou `null` si aucun marqueur fiable
 * n'est trouvé (l'appelant affiche alors le texte intégral).
 */
export function extraireDispositif(contenu: string): string | null {
  if (!contenu) return null;

  let debut = -1;
  let finDebut = -1;
  for (const marqueur of MARQUEURS_DEBUT) {
    const m = marqueur.exec(contenu);
    if (m && (debut === -1 || m.index < debut)) {
      debut = m.index;
      finDebut = m.index + m[0].length;
    }
  }
  if (debut === -1) return null;

  let fin = contenu.length;
  // Fin : tout marqueur de début postérieur (un second « ORDONNE : » clôt le
  // premier), puis les formules de clôture (signature, exécution…).
  for (const marqueur of MARQUEURS_DEBUT) {
    const m = marqueur.exec(contenu.slice(finDebut));
    if (m && finDebut + m.index < fin) fin = finDebut + m.index;
  }
  for (const marqueur of MARQUEURS_FIN) {
    const m = marqueur.exec(contenu.slice(debut));
    if (m && debut + m.index < fin) fin = debut + m.index;
  }

  const dispositif = contenu.slice(debut, fin).trim();
  if (dispositif.length < SEUIL_DISPOSITIF) return null;
  return dispositif;
}
