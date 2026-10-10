// Questionnaire ciblé dynamique (N1/N2) — source UNIQUE des questions posées
// au client après le scan, des clés écrites dans `extractedData` et des
// libellés montrés au juriste.
//
// Garde-fou produit : une question n'est qu'un **capteur de fait**. Elle écrit
// du contexte (transmis au juriste) et peut déclencher une preuve externe
// (N2 : météo / travaux) — elle ne fabrique JAMAIS un fondement. Le moteur ne
// sélectionne que des `FailleJuridique` ACTIVE (FAILLES.md §B).
//
// L'affichage dépend de la **nature du document** (texte OCR scanné) et du
// **sous-type** (`docType` : 3F vs 48SI — questions dérivées des failles du
// pack), jamais des règles des failles : un groupe vide est impossible par
// construction (échec du questionnaire dynamique du 2026-10-01, FAILLES.md §B).

import { lireDocType, type DocTypeAnalyse } from "./envoi";
import type { InfractionType } from "./envoi";
import type { ExtractedData } from "./moteur";
import type { TypePreuveExterne } from "./preuves-api";

/** Preuves externes que la réponse peut rendre pertinentes (N2). */
export type PreuveCible = TypePreuveExterne;

/** Pièces que le **client** peut apporter lui-même quand la réponse est cochée. */
export type PreuveClient =
  | "RELEVE_PAIEMENT"
  | "ATTESTATION_CESSION"
  | "ATTESTATION_VOL"
  | "COPIE_DECISION"
  | "RELEVE_POINTS"
  | "ATTESTATION_STAGE";

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
  | "suspRefereEngage"
  | "suspSignataireNonPrefet"
  | "suspPrecedentsNonRecapitules"
  | "suspPointsCumulesJour"
  | "suspStageAvantNotif"
  | "suspSoldeInexact"
  // Chantier 2 (2026-10-10) — urgence professionnelle (référé L. 521-2).
  | "urgencePro"
  | "siret";

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
  /** Sous-type du document (3F / 48SI) — absent = tous les types. */
  docTypes?: readonly DocTypeAnalyse[];
  /** La réponse rend pertinente ce type de preuve externe (N2). */
  preuve?: PreuveCible;
  /** La réponse appelle une pièce que le **client** ajoute lui-même. */
  preuveClient?: PreuveClient;
  /** Type de champ rendu dans le formulaire — défaut : case à cocher.
   * `"texte"` = saisie libre (ex. SIRET — jamais pré-remplie par l'OCR). */
  typeChamp?: "case" | "texte";
};

