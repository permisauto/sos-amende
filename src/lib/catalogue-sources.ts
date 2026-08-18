// Catalogue des fondements juridiques issus de la recherche documentaire sur
// sources publiques (voir FAILLES.md §H). Utilisé par l'auto-alimentation :
// `importerFaillesDepuisSources` (admin) les insère en statut PROPOSEE — le
// moteur ne les utilise JAMAIS tant que l'admin ne les a pas validées (ACTIVE).
//
// Garde-fou : `verifiee` reste false tant qu'un juriste n'a pas confirmé la
// référence sur une source primaire (Judilibre / Legifrance). Une proposition
// avec une jurisprudence non vérifiée doit être écartée à la validation.

export type JurisprudenceRef = {
  reference: string; // ex. "Cass. crim., 12 janvier 2026, n° 25-80.412"
  juridiction: string; // "Cour de cassation" | "Conseil d'État" | ...
  date?: string | null; // ISO yyyy-mm-dd (facultatif)
  url?: string | null;
  verifiee: boolean; // confirmée sur source primaire par un juriste
};

export type FailleSourcee = {
  id: string;
  typeInfraction: "AMENDE" | "SUSPENSION";
  titreFaille: string;
  articleLoi: string;
  source: string;
  reglesDetection: unknown[];
  jurisprudence: JurisprudenceRef[];
  templateLettre: string;
};

/**
 * Propositions issues de la recherche documentaire (FAILLES.md §H). Chaque
 * entrée porte une jurisprudence sourcée — dont le drapeau `verifiee` doit
 * être confirmé par le juriste avant activation.
 */
