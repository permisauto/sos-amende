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
import type { ExtractedData, RegleDetection } from "./moteur";
import type { TypePreuveExterne } from "./preuves-api";

/** Preuves externes que la réponse peut rendre pertinentes (N2). */
export type PreuveCible = TypePreuveExterne;

/** Pièces que le **client** peut apporter lui-même quand la réponse est cochée.
 * Liste runtime exportée (`PREUVE_CLIENT_TYPES`) : la whitelist serveur de
 * téléversement (`ajouterPreuve`) s'y réfère — un type suggéré mais absent de
 * cette liste serait silencieusement stocké « AUTRE » (type perdu). */
export const PREUVE_CLIENT_TYPES = [
  "RELEVE_PAIEMENT",
  "ATTESTATION_CESSION",
  "ATTESTATION_VOL",
  "COPIE_DECISION",
  "RELEVE_POINTS",
  "ATTESTATION_STAGE",
  "KBIS",
  // Lot R2 — pièces d'urgence par situation (radio « Votre urgence »).
  "CONTRAT_TRAVAIL",
  "ATTESTATION_EMPLOYEUR",
  "BILAN_COMMANDES",
  "JUSTIFICATIF_DOMICILE",
  "HORAIRES_TRANSPORTS",
  "CERTIFICAT_MEDICAL_PROCHE",
  "ATTESTATION_HONNEUR",
  // Lot R3 — pièces des questions amende (cliché radar, marquage stationnement).
  "CLICHE_ANTAI",
  "PHOTO_MARQUAGE",
  // Veille 2.0 — pièce dont l'intitulé vient du catalogue (IA) quand aucun
  // type existant ne correspond : libellé générique, la raison portée par la
  // suggestion nomme la pièce réellement demandée.
  "PIECE_LIBRE",
] as const;

