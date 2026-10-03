// Questionnaire ciblé dynamique (N1/N2) — source UNIQUE des questions posées
// au client après le scan, des clés écrites dans `extractedData` et des
// libellés montrés au juriste.
//
// Garde-fou produit : une question n'est qu'un **capteur de fait**. Elle écrit
// du contexte (transmis au juriste) et peut déclencher une preuve externe
// (N2 : météo / travaux) — elle ne fabrique JAMAIS un fondement. Le moteur ne
// sélectionne que des `FailleJuridique` ACTIVE (FAILLES.md §B).
//
// L'affichage dépend de la **nature du document** (texte OCR scanné), jamais
// des règles des failles : un groupe vide est impossible par construction
// (échec du questionnaire dynamique du 2026-10-01, FAILLES.md §B).

import type { InfractionType } from "./envoi";
import type { ExtractedData } from "./moteur";
import type { TypePreuveExterne } from "./preuves-api";

/** Preuves externes que la réponse peut rendre pertinentes (N2). */
export type PreuveCible = TypePreuveExterne;

/** Nature du document détectée dans le texte scanné. */
export type Nature = "stationnement" | "travaux" | "radar" | "visibilite" | "alcool";

/** Champs d'`extractedData` écrits par le questionnaire. */
export type ChampReponse =
  | "paiementDejaFait"
  | "vehiculeCede"
  | "vehiculeVole"
  | "conducteurDifferent"
  | "adresseIncorrecte"
  | "travaux_présents"
  | "conditions_meteo"
  | "stationnementPanneau"
  | "stationnementGene"
  | "stationnementTicket"
  | "stationnementLieu"
  | "suspNotifIrreguliere"
  | "suspDelaiNotification"
  | "suspMotifsAbsents"
  | "suspObservations"
  | "suspEthylometreCarnet"
  | "suspSecondSouffle"
  | "suspRefereEngage";

export type QuestionCiblee = {
  /** Nom du champ dans le formulaire (FormData). */
  cle: string;
  /** Clé écrite dans `extractedData`. */
  champ: ChampReponse;
  /** Valeur écrite si la case est cochée (défaut `true`). */
  valeur?: string | boolean;
  libelle: string;
  groupe: string;
  types: readonly InfractionType[];
  /** Le groupe n'apparaît que si le texte du document correspond. */
  natures?: readonly Nature[];
  /** La réponse rend pertinente ce type de preuve externe (N2). */
  preuve?: PreuveCible;
};

export const QUESTIONS_CIBLEES: readonly QuestionCiblee[] = [
  // ── AMENDE ────────────────────────────────────────────────────────────────
  {
    cle: "paiementDejaFait",
    champ: "paiementDejaFait",
    libelle: "J'ai déjà payé cette amende",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
  },
  {
    cle: "vehiculeCede",
    champ: "vehiculeCede",
    libelle: "Mon véhicule a été cédé avant la date de l'infraction",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
  },
  {
    cle: "vehiculeVole",
    champ: "vehiculeVole",
    libelle: "Mon véhicule était volé ou sa plaque usurpée à cette date",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
  },
  {
    cle: "conducteurDifferent",
    champ: "conducteurDifferent",
    libelle: "Un autre conducteur était au volant",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
  },
  {
    cle: "adresseIncorrecte",
    champ: "adresseIncorrecte",
    libelle: "L'adresse indiquée sur l'avis n'est pas la bonne",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
  },
  {
    cle: "stationnementPanneau",
    champ: "stationnementPanneau",
    libelle:
      "Il n'y avait aucun panneau ni arrêté de stationnement visible à cet endroit",
    groupe: "Stationnement",
    types: ["AMENDE"],
    natures: ["stationnement"],
  },
  {
    cle: "stationnementGene",
    champ: "stationnementGene",
    libelle:
      "Des travaux ou une gêne temporaire m'empêchaient de me garer à cet endroit",
    groupe: "Stationnement",
    types: ["AMENDE"],
    natures: ["stationnement"],
    preuve: "TRAVAUX",
  },
  {
    cle: "stationnementTicket",
    champ: "stationnementTicket",
    libelle: "Je n'avais ni ticket ni abonnement de stationnement valide",
    groupe: "Stationnement",
    types: ["AMENDE"],
    natures: ["stationnement"],
  },
  {
    cle: "stationnementLieu",
    champ: "stationnementLieu",
    libelle:
      "L'endroit indiqué sur l'avis n'est pas celui où se trouvait mon véhicule",
    groupe: "Stationnement",
    types: ["AMENDE"],
    natures: ["stationnement"],
  },
  {
    cle: "travaux_présents",
    champ: "travaux_présents",
    libelle:
      "Des travaux avec signalisation temporaire étaient en cours à cet endroit",
    groupe: "Travaux et signalisation",
    types: ["AMENDE"],
    natures: ["travaux"],
    preuve: "TRAVAUX",
  },
  {
    cle: "conditions_meteo",
    champ: "conditions_meteo",
    valeur: "Pluie",
    libelle: "La visibilité était réduite (pluie, brouillard, nuit)",
    groupe: "Visibilité",
    types: ["AMENDE"],
    natures: ["radar", "visibilite"],
    preuve: "METEO",
  },

  // ── SUSPENSION ────────────────────────────────────────────────────────────
  {
    cle: "suspNotifIrreguliere",
    champ: "suspNotifIrreguliere",
    libelle:
      "La décision m'est parvenue ni par recommandé ni en main propre (courrier simple ou avis de passage)",
    groupe: "Notification de la décision",
    types: ["SUSPENSION"],
  },
  {
    cle: "suspDelaiNotification",
    champ: "suspDelaiNotification",
    libelle:
      "Plus de 3 jours se sont écoulés entre le contrôle et la réception de la décision",
    groupe: "Notification de la décision",
    types: ["SUSPENSION"],
  },
  {
    cle: "suspMotifsAbsents",
    champ: "suspMotifsAbsents",
    libelle: "La décision ne détaille ni les faits ni les articles reprochés",
    groupe: "Notification de la décision",
    types: ["SUSPENSION"],
  },
  {
    cle: "suspObservations",
    champ: "suspObservations",
    libelle:
      "Je n'ai pas été mis en mesure de présenter des observations avant la décision",
    groupe: "Notification de la décision",
    types: ["SUSPENSION"],
  },
  {
    cle: "suspEthylometreCarnet",
    champ: "suspEthylometreCarnet",
    libelle:
      "Je n'ai pas reçu le procès-verbal avec les certificats de vérification de l'éthylomètre",
    groupe: "Alcool / stupéfiants",
    types: ["SUSPENSION"],
    natures: ["alcool"],
  },
  {
    cle: "suspSecondSouffle",
    champ: "suspSecondSouffle",
    libelle:
      "Je n'ai pas bénéficié du « second souffle » pour repasser l'examen",
    groupe: "Alcool / stupéfiants",
    types: ["SUSPENSION"],
    natures: ["alcool"],
  },
  {
    cle: "suspRefereEngage",
    champ: "suspRefereEngage",
    libelle: "J'ai déjà formé un référé-suspension ou des observations",
    groupe: "Recours engagés",
    types: ["SUSPENSION"],
  },
];

