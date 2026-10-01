/**
 * Règles d'activation d'une faille — logique pure, testée.
 *
 * Une `FailleJuridique` `ACTIVE` alimente deux choses sensibles :
 *   1. le moteur de détection (`detecterFailles`) ;
 *   2. la génération des lettres (`remplirTemplate` sur `templateLettre`).
 *
 * Une proposition incomplète ne peut donc jamais passer : le moteur fabriquerait
 * une lettre vide, et une faille sans règle dégagée n'est pas opposable.
 *
 * C'est notamment le cas des propositions issues de la **veille juridique** :
 * elles arrivent avec la référence de la source et ses citations, mais `regle` et
 * `templateLettre` sont volontairement vides (cf. `promouvoirSource`). Le juriste
 * doit les rédiger avant validation.
 */

export type ChampsActivation = {
  regle: string | null;
  templateLettre: string | null;
};

/** Champs manquants ou vides (espaces seuls = vide) bloquant l'activation. */
export function manquantsPourActivation(
  f: ChampsActivation,
): ("regle" | "templateLettre")[] {
  const manquants: ("regle" | "templateLettre")[] = [];
  if (!f.regle?.trim()) manquants.push("regle");
  if (!f.templateLettre?.trim()) manquants.push("templateLettre");
  return manquants;
}

/** true si la faille peut être activée (moteur + lettre utilisables). */
export function estActivable(f: ChampsActivation): boolean {
  return manquantsPourActivation(f).length === 0;
}

/** Message d'erreur actionnable pour l'admin, ou null si activable. */
export function messageActivationBloquee(f: ChampsActivation): string | null {
  const m = manquantsPourActivation(f);
  if (m.length === 0) return null;
  if (m.includes("regle") && m.includes("templateLettre")) {
    return "Règle dégagée et template de lettre absents : rédigez les deux avant d'activer.";
  }
  if (m.includes("regle")) {
    return "Règle dégagée absente : rédigez ce que la source impose avant d'activer.";
  }
  return "Template de lettre absent : rédigez la lettre avant d'activer la faille.";
}
