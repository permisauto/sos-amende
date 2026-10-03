/**
 * Recherche par mots-clés dans la bibliothèque juridique (admin + juriste).
 * Pur, sans `server-only` : filtrage mémoire sur le petit catalogue existant
 * (une dizaine d'entrées) — aucun changement de schéma, aucune requête SQL.
 *
 * Règles :
 * - insensible à la casse ET aux accents (« etalonnage » trouve « étalonnage ») ;
 * - plusieurs mots-clés : TOUS doivent être présents (ET) ;
 * - champés sur titre, article, règle dégagée, template, source, type,
 *   règles de détection et jurisprudences (référence + résumé).
 */

export interface FailleCherchable {
  titreFaille: string;
  articleLoi: string;
  regle?: string | null;
  templateLettre: string;
  source?: string | null;
  typeInfraction?: string | null;
  reglesDetection?: Array<{
    type?: string | null;
    motif?: string | null;
    champ?: string | null;
  }> | null;
  jurisprudence?: Array<{
    reference?: string | null;
    resume?: string | null;
  }> | null;
}

/** Minuscules + suppression des accents (NFD + retrait des combinants). */
export function normaliserTexteRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function extraireCorpus(faille: FailleCherchable): string {
  const morceaux: Array<string | null | undefined> = [
    faille.titreFaille,
    faille.articleLoi,
    faille.regle,
    faille.templateLettre,
    faille.source,
    faille.typeInfraction,
  ];
  for (const regle of faille.reglesDetection ?? []) {
    morceaux.push(regle.type, regle.motif, regle.champ);
  }
  for (const j of faille.jurisprudence ?? []) {
    morceaux.push(j.reference, j.resume);
  }
  return normaliserTexteRecherche(morceaux.filter(Boolean).join(" "));
}

/** Découpe la requête en mots-clés normalisés (hors chaînes vides). */
export function motsClesRecherche(q: string): string[] {
  return normaliserTexteRecherche(q)
    .split(/\s+/)
    .map((mot) => mot.trim())
    .filter(Boolean);
}

/**
 * Filtre les failles dont le corpus contient TOUS les mots-clés.
 * Requête vide (ou blanche) → la liste est renvoyée intacte.
 */
export function rechercherFailles<T extends FailleCherchable>(
  failles: T[],
  q: string,
): T[] {
  const mots = motsClesRecherche(q);
  if (mots.length === 0) return failles;
  return failles.filter((faille) => {
    const corpus = extraireCorpus(faille);
    return mots.every((mot) => corpus.includes(mot));
  });
}