const MOTIFS_NATURE: Record<Nature, RegExp> = {
  stationnement:
    /stationn|zone bleue|place de stationnement|stationnement r[eé]sidentiel/i,
  travaux: /travaux|chantier|signalisation temporaire|d[eé]viation/i,
  radar: /radar|km\/h|exc[eè]s de vitesse|limite de vitesse/i,
  visibilite: /pluie|brouillard|verglas|orage|nuit|visibilit/i,
  alcool: /alcool|éthylom|éthylot|stup[ée]fiant|gobelet/i,
};

/** Natures détectées dans le texte du document (OCR + champs saisis). */
export function naturesPv(
  ...textes: readonly (string | null | undefined)[]
): Set<Nature> {
  const brut = textes.filter(Boolean).join("\n").toLowerCase();
  const trouvees = new Set<Nature>();
  if (!brut) return trouvees;
  for (const [nature, motif] of Object.entries(MOTIFS_NATURE) as [
    Nature,
    RegExp
  ][]) {
    if (motif.test(brut)) trouvees.add(nature);
  }
  return trouvees;
}

export type GroupeQuestions = { groupe: string; questions: QuestionCiblee[] };

/**
 * Questions à afficher pour un dossier : filtrées sur le type d'infraction et
 * sur la nature du document. Les groupes sont regroupés dans l'ordre du
 * registre et **un groupe vide n'est jamais retourné**.
 */
export function questionsPour(opts: {
  type: InfractionType;
  texte?: string | null;
}): GroupeQuestions[] {
  const natures = naturesPv(opts.texte);
  const groupes = new Map<string, QuestionCiblee[]>();
  for (const q of QUESTIONS_CIBLEES) {
    if (!q.types.includes(opts.type)) continue;
    if (q.natures && !q.natures.some((n) => natures.has(n))) continue;
    const liste = groupes.get(q.groupe);
    if (liste) liste.push(q);
    else groupes.set(q.groupe, [q]);
  }
  return Array.from(groupes, ([groupe, questions]) => ({ groupe, questions }));
}

/**
 * Lit les cases cochées du questionnaire dans le FormData — seules les clés du
 * registre sont lues (ajouter une question = toucher le registre, pas l'action).
 * Une case non cochée n'écrit rien (jamais de `false` inutile en base).
 */
export function lireReponses(fd: FormData): Partial<ExtractedData> {
  const out: Partial<ExtractedData> = {};
  // Écriture via index string : TypeScript n'accepte pas l'affectation d'un
  // type large sur une clé union (`out[q.champ]` exigerait l'intersection).
  const cible = out as Record<string, ExtractedData[ChampReponse]>;
  for (const q of QUESTIONS_CIBLEES) {
    if (fd.get(q.cle) === "on") {
      cible[q.champ] = q.valeur ?? true;
    }
  }
  return out;
}

/** Libellés des réponses pour l'affichage juriste (clé → phrase). */
export const LIBELLES_REPONSES: readonly {
  cle: ChampReponse;
  lib: string;
}[] = QUESTIONS_CIBLEES.map((q) => ({ cle: q.champ, lib: q.libelle }));

/** Types de preuves externes rendus pertinents par des réponses cochées (N2). */
export function preuvesPourReponses(
  reponses: Partial<ExtractedData>,
): Set<PreuveCible> {
  const types = new Set<PreuveCible>();
  for (const q of QUESTIONS_CIBLEES) {
    if (!q.preuve) continue;
    const valeur = reponses[q.champ];
    if (valeur === true || (typeof valeur === "string" && valeur !== "")) {
      types.add(q.preuve);
    }
  }
  return types;
}