export type PreuveClient = (typeof PREUVE_CLIENT_TYPES)[number];

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
  // Lot R3 (2026-10-11) — questions amende : cliché ambigu, marquage effacé
  // (capteurs de fait pour les failles catalogue existantes
  // `faille-photo-illisible` et `faille-stationnement-panneau`).
  | "clicheDeuxVehicules"
  | "marquageEfface"
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
  // `metier`/`entreprise`/`risque_licenciement` sont capturés par les champs
  // en dur du formulaire (`analyseSchema`), pas par le registre — éviter les
  // doublons de nom de champ. Lot R1 : la case `urgencePro` a été remplacée
  // par le radio `urgenceSituation` (pose `urgencePro` implicitement).
  | "urgenceSituation"
  | "siret"
  // Lot 5 (2026-10-10) — enclavement du domicile (référé L. 521-2).
  | "domicileEnclave";

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
   * `"texte"` = saisie libre (ex. SIRET — jamais pré-remplie par l'OCR) ;
   * `"radio"` = choix unique parmi `options` (lot R1). */
  typeChamp?: "case" | "texte" | "radio";
  /** Options d'un champ radio (valeur = clé écrite dans `extractedData`). */
  options?: readonly { valeur: string; libelle: string }[];
  /** Pièces appelées par option d'un radio (lot R2 : chaque situation a ses
   * preuves — suggestions non bloquantes, même mécanisme que `preuveClient`). */
  preuvesOption?: Partial<Record<string, readonly PreuveClient[]>>;
  /** Libellé court pour l'affichage juriste (défaut : `libelle`, la question). */
  libAffichage?: string;
  /** Note affichée sous la question (question dynamique du catalogue :
   * intitulé + argument de la pièce, texte libre issu de l'extraction —
   * remplace le libellé statique de `preuveClient` quand présent). */
  notePreuve?: string;
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
    cle: "marquageEfface",
    champ: "marquageEfface",
    libelle:
      "La peinture de délimitation de la place était effacée ou invisible",
    groupe: "Stationnement",
    types: ["AMENDE"],
    natures: ["stationnement"],
    preuveClient: "PHOTO_MARQUAGE",
  },
  {
    cle: "clicheDeuxVehicules",
    champ: "clicheDeuxVehicules",
    libelle:
      "Sur le cliché du contrôle, deux véhicules figurent sur la même ligne de mesure",
    groupe: "Contrôle radar (cliché)",
    types: ["AMENDE"],
    natures: ["radar"],
    // Le cliché reçu (photo du flash) est la pièce qui corrobore le fait —
    // le juriste confirme alors `faille-photo-illisible` (catalogue).
    preuveClient: "CLICHE_ANTAI",
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

  // ── SUSPENSION — urgence (chantier 2, 2026-10-10 — structuré R1, 2026-10-11)
  // Capteurs de fait pour le référé d'urgence (art. L. 521-2 CJA) : ils
  // contextualisent la demande de suspension de la mesure, jamais un fondement
  // supplémentaire. Lot R1 : choix unique de la situation principale (radio) —
  // toute option pose `urgencePro = true` (déclencheur pack référé inchangé) ;
  // l'option `enclavement` pose aussi `domicileEnclave` (capteur lot 5 réutilisé,
  // pas de double question). Affiché pour toute SUSPENSION (pas de filtre
  // docType : le référé est pertinent y compris pour une suspension de droit
  // commun — garde-fou R0).
  {
    cle: "urgenceSituation",
    champ: "urgenceSituation",
    libelle:
      "Quelle est la situation principale qui rend votre permis indispensable au quotidien ?",
    libAffichage: "Situation d'urgence",
    groupe: "Votre urgence",
    types: ["SUSPENSION"],
    typeChamp: "radio",
    options: [
      {
        valeur: "salarie",
        libelle: "Salarié / Cadre — je risque de perdre mon emploi",
      },
      {
        valeur: "artisan",
        libelle:
          "Artisan / Indépendant / Dirigeant — je risque de perdre mon chiffre d'affaires",
      },
      {
        valeur: "enclavement",
        libelle: "Lieu isolé — sans voiture, aucun transport en commun",
      },
      {
        valeur: "medical",
        libelle:
          "Je transporte un proche malade — sans voiture, impossible de l'emmener chez le médecin",
      },
    ],
    // Pièces d'urgence par situation (lot R2) : l'extrait Kbis reste porté par
    // la question `siret` (déclenché par la saisie, pas par le choix).
    preuvesOption: {
      salarie: ["CONTRAT_TRAVAIL", "ATTESTATION_EMPLOYEUR"],
      artisan: ["BILAN_COMMANDES"],
      enclavement: ["JUSTIFICATIF_DOMICILE", "HORAIRES_TRANSPORTS"],
      medical: ["CERTIFICAT_MEDICAL_PROCHE", "ATTESTATION_HONNEUR"],
    },
  },
  {
    cle: "siret",
    champ: "siret",
    libelle: "SIRET de mon entreprise (facultatif — s'il m'en reste un)",
    groupe: "Votre urgence",
    types: ["SUSPENSION"],
    docTypes: ["3F", "48SI"],
    typeChamp: "texte",
    // Saisir un SIRET appelle la preuve qui corrobore l'existence de
    // l'entreprise : l'extrait Kbis, téléversable par le client (lot 4).
    preuveClient: "KBIS",
  },

  // ── SUSPENSION — enclavement du domicile (lot 5, 2026-10-10) ─────────────
  // Capteur de fait pour étayer l'urgence du référé (art. L. 521-2 CJA) : le
  // client déclare que son domicile est difficile d'accès (peu/pas de
  // transport en commun) — sans voiture, la suspension le pénalise
  // fortement. Déclaratif, aucune vérification trajet (arbitrage RGPD) et
  // aucun fondement automatique (invariant N3). Affiché pour toute suspension
  // (pas de filtre docType) : la difficulté d'accès est pertinente quel que
  // soit le motif de la mesure.
  {
    cle: "domicileEnclave",
    champ: "domicileEnclave",
    libelle:
      "Mon lieu de résidence est difficile d'accès (peu ou pas de transport en commun)",
    groupe: "Accès au domicile",
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
  /** Questions dynamiques du catalogue (failles ACTIVE veille 2.0) — déjà
   * filtrées par type par le chargeur serveur, ajoutées en dernier groupe. */
  dynamiques?: readonly QuestionDynamique[];
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
  const dyn = versQuestionsCiblees(opts.dynamiques ?? []);
  if (dyn.length) groupes.set(GROUPE_DYNAMIQUE, dyn);
  return Array.from(groupes, ([groupe, questions]) => ({ groupe, questions }));
}

/**
 * Lit les réponses du questionnaire dans le FormData — seules les clés du
 * registre sont lues (ajouter une question = toucher le registre, pas l'action).
 * Une case non cochée n'écrit rien (jamais de `false` inutile en base) ; un
 * champ texte vide n'écrit rien non plus.
 */
export function lireReponses(
  fd: FormData,
  dynamiques: readonly QuestionDynamique[] = [],
): Partial<ExtractedData> {
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
    } else if (q.typeChamp === "radio") {
      const brut = fd.get(q.cle);
      const val = typeof brut === "string" ? brut.trim() : "";
      // Jamais une valeur hors options (anti-fraude formulaire).
      if (val && q.options?.some((o) => o.valeur === val)) {
        cible[q.champ] = val;
        // Couplages R1 : toute situation pose le déclencheur pack référé
        // (`urgencePro` — badge juriste et génération inchangés) ; l'option
        // enclavement réutilise le capteur de fait du lot 5.
        if (q.champ === "urgenceSituation") {
          cible.urgencePro = true;
          if (val === "enclavement") cible.domicileEnclave = true;
        }
      }
    } else if (fd.get(q.cle) === "on") {
      cible[q.champ] = q.valeur ?? true;
    }
  }
  // Questions dynamiques du catalogue (veille 2.0) : mêmes règles que le
  // registre (case non cochée = rien, texte vide = rien) — clés = `q.id`.
  const dynCible = out as unknown as Record<string, unknown>;
  for (const q of dynamiques) {
    if (q.type === "TEXT") {
      const brut = fd.get(q.id);
      if (typeof brut === "string" && brut.trim()) dynCible[q.id] = brut.trim();
    } else if (fd.get(q.id) === "on") {
      dynCible[q.id] = true;
    }
  }
  return out;
}