export const CATALOGUE_SOURCES: FailleSourcee[] = [
  {
    id: "faille-avis-majoration-non-notifiee",
    typeInfraction: "AMENDE",
    titreFaille:
      "Amende majorée reçue sans avis de contravention préalable (défaut de notification)",
    articleLoi:
      "art. 530 et 529-2 du Code de procédure pénale",
    source: "Legifrance (articles) ; justice.fr",
    reglesDetection: [{ type: "texteContient", motif: "majorée" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 29 octobre 1997, Bull. crim. n° 357",
        juridiction: "Cour de cassation",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000007068889",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste le titre de perception (amende majorée) qui m'est notifié concernant l'avis de contravention n° {num_pv}, d'un montant de {montant}.

Je n'ai jamais reçu l'avis de contravention initial correspondant à cette infraction : celui-ci ne m'a pas été notifié personnellement ni à mon domicile avant l'application de la majoration.

En application des articles 529-2 et 530 du Code de procédure pénale, l'amende forfaitaire majorée ne peut être mise en recouvrement que si l'avis de contravention initial a été régulièrement notifié et demeurait impayé à l'expiration du délai légal. À défaut de notification préalable, la majoration ne peut être valablement appliquée.

Je demande en conséquence l'annulation de la majoration et la restitution de l'amende au montant forfaitaire initial.`,
  },
  {
    id: "faille-avis-inapplicable-procedure",
    typeInfraction: "AMENDE",
    titreFaille:
      "Nullité de l'avis : procédure d'amende forfaitaire inapplicable (infraction concomitante non forfaitisable)",
    articleLoi: "art. 529 du Code de procédure pénale",
    source: "query-juriste.com ; kohenavocats.com (lien courdecassation.fr)",
    reglesDetection: [
      { type: "texteContient", motif: "sans avertissement préalable" },
    ],
    jurisprudence: [
      {
        reference: "Cass. crim., 30 avril 2024, n° 23-86.163",
        juridiction: "Cour de cassation",
        url: "https://decisions.query-juriste.com/decisions/cour-de-cassation-30-avril-2024-23-86-163-23-86-163.html",
        verifiee: false,
      },
      {
        reference: "Cass. crim., 18 novembre 2025, n° 25-80.227",
        juridiction: "Cour de cassation",
        url: "https://www.courdecassation.fr/decision/691c4c158b6588a4f898c792",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} établi à mon encontre.

Cet avis a été établi par la procédure de l'amende forfaitaire alors que les conditions légales de cette procédure n'étaient pas réunies : l'infraction aurait dû donner lieu à une procédure contraventionnelle classique (procès-verbal constaté personnellement), et non à une amende forfaitaire, en raison d'une infraction concomitante non forfaitisable.

En application de l'article 529 du Code de procédure pénale, l'action de l'administration n'a pas été exercée selon la procédure prévue par la loi. L'avis est donc entaché de nullité.

Je demande en conséquence l'annulation de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-exoneration-vol-usurpation",
    typeInfraction: "AMENDE",
    titreFaille:
      "Vol / usurpation de plaque / cession : recevabilité de la requête en exonération (pièces justificatives)",
    articleLoi:
      "art. 529-10 du Code de procédure pénale ; art. L. 317-4-1 du Code de la route",
    source: "Legifrance (art. 529-10) ; conseil-etat.fr (CE 9 juil. 2010 n° 339261)",
    reglesDetection: [{ type: "texteContient", motif: "vol" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 9 juillet 2010, n° 339261",
        juridiction: "Conseil d'État",
        url: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2010-07-09/339261",
        verifiee: false,
      },
      {
        reference: "Cons. const., 29 septembre 2010, n° 2010-38 QPC",
        juridiction: "Conseil constitutionnel",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000022884221",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} relatif au véhicule portant la plaque {plaque}.

Je n'étais pas le conducteur de ce véhicule au moment des faits : le véhicule était [volé / cédé / utilisé sans mon accord] à la date de l'infraction. Vous trouverez en pièce jointe les justificatifs [récépissé de plainte / certificat de cession] en ma possession.

En application de l'article 529-10 du Code de procédure pénale, la requête en exonération est recevable lorsque le titulaire du certificat d'immatriculation établit qu'il n'est pas l'auteur de l'infraction, notamment en cas de vol, d'usurpation de plaque ou de cession du véhicule.

Je demande en conséquence l'exonération de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-usurpation-plaque",
    typeInfraction: "AMENDE",
    titreFaille:
      "Usurpation de plaque d'immatriculation (délit) — récépissé de plainte",
    articleLoi: "art. L. 317-4-1 du Code de la route",
    source: "Code de la route (à confirmer sur Legifrance)",
    reglesDetection: [{ type: "texteContient", motif: "usurpation" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} relatif au véhicule portant la plaque {plaque}.

Cette plaque a été utilisée sans mon autorisation : je ne suis pas l'auteur de l'infraction constatée. Une plainte pour usurpation de plaque d'immatriculation a été déposée ; vous trouverez le récépissé en pièce jointe.

L'usurpation de plaque d'immatriculation constitue une infraction spécifique (article L. 317-4-1 du Code de la route) et me place dans une situation où je ne peux être tenu pour responsable de l'infraction commise par un tiers.

Je demande en conséquence l'exonération de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-erreur-plaque-jurisprudence",
    typeInfraction: "AMENDE",
    titreFaille:
      "Erreur de plaque d'immatriculation — champ du contrôle des juges",
    articleLoi: "art. 530-1 du Code de procédure pénale",
    source: "query-juriste.com",
    reglesDetection: [{ type: "plaqueIncorrecte" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 14 novembre 2017, n° 17-81.047",
        juridiction: "Cour de cassation",
        url: "https://decisions.query-juriste.com/decisions/cour-de-cassation-14-novembre-2017-17-81-047-17-81-047.html",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv}.

La plaque d'immatriculation {plaque} mentionnée sur l'avis de contravention ne correspond pas au certificat d'immatriculation de mon véhicule : il s'agit d'une erreur matérielle de la part des services verbalisateurs.

Conformément à l'article 530-1 du Code de procédure pénale, l'exonération est demandée lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.

Je demande en conséquence l'exonération de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-etalonnage-jurisprudence",
    typeInfraction: "AMENDE",
    titreFaille:
      "Certificat d'étalonnage du cinémomètre (mise à jour de la jurisprudence)",
    articleLoi:
      "art. L. 130-3 du Code de la route ; art. R. 130-11 du Code de la route",
    source: "contraventionavocat.fr (blog) ; legifrance",
    reglesDetection: [{ type: "etalonnageExpire" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 12 janvier 2026, n° 25-80.412",
        juridiction: "Cour de cassation",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule portant la plaque {plaque}, conteste l'avis de contravention n° {num_pv} établi au moyen du cinémomètre n° {radarId}.

En application de l'article L. 130-3 du Code de la route et de l'article R. 130-11 du même code, la mesure de vitesse doit être effectuée par un appareil soumis à une vérification périodique effectuée par un organisme agréé. Le certificat d'étalonnage du cinémomètre utilisé devait être valable à la date de l'infraction.

Je demande la communication du certificat d'étalonnage de l'appareil n° {radarId} valable à la date des faits, sous un délai de 30 jours. À défaut de production de ce certificat, l'amende doit être annulée.`,
  },
  {
    id: "faille-suspension-sans-contradictoire",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Suspension de permis prononcée sans procédure contradictoire préalable (défaut de mise en demeure de présenter des observations)",
    articleLoi:
      "art. L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration ; art. L. 224-2 du Code de la route",
    source: "Légifrance (CE 20 avr. 2021 n° 438114, texte intégral) ; reinsdidier-avocat.com",
    reglesDetection: [{ type: "texteAbsent", motif: "observations" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 5e ch., 20 avril 2021, n° 438114 (Inédit)",
        juridiction: "Conseil d'État",
        date: "2021-04-20",
        url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000043411148",
        verifiee: false,
      },
      {
        reference: "Conseil d'État, 5e ch., 24 mai 2024, n° 474548 (Inédit)",
        juridiction: "Conseil d'État",
        date: "2024-05-24",
        url: null,
        verifiee: false,
      },
      {
        reference: "Conseil d'État, 7 décembre 2017, n° 407700",
        juridiction: "Conseil d'État",
        date: "2017-12-07",
        url: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2017-12-07/407700",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été prise sans que j'aie été mis(e) en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114 ; 24 mai 2024, n° 474548).

Je demande en conséquence le retrait de la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-marge-erreur-ethylometre",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Suspension pour alcoolémie prononcée sans prise en compte de la marge d'erreur de l'éthylomètre",
    articleLoi:
      "art. L. 224-2 et L. 234-1 du Code de la route ; art. 15 de l'arrêté du 8 juillet 2003 (marge d'erreur maximale tolérée 8 %)",
    source: "Légifrance (CE 14 févr. 2018 n° 407914) ; ledall-avocat.fr ; capital.fr",
    reglesDetection: [{ type: "texteContient", motif: "éthylomètre" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 14 février 2018, n° 407914",
        juridiction: "Conseil d'État",
        date: "2018-02-14",
        url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000036601993",
        verifiee: false,
      },
      {
        reference: "Cass. crim., 26 mars 2019, n° 18-94.900",
        juridiction: "Cour de cassation",
        date: "2019-03-26",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000038388467",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} du {date} par laquelle le préfet a suspendu mon permis de conduire pour conduite sous l'empire d'un état alcoolique.

La décision se fonde sur une mesure réalisée au moyen d'un éthylomètre sans prise en compte de la marge d'erreur maximale tolérée. En application des articles L. 224-2 et L. 234-1 du code de la route et de l'article 15 de l'arrêté du 8 juillet 2003, le préfet doit s'assurer que les seuils légaux ont été effectivement dépassés et, par suite, prendre en compte la marge d'erreur maximale tolérée de 8 %, sauf si le résultat communiqué tient déjà compte de cette marge (Conseil d'État, 14 février 2018, n° 407914).

Je demande en conséquence le retrait de la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-notification-irreguliere",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Décision de suspension non notifiée ou notification irrégulière (non opposable)",
    articleLoi:
      "art. L. 224-16 et R. 224-4 du Code de la route",
    source: "Légifrance (R. 224-1 à R. 224-4) ; ledall-avocat.fr",
    reglesDetection: [{ type: "texteAbsent", motif: "notifiée" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 1er avril 2021, n° 20-82.815 (notification exigée par l'article L. 224-16 du code de la route)",
        juridiction: "Cour de cassation",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000043426584",
        verifiee: false,
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} du {date} par laquelle le préfet a suspendu mon permis de conduire.

Cette décision ne m'a pas été régulièrement notifiée (remise directe ou lettre recommandée avec demande d'avis de réception), conformément aux articles L. 224-16 et R. 224-4 du code de la route. Une décision de suspension non notifiée n'est pas opposable à l'intéressé.

Je demande en conséquence le retrait de la décision de suspension prise à mon encontre.`,
  },
];