export const QUESTIONS_CIBLEES: readonly QuestionCiblee[] = [
  // ── AMENDE ────────────────────────────────────────────────────────────────
  {
    cle: "paiementDejaFait",
    champ: "paiementDejaFait",
    libelle: "J'ai déjà payé cette amende",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
    preuveClient: "RELEVE_PAIEMENT",
  },
  {
    cle: "vehiculeCede",
    champ: "vehiculeCede",
    libelle: "Mon véhicule a été cédé avant la date de l'infraction",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
    preuveClient: "ATTESTATION_CESSION",
  },
  {
    cle: "vehiculeVole",
    champ: "vehiculeVole",
    libelle: "Mon véhicule était volé ou sa plaque usurpée à cette date",
    groupe: "Contexte (questionnaire ciblé)",
    types: ["AMENDE"],
    preuveClient: "ATTESTATION_VOL",
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

  // ── SUSPENSION — 3F (arrêté préfectoral) ─────────────────────────────────
  // Questions dérivées des failles pack 3F : elles captent les faits que
  // l'OCR ne lit pas (signataire de l'arrêté) et corroborent celles qu'il lit
  // (délai de notification, motivation) — jamais un fondement inventé.
  {
    cle: "suspSignataireNonPrefet",
    champ: "suspSignataireNonPrefet",
    libelle:
      "L'arrêté n'est pas signé par le préfet mais par un autre signataire (secrétaire général, sous-préfet)",
    groupe: "Arrêté préfectoral (3F)",
    types: ["SUSPENSION"],
    docTypes: ["3F"],
    preuveClient: "COPIE_DECISION",
  },

  // ── SUSPENSION — 48SI (invalidation solde nul) ───────────────────────────
  // Dérivées des failles 48SI (défaut d'information L. 223-3, plafond de
  // 8 points, stage avant notification) : chaque question corrobore le fait
  // que la règle de détection lit dans le document.
  {
    cle: "suspPrecedentsNonRecapitules",
    champ: "suspPrecedentsNonRecapitules",
    libelle:
      "La décision ne détaille pas les retraits de points antérieurs ayant conduit au solde nul",
    groupe: "Calcul du solde de points (48 SI)",
    types: ["SUSPENSION"],
    docTypes: ["48SI"],
    preuveClient: "COPIE_DECISION",
  },
  {
    cle: "suspPointsCumulesJour",
    champ: "suspPointsCumulesJour",
    libelle:
      "Plusieurs infractions ont été commises le même jour (cumul de retraits de points)",
    groupe: "Calcul du solde de points (48 SI)",
    types: ["SUSPENSION"],
    docTypes: ["48SI"],
    preuveClient: "RELEVE_POINTS",
  },
  {
    cle: "suspStageAvantNotif",
    champ: "suspStageAvantNotif",
    libelle:
      "J'ai suivi un stage de sensibilisation AVANT la notification de cette décision",
    groupe: "Calcul du solde de points (48 SI)",
    types: ["SUSPENSION"],
    docTypes: ["48SI"],
    preuveClient: "ATTESTATION_STAGE",
  },
  {
    cle: "suspSoldeInexact",
    champ: "suspSoldeInexact",
    libelle:
      "Je conteste le nombre de points restants / le calcul du solde affiché",
    groupe: "Calcul du solde de points (48 SI)",
    types: ["SUSPENSION"],
    docTypes: ["48SI"],
    preuveClient: "RELEVE_POINTS",
  },

  // ── SUSPENSION — 3F/48SI — urgence professionnelle (chantier 2, 2026-10-10)
  // Capteurs de fait pour le référé d'urgence (art. L. 521-2 CJA) : ils
  // contextualisent la demande de suspension de la mesure, jamais un fondement
  // supplémentaire. Même groupe, sans cascade (le SIRET reste facultatif).
  {
    cle: "urgencePro",
    champ: "urgencePro",
    libelle:
      "La mesure de suspension/invalidation met en péril mon activité professionnelle (licenciement, revenus, emploi)",
    groupe: "Urgence professionnelle",
    types: ["SUSPENSION"],
    docTypes: ["3F", "48SI"],
  },
  {
    cle: "siret",
    champ: "siret",
    libelle: "SIRET de mon entreprise (facultatif — s'il m'en reste un)",
    groupe: "Urgence professionnelle",
    types: ["SUSPENSION"],
    docTypes: ["3F", "48SI"],
    typeChamp: "texte",
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
 * Questions à afficher pour un dossier : filtrées sur le type d'infraction,
 * sur la **nature du document** (texte) et sur le **sous-type** (`docType` :
 * 3F vs 48SI — lu via `lireDocType`, inconnu = aucune question spécifique).
 * Les groupes sont regroupés dans l'ordre du registre et **un groupe vide
 * n'est jamais retourné**.
 */
export function questionsPour(opts: {
  type: InfractionType;
  texte?: string | null;
  docType?: string | null;
}): GroupeQuestions[] {
  const natures = naturesPv(opts.texte);
  const docType = lireDocType(opts.docType);
  const groupes = new Map<string, QuestionCiblee[]>();
  for (const q of QUESTIONS_CIBLEES) {
    if (!q.types.includes(opts.type)) continue;
    if (q.natures && !q.natures.some((n) => natures.has(n))) continue;
    if (q.docTypes && (!docType || !q.docTypes.includes(docType))) continue;
    const liste = groupes.get(q.groupe);
    if (liste) liste.push(q);
    else groupes.set(q.groupe, [q]);
  }
  return Array.from(groupes, ([groupe, questions]) => ({ groupe, questions }));
}

/**
 * Lit les réponses du questionnaire dans le FormData — seules les clés du
 * registre sont lues (ajouter une question = toucher le registre, pas l'action).
 * Une case non cochée n'écrit rien (jamais de `false` inutile en base) ; un
 * champ texte vide n'écrit rien non plus.
 */
export function lireReponses(fd: FormData): Partial<ExtractedData> {
  const out: Partial<ExtractedData> = {};
  // Écriture via index string : TypeScript n'accepte pas l'affectation d'un
  // type large sur une clé union (`out[q.champ]` exigerait l'intersection).
  const cible = out as Record<string, ExtractedData[ChampReponse]>;
  for (const q of QUESTIONS_CIBLEES) {
    if (q.typeChamp === "texte") {
      const brut = fd.get(q.cle);
      if (typeof brut === "string" && brut.trim()) {
        cible[q.champ] = brut.trim();
      }
    } else if (fd.get(q.cle) === "on") {
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

export type PreuveSuggestionClient = { type: PreuveClient; raison: string };

/**
 * Pièces suggérées au client d'après ses réponses cochées — la réponse appelle
 * la pièce qui la corrobore (règle capteur de fait : une suggestion n'est
 * jamais un fondement). `typesPresents` masque une pièce déjà versée au
 * dossier. Fonction pure, testée.
 */
export function suggestionsPreuvesClient(
  reponses: Partial<ExtractedData> | Record<string, unknown> | null | undefined,
  typesPresents?: Iterable<string>,
): PreuveSuggestionClient[] {
  if (!reponses) return [];
  const presents = new Set(typesPresents ?? []);
  const vus = new Set<PreuveClient>();
  const suggestions: PreuveSuggestionClient[] = [];
  for (const q of QUESTIONS_CIBLEES) {
    if (!q.preuveClient) continue;
    const valeur = reponses[q.champ];
    if (!(valeur === true || (typeof valeur === "string" && valeur !== ""))) {
      continue;
    }
    if (presents.has(q.preuveClient) || vus.has(q.preuveClient)) continue;
    vus.add(q.preuveClient);
    suggestions.push({ type: q.preuveClient, raison: q.libelle });
  }
  return suggestions;
}