/** Entrée d'affichage d'une réponse côté juriste (clé → phrase). */
export type LibelleReponse = {
  cle: ChampReponse;
  lib: string;
  options?: readonly { valeur: string; libelle: string }[];
};

/** Libellés des réponses pour l'affichage juriste (clé → phrase).
 * `lib` = libellé court (`libAffichage`) pour les radios (R1). */
export const LIBELLES_REPONSES: readonly LibelleReponse[] =
  QUESTIONS_CIBLEES.map((q) => ({
    cle: q.champ,
    lib: q.libAffichage ?? q.libelle,
    options: q.options,
  }));

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
  dynamiques: readonly QuestionDynamique[] = [],
): PreuveSuggestionClient[] {
  if (!reponses) return [];
  const presents = new Set(typesPresents ?? []);
  const vus = new Set<string>();
  const suggestions: PreuveSuggestionClient[] = [];
  for (const q of QUESTIONS_CIBLEES) {
    const valeur = reponses[q.champ];
    if (!(valeur === true || (typeof valeur === "string" && valeur !== ""))) {
      continue;
    }
    // Pièces appelées : `preuveClient` (case/texte) + `preuvesOption` (radio —
    // chaque situation a les siennes, lot R2). La raison du radio est le
    // libellé de l'option choisie, pas la question générique.
    const option =
      typeof valeur === "string"
        ? q.options?.find((o) => o.valeur === valeur)
        : undefined;
    const types: readonly PreuveClient[] = [
      ...(q.preuveClient ? [q.preuveClient] : []),
      ...(typeof valeur === "string" && q.preuvesOption?.[valeur]
        ? q.preuvesOption[valeur]
        : []),
    ];
    if (types.length === 0) continue;
    const raison = option ? option.libelle : q.libelle;
    for (const type of types) {
      const cle = type;
      if (presents.has(type) || vus.has(cle)) continue;
      vus.add(cle);
      suggestions.push({ type, raison });
    }
  }
  // Pièces des questions dynamiques (catalogue veille 2.0) : la raison nomme
  // l'intitulé demandé par l'IA + son argument ; dédup par type+raison (deux
  // questions peuvent appeler deux pièces de même type générique).
  for (const q of dynamiques) {
    const valeur = (reponses as Record<string, unknown> | null | undefined)?.[
      q.id
    ];
    if (!(valeur === true || (typeof valeur === "string" && valeur !== ""))) {
      continue;
    }
    for (const p of q.preuves) {
      const type = typePreuvePourIntitule(p.intitule);
      const raison = p.argument ? `${p.intitule} — ${p.argument}` : p.intitule;
      const cle = `${type}|${raison}`;
      if (presents.has(type) || vus.has(cle)) continue;
      vus.add(cle);
      suggestions.push({ type, raison });
    }
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// Veille 2.0 — questions dynamiques pré-rédigées par l'extraction (IA) et
// stockées sur la faille ACTIVE (`FailleJuridique.questionsDynamiques`).
//
// Invariants préservés : une question dynamique reste un **capteur de fait**
// (elle écrit dans `extractedData` et appelle une pièce — jamais un
// fondement) ; le moteur ne lit que `reglesDetection` (types additifs
// `reponseVrai`/`reponseFausse`/`reponseTexte` mappés depuis le déclencheur).
// Module pur — le chargement en base vit dans `questions-dyn.ts` (serveur).
// ---------------------------------------------------------------------------

export const GROUPE_DYNAMIQUE = "À vérifier (base juridique)";

export type QuestionDynamique = {
  /** Clé normalisée `^[a-z0-9_]{3,60}$` — champ FormData + clé
   * `extractedData` + `champ` de la règle moteur. */
  id: string;
  libelle: string;
  type: "BOOLEAN" | "TEXT";
  /** Déclencheur de la règle liée : `true` → `reponseVrai`, `false` →
   * `reponseFausse`, `"TEXT_PRESENT"` → `reponseTexte`. */
  declencheur: boolean | "TEXT_PRESENT";
  /** Pièce que le client peut joindre (1ʳᵉ pièce bornée par le parser IA). */
  preuves: { intitule: string; argument: string }[];
};

/**
 * Valide et borne une liste de questions brute (JSON `questionsDynamiques` ou
 * sortie IA) — défensif : jamais d'exception, tableau vide sur forme
 * inattendue, ids normalisés + dédup, longueurs bornées.
 */
export function normaliserQuestionsDynamiques(
  brut: unknown,
): QuestionDynamique[] {
  if (!Array.isArray(brut)) return [];
  const out: QuestionDynamique[] = [];
  const vus = new Set<string>();
  for (const item of brut) {
    if (out.length >= 6) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === "string"
        ? o.id
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 60)
        : "";
    if (id.length < 3 || vus.has(id)) continue;
    const libelle = typeof o.libelle === "string" ? o.libelle.trim() : "";
    if (libelle.length < 5 || libelle.length > 300) continue;
    const type: QuestionDynamique["type"] = o.type === "TEXT" ? "TEXT" : "BOOLEAN";
    const declencheur: QuestionDynamique["declencheur"] =
      o.declencheur === "TEXT_PRESENT"
        ? "TEXT_PRESENT"
        : o.declencheur === false
          ? false
          : true;
    const preuves: QuestionDynamique["preuves"] = [];
    if (Array.isArray(o.preuves)) {
      for (const p of o.preuves) {
        if (preuves.length >= 1) break; // 1ʳᵉ pièce seulement (borne IA)
        if (!p || typeof p !== "object") continue;
        const pp = p as Record<string, unknown>;
        const intitule =
          typeof pp.intitule === "string" ? pp.intitule.trim().slice(0, 200) : "";
        if (intitule.length < 3) continue;
        const argument =
          typeof pp.argument === "string" ? pp.argument.trim().slice(0, 500) : "";
        preuves.push({ intitule, argument });
      }
    }
    vus.add(id);
    out.push({ id, libelle, type, declencheur, preuves });
  }
  return out;
}

/** Pièce de catalogue → type de whitelist existant (mots-clés de l'intitulé),
 * sinon `PIECE_LIBRE` (jamais de type hors `PREUVE_CLIENT_TYPES` : la
 * whitelist serveur `ajouterPreuve` le stockerait « AUTRE » et perdrait le
 * type). */
export function typePreuvePourIntitule(intitule: string): PreuveClient {
  const t = intitule.toLowerCase();
  const regles: [RegExp, PreuveClient][] = [
    [/arrêt[ée]|d[ée]cision|pr[ée]fectorale|ordonnance/, "COPIE_DECISION"],
    [/relev[ée].{0,20}points|solde de points/, "RELEVE_POINTS"],
    [/employeur|contrat de travail/, "CONTRAT_TRAVAIL"],
    [/m[ée]dical|sant[ée]/, "CERTIFICAT_MEDICAL_PROCHE"],
    [/stage/, "ATTESTATION_STAGE"],
    [/kbis|siret/, "KBIS"],
    [/paiement/, "RELEVE_PAIEMENT"],
    [/cession/, "ATTESTATION_CESSION"],
    [/vol/, "ATTESTATION_VOL"],
    [/domicile/, "JUSTIFICATIF_DOMICILE"],
    [/transport/, "HORAIRES_TRANSPORTS"],
    [/honneur/, "ATTESTATION_HONNEUR"],
    [/commande|bilan/, "BILAN_COMMANDES"],
    [/clich[ée]|flash/, "CLICHE_ANTAI"],
    [/marquage/, "PHOTO_MARQUAGE"],
  ];
  for (const [motif, type] of regles) {
    if (motif.test(t)) return type;
  }
  return "PIECE_LIBRE";
}

/**
 * Fusionne plusieurs listes brutes de questions (JSON de failles ACTIVE)
 * en une seule liste bornée, déduplée par id — un id répété entre failles
 * garde la première définition (ordre de lecture stable).
 */
export function fusionnerQuestionsDynamiques(
  bruts: readonly unknown[],
): QuestionDynamique[] {
  const fusion: QuestionDynamique[] = [];
  const vus = new Set<string>();
  for (const brut of bruts) {
    if (fusion.length >= 12) break;
    for (const q of normaliserQuestionsDynamiques(brut)) {
      if (fusion.length >= 12) break;
      if (vus.has(q.id)) continue;
      vus.add(q.id);
      fusion.push(q);
    }
  }
  return fusion;
}

/** Conversion vers le format du registre (rendu formulaire + libellés). */
export function versQuestionsCiblees(
  dynamiques: readonly QuestionDynamique[],
): QuestionCiblee[] {
  return dynamiques.map((q) => {
    const base: QuestionCiblee = {
      cle: q.id,
      champ: q.id as unknown as ChampReponse,
      libelle: q.libelle,
      groupe: GROUPE_DYNAMIQUE,
      // Déjà filtrées par type côté chargeur : visibles des deux types pour
      // ne jamais vider le groupe.
      types: ["AMENDE", "SUSPENSION"],
      typeChamp: q.type === "TEXT" ? "texte" : "case",
    };
    const p = q.preuves[0];
    if (p) {
      return {
        ...base,
        preuveClient: typePreuvePourIntitule(p.intitule),
        notePreuve: p.argument
          ? `${p.intitule} — ${p.argument}`
          : p.intitule,
      };
    }
    return base;
  });
}

/** Libellés juriste des réponses dynamiques (fusionnés avec le registre). */
export function libellesPourDynamiques(
  dynamiques: readonly QuestionDynamique[],
): LibelleReponse[] {
  return dynamiques.map((q) => ({
    cle: q.id as unknown as ChampReponse,
    lib: q.libelle,
  }));
}

/**
 * Règles de détection moteur mappées depuis les déclencheurs des questions —
 * un type additif par question (`reponseVrai` / `reponseFausse` /
 * `reponseTexte`), combinées en OU par le moteur (sémantique standard d'une
 * même faille).
 */
export function reglesDetectionPourQuestions(
  dynamiques: readonly QuestionDynamique[],
): RegleDetection[] {
  const regles: RegleDetection[] = [];
  for (const q of dynamiques) {
    if (q.type === "TEXT") {
      regles.push({ type: "reponseTexte", champ: q.id });
    } else if (q.declencheur === false) {
      regles.push({ type: "reponseFausse", champ: q.id });
    } else {
      // `true` et `"TEXT_PRESENT"` sur une case : la réponse avérée est « oui ».
      regles.push({ type: "reponseVrai", champ: q.id });
    }
  }
  return regles;
}
