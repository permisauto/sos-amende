/**
 * Règles d'activation d'une faille — logique testée.
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
 * `templateLettre` peuvent être vides (correction admin partielle) **ou réduits
 * au marqueur du secours local** (`extractionLocale`, sans IA) — qui n'est pas
 * une règle dégagée mais une citation de tête du texte, souvent la paraphrase
 * d'un rejet. Le juriste doit les rédiger avant validation.
 *
 * Incident 2026-10-18 : 38 failles `ACTIVE` n'étaient faites que de ce squelette
 * local (article procédural + lettre mécanique) et étaient donc envoyables.
 *
 * La synchronisation manuelle de l'admin active d'office les propositions
 * **complètes** (`activerPropositionsCompletes`) ; les incomplètes restent en
 * PROPOSEE jusqu'à rédaction.
 */

import type { PrismaClient } from "@/generated/prisma/client";

export type ChampsActivation = {
  regle: string | null;
  templateLettre: string | null;
};

/**
 * Marqueur du **secours local** de la veille (`extractionLocale`) : la « règle »
 * y est étiquetée explicitement et ne fait que citer la tête du texte — souvent
 * le résumé d'un recours **rejeté**. Ce n'est pas une règle dégagée : on la
 * compte comme absente à l'activation.
 */
const REGLE_PLACEHOLDER = /extraction locale \(sans ia\)/i;

/** true si la « règle » n'est que le marqueur de secours local de la veille. */
export function estReglePlaceholder(regle: string | null | undefined): boolean {
  return !!regle && REGLE_PLACEHOLDER.test(regle);
}

/**
 * Champs manquants ou vides (espaces seuls = vide) bloquant l'activation. Une
 * règle réduite au marqueur du secours local compte comme absente.
 */
export function manquantsPourActivation(
  f: ChampsActivation,
): ("regle" | "templateLettre")[] {
  const manquants: ("regle" | "templateLettre")[] = [];
  if (!f.regle?.trim() || estReglePlaceholder(f.regle)) manquants.push("regle");
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

export type BilanActivation = {
  /** ids effectivement passés de PROPOSEE à ACTIVE. */
  activees: string[];
  /** propositions laissées en PROPOSEE (règle ou template à rédiger). */
  ignorees: number;
  /** propositions examinées (toutes celles en PROPOSEE). */
  examinees: number;
};

/**
 * Passe en ACTIVE **toutes** les propositions complètes (règle dégagée +
 * template de lettre non vides) en un seul lot — c'est le cœur de la
 * synchronisation manuelle de l'admin (« Synchroniser et activer »).
 *
 * Garde-fou conservé : une proposition incomplète (promotion de veille à
 * rédiger, création hors catalogue) reste en PROPOSEE, faute de quoi le moteur
 * générerait une lettre vide. `dep` accepte prisma ou une transaction Prisma.
 */
export async function activerPropositionsCompletes(
  dep: Pick<PrismaClient, "failleJuridique">,
): Promise<BilanActivation> {
  const proposees = await dep.failleJuridique.findMany({
    where: { statut: "PROPOSEE" },
    select: { id: true, regle: true, templateLettre: true },
  });
  const activables = proposees.filter((f) => estActivable(f));
  if (activables.length > 0) {
    await dep.failleJuridique.updateMany({
      where: { id: { in: activables.map((f) => f.id) } },
      data: { statut: "ACTIVE" },
    });
  }
  return {
    activees: activables.map((f) => f.id),
    ignorees: proposees.length - activables.length,
    examinees: proposees.length,
  };
}

/**
 * Offre Pack 3F/48SI — failles validées produit (décision 2026-10-07) :
 * injectées en `ACTIVE` à chaque synchronisation du catalogue (idempotent),
 * dès lors qu'elles sont complètes (règle dégagée + template de lettre).
 *
 * Garde-fous :
 * - jamais une faille **incomplète** (mêmes `estActivable`) ;
 * - jamais une faille **écartée** par l'admin (INACTIVE reste INACTIVE) ;
 * - seules des règles cloisonnées `docType` (3F/48SI) : elles ne peuvent donc
 *   jamais se déclencher sur un PV d'amende ni sur un document non classé.
 *
 * Les 2 autres propositions du pack (`faille-3f-incompetence`,
 * `faille-48si-stage-avant-notification`) restent en PROPOSEE : activation
 * admin uniquement, comme le reste du catalogue.
 */
export const FAILLES_PACK_ACTIVES = [
  "faille-3f-delai-retention",
  "faille-3f-defaut-motivation",
  "faille-48si-defaut-info",
  "faille-48si-plafond-8pts",
] as const;

export async function injecterFaillesPack(
  dep: Pick<PrismaClient, "failleJuridique">,
): Promise<string[]> {
  const proposees = await dep.failleJuridique.findMany({
    where: { id: { in: [...FAILLES_PACK_ACTIVES] }, statut: "PROPOSEE" },
    select: { id: true, regle: true, templateLettre: true },
  });
  // Double filtre (défense en profondeur) : jamais un id hors pack, même si la
  // requête ci-dessus est un jour réécrite.
  const packIds = new Set<string>(FAILLES_PACK_ACTIVES);
  const activables = proposees.filter(
    (f) => packIds.has(f.id) && estActivable(f),
  );
  if (activables.length > 0) {
    await dep.failleJuridique.updateMany({
      where: { id: { in: activables.map((f) => f.id) }, statut: "PROPOSEE" },
      data: { statut: "ACTIVE" },
    });
  }
  return activables.map((f) => f.id);
}
