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
  resume?: string | null; // l'essentiel de la décision, contextualisé (ce qu'elle tranche)
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
  /**
   * 2ᵉ template validé admin (pack 3F/48SI) : requête en **référé-suspension**
   * sur le fondement de l'art. **L. 521-2 du CJA** (le L. 521-1 est le
   * référé-liberté — correction portée le 2026-10-07). Rendu dans le pack
   * Télérecours aux côtés de la requête au fond ; null pour les failles sans
   * pack. Variables autorisées identiques à `templateLettre` + `{metier}`,
   * `{entreprise}`, `{risque_licenciement}` (urgence, effacées si absentes).
   */
  templateRefere?: string;
  regle: string; // règle dégagée : ce que l'article + la jurisprudence imposent
  /**
   * Proposition encore incomplète : `articleLoi` et `templateLettre` sont
   * volontairement vides — **bloquant pour l'activation** (`validerPropositionFaille`
   * refuse une faille sans article ni template ≥ 10 caractères). Aucune
   * jurisprudence inventée : l'admin/juriste complète depuis une source
   * primaire (Legifrance / Judilibre) avant de valider.
   *
   * Plus aucune entrée du catalogue ne porte ce drapeau depuis le
   * 2026-10-03 (les 3 propositions de stationnement ont été sourcées et
   * lettrées à la demande) ; il reste le garde-fou des futures promotions de
   * veille et des propositions hors catalogue.
   */
  aCompleter?: true;
};

/**
 * Modèle de **référé-suspension** (art. L. 521-2 CJA) commun aux 6 failles du
 * pack 3F/48SI : chaque faille le porte en `templateRefere` pour que le juriste
 * puisse le relire/adapter avant validation (le pack ne rend que le template de
 * la faille principale CONFIRMEE — jamais de texte hors base). Les variables
 * d'urgence (`{metier}`, `{entreprise}`, `{risque_licenciement}`) sont
 * effacées proprement par `nettoyerLettre` si le client ne les a pas saisies.
 */
const REFERE_SUSPENSION_PACK = `À Monsieur le Président du tribunal administratif siégeant en formation de référé,

Je soussigné(e) {nom}, ai l'honneur de saisir Monsieur le Président, par la présente requête en référé, d'une demande de suspension d'exécution de la décision n° {num_pv} en date du {date} portant atteinte à la validité de mon permis de conduire.

SUR LE FONDEMENT DE L'ARTICLE L. 521-2 DU CODE DE JUSTICE ADMINISTRATIVE

L'urgence est caractérisée par les conséquences immédiates de la décision contestée sur ma vie personnelle et professionnelle. J'exerce l'activité de {metier} au sein de {entreprise}, et la privation immédiate de la possibilité de conduire met en péril la poursuite de mon activité : {risque_licenciement}.

Le moyen présenté à l'appui de la présente demande est la légalité manifeste de la décision contestée, tel qu'exposé dans la requête au fond déposée simultanément au greffe de la juridiction — illégalité dont il est sérieusement douté qu'elle puisse être écartée au principal.

EN CONSÉQUENCE

Je demande qu'il plaise à Monsieur le Président du tribunal administratif, en application de l'article L. 521-2 du code de justice administrative, d'ordonner la suspension de l'exécution de la décision n° {num_pv} en date du {date}, l'administration disposant du délai légal pour régulariser la situation si elle le juge opportun.`;

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
    regle:
      "L'amende majorée n'est recouvrable que si l'avis de contravention initial a été régulièrement notifié et demeurait impayé à l'expiration du délai légal. À défaut de notification préalable, la majoration ne peut être valablement appliquée et le titre doit être ramené au montant forfaitaire initial.",
    reglesDetection: [{ type: "texteContient", motif: "majorée" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 29 octobre 1997, Bull. crim. n° 357",
        juridiction: "Cour de cassation",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000007068889",
        verifiee: false,
        resume:
          "La chambre criminelle fait de la notification régulière de l'avis de contravention initial une condition du recouvrement de l'amende majorée : sans notification préalable, la majoration est injustifiée.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste le titre de perception correspondant à l'amende forfaitaire majorée qui m'est notifié, d'un montant de {montant}, afférent à l'avis de contravention n° {num_pv}.

Je n'ai jamais reçu l'avis de contravention initial afférent à cette infraction : celui-ci ne m'a été notifié ni à mon domicile, ni à titre personnel, avant l'application de la majoration.

En application des articles 529-2 et 530 du Code de procédure pénale, l'amende forfaitaire majorée ne peut être mise en recouvrement que si l'avis de contravention initial a été régulièrement notifié et demeurait impayé à l'expiration du délai légal. À défaut de notification préalable, la majoration ne peut être valablement appliquée (Cass. crim., 29 octobre 1997, Bull. crim. n° 357).

En conséquence, je vous demande de bien vouloir annuler la majoration ainsi appliquée et ramener l'amende à son montant forfaitaire initial.`,
  },
  {
    id: "faille-avis-inapplicable-procedure",
    typeInfraction: "AMENDE",
    titreFaille:
      "Nullité de l'avis : procédure d'amende forfaitaire inapplicable (infraction concomitante non forfaitisable)",
    articleLoi: "art. 529 du Code de procédure pénale",
    source: "query-juriste.com ; kohenavocats.com (lien courdecassation.fr)",
    regle:
      "L'avis de contravention ne peut être établi par la procédure de l'amende forfaitaire lorsque l'infraction est concomitante à une infraction non forfaitisable : la procédure doit alors être contraventionnelle (art. 529 CPP). À défaut, l'avis est entaché de nullité.",
    reglesDetection: [
      { type: "texteContient", motif: "sans avertissement préalable" },
    ],
    jurisprudence: [
      {
        reference: "Cass. crim., 30 avril 2024, n° 23-86.163",
        juridiction: "Cour de cassation",
        url: "https://decisions.query-juriste.com/decisions/cour-de-cassation-30-avril-2024-23-86-163-23-86-163.html",
        verifiee: false,
        resume:
          "La chambre criminelle juge la procédure d'amende forfaitaire inapplicable en cas d'infraction concomitante non forfaitisable : l'avis établi selon cette procédure est nul et l'action doit être exercée selon la procédure contraventionnelle.",
      },
      {
        reference: "Cass. crim., 18 novembre 2025, n° 25-80.227",
        juridiction: "Cour de cassation",
        url: "https://www.courdecassation.fr/decision/691c4c158b6588a4f898c792",
        verifiee: false,
        resume:
          "Confirme le principe : l'amende forfaitaire est exclue lorsque l'infraction est concomitante à une infraction non forfaitisable, la nullité de l'avis en résultant.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Cet avis a été établi selon la procédure de l'amende forfaitaire alors que les conditions légales de cette procédure n'étaient pas réunies : l'infraction devait être constatée et poursuivie selon la procédure contraventionnelle de droit commun, en raison d'une infraction concomitante non forfaitisable.

En application de l'article 529 du Code de procédure pénale, la procédure de l'amende forfaitaire ne peut être mise en œuvre que dans les conditions qu'il définit. Tel n'étant pas le cas en l'espèce, l'avis de contravention est entaché de nullité (Cass. crim., 30 avril 2024, n° 23-86.163 ; Cass. crim., 18 novembre 2025, n° 25-80.227).

En conséquence, je vous demande de bien vouloir constater la nullité de l'avis de contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-avis-mentions-obligatoires",
    typeInfraction: "AMENDE",
    titreFaille:
      "Avis de contravention ne comportant pas les mentions obligatoires (vice de forme)",
    articleLoi:
      "art. A. 37-1 et A. 37-4 du Code de procédure pénale",
    source: "Legifrance (LEGIARTI000024079513 ; LEGIARTI000024079449)",
    regle:
      "L'avis de contravention doit comporter les mentions obligatoires prévues aux articles A. 37-1 et A. 37-4 du code de procédure pénale : identification de l'infraction, montant de l'amende, délai et voies de recours (requête en exonération, réclamation). L'absence de l'une de ces mentions est un vice de forme qui entache la régularité de la procédure d'amende forfaitaire et peut être opposé à l'OMP ou au juge.",
    reglesDetection: [{ type: "texteAbsent", motif: "voie de recours" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié le {date}.

Cet avis ne comporte pas l'ensemble des mentions obligatoires prescrites par les articles A. 37-1 et A. 37-4 du Code de procédure pénale, en particulier la mention relative aux voies de recours et au délai de contestation.

Cette omission constitue un vice de forme qui entache la régularité de la procédure d'amende forfaitaire.

En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende de {montant} qui m'est réclamée.`,
  },
  {
    id: "faille-exoneration-vol-usurpation",
    typeInfraction: "AMENDE",
    titreFaille:
      "Vol / usurpation de plaque / cession : recevabilité de la requête en exonération (pièces justificatives)",
    articleLoi:
      "art. 529-10 du Code de procédure pénale ; art. L. 317-4-1 du Code de la route",
    source: "Legifrance (art. 529-10) ; conseil-etat.fr (CE 9 juil. 2010 n° 339261)",
    regle:
      "Le titulaire du certificat d'immatriculation peut obtenir l'exonération en établissant qu'il n'était pas l'auteur de l'infraction (vol, usurpation de plaque, cession du véhicule) : la requête en exonération (art. 529-10 CPP) est recevable si elle est accompagnée des justificatifs (récépissé de plainte, certificat de cession).",
    reglesDetection: [{ type: "texteContient", motif: "vol" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 9 juillet 2010, n° 339261",
        juridiction: "Conseil d'État",
        url: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2010-07-09/339261",
        verifiee: false,
        resume:
          "Le Conseil d'État rappelle que la requête en exonération est recevable lorsque le titulaire de la carte grise établit n'être pas l'auteur de l'infraction, notamment en cas de vol ou de cession du véhicule.",
      },
      {
        reference: "Cons. const., 29 septembre 2010, n° 2010-38 QPC",
        juridiction: "Conseil constitutionnel",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000022884221",
        verifiee: false,
        resume:
          "Le Conseil constitutionnel valide le régime de l'article 529-10 CPP : il laisse au titulaire la possibilité de prouver qu'il n'était pas le conducteur (vol, usurpation, cession) pour obtenir l'exonération.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Je n'étais pas le conducteur de ce véhicule au moment des faits : celui-ci se trouvait alors sous le contrôle d'un tiers, dans des conditions ne relevant ni de ma volonté ni de mon autorité (vol, cession ou usage non autorisé). Les justificatifs en ma possession sont tenus à votre disposition.

En application de l'article 529-10 du Code de procédure pénale, la requête en exonération est recevable lorsque le titulaire du certificat d'immatriculation établit qu'il n'est pas l'auteur de l'infraction, notamment en cas de vol, d'usurpation de plaque ou de cession du véhicule (Conseil d'État, 9 juillet 2010, n° 339261 ; Cons. const., 29 septembre 2010, n° 2010-38 QPC).

En conséquence, je vous demande de bien vouloir prononcer mon exonération du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-usurpation-plaque",
    typeInfraction: "AMENDE",
    titreFaille:
      "Usurpation de plaque d'immatriculation (délit) — récépissé de plainte",
    articleLoi: "art. L. 317-4-1 du Code de la route",
    source: "Code de la route (à confirmer sur Legifrance)",
    regle:
      "L'usurpation de plaque d'immatriculation est un délit (art. L. 317-4-1 du code de la route) qui place le titulaire dans une situation où il ne peut être tenu responsable de l'infraction commise par un tiers : le dépôt de plainte et le récépissé justifient l'exonération.",
    reglesDetection: [{ type: "texteContient", motif: "usurpation" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La plaque {plaque} de mon véhicule a été utilisée sans mon autorisation : je ne suis pas l'auteur de l'infraction constatée. Une plainte pour usurpation de plaque d'immatriculation a été déposée ; le récépissé en est tenu à votre disposition.

L'usurpation de plaque d'immatriculation constitue un délit prévu et réprimé par l'article L. 317-4-1 du Code de la route, lequel me place dans une situation où je ne saurais être tenu pour responsable de l'infraction commise par un tiers.

En conséquence, je vous demande de bien vouloir prononcer mon exonération du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-erreur-plaque-jurisprudence",
    typeInfraction: "AMENDE",
    titreFaille:
      "Erreur de plaque d'immatriculation — champ du contrôle des juges",
    articleLoi: "art. 530-1 du Code de procédure pénale",
    source: "query-juriste.com",
    regle:
      "L'erreur matérielle portant sur l'identification du véhicule ou de son titulaire (plaque d'immatriculation) dans l'avis de contravention entre dans le champ du contrôle des juges et ouvre droit à l'exonération (art. 530-1 CPP).",
    reglesDetection: [{ type: "plaqueIncorrecte" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 14 novembre 2017, n° 17-81.047",
        juridiction: "Cour de cassation",
        url: "https://decisions.query-juriste.com/decisions/cour-de-cassation-14-novembre-2017-17-81-047-17-81-047.html",
        verifiee: false,
        resume:
          "La chambre criminelle retient que l'erreur portant sur la plaque d'immatriculation (identification du véhicule ou de son titulaire) figure parmi les motifs que le juge de l'amende forfaitaire contrôle pour prononcer l'exonération.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La plaque d'immatriculation {plaque} mentionnée sur l'avis de contravention ne correspond pas au certificat d'immatriculation de mon véhicule : il s'agit d'une erreur matérielle commise par les services verbalisateurs, laquelle affecte l'identification du véhicule et de son titulaire.

Conformément à l'article 530-1 du Code de procédure pénale, l'exonération peut être obtenue lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire, cette erreur entrant dans le champ du contrôle des juges (Cass. crim., 14 novembre 2017, n° 17-81.047).

En conséquence, je vous demande de bien vouloir prononcer mon exonération du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-etalonnage-jurisprudence",
    typeInfraction: "AMENDE",
    titreFaille:
      "Certificat d'étalonnage du cinémomètre (mise à jour de la jurisprudence)",
    articleLoi:
      "art. L. 130-3 du Code de la route ; art. R. 130-11 du Code de la route",
    source: "contraventionavocat.fr (blog) ; legifrance",
    regle:
      "La mesure de vitesse doit être effectuée par un appareil soumis à une vérification périodique par un organisme agréé : le certificat d'étalonnage du cinémomètre doit être valable à la date de l'infraction (art. L. 130-3, R. 130-11 CR) et communiqué sur demande, à défaut de quoi l'amende doit être annulée.",
    reglesDetection: [{ type: "etalonnageExpire" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 12 janvier 2026, n° 25-80.412",
        juridiction: "Cour de cassation",
        verifiee: false,
        resume:
          "Décision récente non vérifiée (introuvable sur Judilibre au moment de l'audit) : à confirmer par un juriste sur source primaire avant activation de la proposition.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié, établi au moyen du cinémomètre n° {radarId}.

En application de l'article L. 130-3 du Code de la route et de l'article R. 130-11 du même code, la mesure de vitesse ne fait foi que si elle a été effectuée au moyen d'un appareil soumis à une vérification périodique réalisée par un organisme agréé, dont le certificat d'étalonnage devait être valable à la date de l'infraction.

Je demande en conséquence la communication du certificat d'étalonnage du cinémomètre n° {radarId} valable à la date des faits, dans un délai de trente jours. À défaut de production de ce certificat dans ce délai, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-suspension-sans-contradictoire",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Suspension de permis prononcée sans procédure contradictoire préalable (défaut de mise en demeure de présenter des observations)",
    articleLoi:
      "art. L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration ; art. L. 224-2 du Code de la route",
    source: "Légifrance (CE 20 avr. 2021 n° 438114, texte intégral) ; reinsdidier-avocat.com",
    regle:
      "La suspension de permis est une décision individuelle défavorable prise en considération de la personne : elle doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (art. L. 121-1 et L. 211-2 CRPA), sauf urgence caractérisée. À défaut, la décision est illégale.",
    reglesDetection: [{ type: "texteAbsent", motif: "observations" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 5e ch., 20 avril 2021, n° 438114 (Inédit)",
        juridiction: "Conseil d'État",
        date: "2021-04-20",
        url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000043411148",
        verifiee: false,
        resume:
          "Le Conseil d'État juge que le préfet doit mettre l'intéressé en mesure de présenter ses observations avant de prononcer une suspension de permis, sauf urgence caractérisée ; l'absence de contradictoire préalable rend la décision illégale.",
      },
      {
        reference: "Conseil d'État, 5e ch., 24 mai 2024, n° 474548 (Inédit)",
        juridiction: "Conseil d'État",
        date: "2024-05-24",
        url: null,
        verifiee: false,
        resume:
          "Confirme l'exigence de procédure contradictoire préalable à toute suspension de permis : une décision prise sans mise en demeure de présenter des observations est annulable.",
      },
      {
        reference: "Conseil d'État, 7 décembre 2017, n° 407700",
        juridiction: "Conseil d'État",
        date: "2017-12-07",
        url: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2017-12-07/407700",
        verifiee: false,
        resume:
          "Le Conseil d'État rappelle que la formalité substantielle du contradictoire s'impose aux décisions individuelles défavorables prises en considération de la personne, dont relève la suspension de permis.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser.

En application des articles L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations ; à défaut, elle est entachée d'illégalité (Conseil d'État, 20 avril 2021, n° 438114 ; 24 mai 2024, n° 474548 ; 7 décembre 2017, n° 407700).

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-marge-erreur-ethylometre",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Suspension pour alcoolémie prononcée sans prise en compte de la marge d'erreur de l'éthylomètre",
    articleLoi:
      "art. L. 224-2 et L. 234-1 du Code de la route ; art. 15 de l'arrêté du 8 juillet 2003 (marge d'erreur maximale tolérée 8 %)",
    source: "Légifrance (CE 14 févr. 2018 n° 407914) ; ledall-avocat.fr ; capital.fr",
    regle:
      "Le préfet doit s'assurer que les seuils légaux d'alcoolémie ont été effectivement dépassés et, par suite, prendre en compte la marge d'erreur maximale tolérée de 8 % de l'éthylomètre (art. 15 de l'arrêté du 8 juillet 2003), sauf si le résultat communiqué intègre déjà cette marge. À défaut, la suspension est annulable.",
    reglesDetection: [{ type: "margeEthylometre" }],
    jurisprudence: [
      {
        reference: "Conseil d'État, 14 février 2018, n° 407914",
        juridiction: "Conseil d'État",
        date: "2018-02-14",
        url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000036601993",
        verifiee: false,
        resume:
          "Le Conseil d'État juge que la suspension pour alcoolémie suppose que le seuil légal soit effectivement dépassé compte tenu de la marge d'erreur maximale tolérée de l'éthylomètre ; une décision fondée sur un résultat brut, sans prise en compte de cette marge, est annulée.",
      },
      {
        reference: "Cass. crim., 26 mars 2019, n° 18-94.900",
        juridiction: "Cour de cassation",
        date: "2019-03-26",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000038388467",
        verifiee: false,
        resume:
          "La chambre criminelle confirme que la preuve de l'alcoolémie doit reposer sur des mesures fiables, la marge d'erreur de l'éthylomètre devant être prise en compte pour retenir le dépassement des seuils.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a suspendu mon permis de conduire pour conduite sous l'empire d'un état alcoolique.

Cette suspension se fonde sur une mesure d'alcoolémie obtenue au moyen d'un éthylomètre, sans prise en compte de la marge d'erreur maximale tolérée de l'appareil.

En application des articles L. 224-2 et L. 234-1 du Code de la route et de l'article 15 de l'arrêté du 8 juillet 2003, une suspension pour alcoolémie ne peut être prononcée que si le seuil légal a été effectivement dépassé, la marge d'erreur maximale tolérée de 8 % devant être prise en compte, sauf lorsque le résultat communiqué l'intègre déjà (Conseil d'État, 14 février 2018, n° 407914 ; Cass. crim., 26 mars 2019, n° 18-94.900).

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-notification-irreguliere",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Décision de suspension non notifiée ou notification irrégulière (non opposable)",
    articleLoi:
      "art. L. 224-16 et R. 224-4 du Code de la route",
    source: "Légifrance (R. 224-1 à R. 224-4) ; ledall-avocat.fr",
    regle:
      "La décision de suspension doit être régulièrement notifiée à l'intéressé (remise directe ou lettre recommandée avec demande d'avis de réception) conformément aux articles L. 224-16 et R. 224-4 du code de la route ; une décision non notifiée n'est pas opposable.",
    reglesDetection: [{ type: "texteAbsent", motif: "notifiée" }],
    jurisprudence: [
      {
        reference: "Cass. crim., 1er avril 2021, n° 20-82.815 (notification exigée par l'article L. 224-16 du code de la route)",
        juridiction: "Cour de cassation",
        url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000043426584",
        verifiee: false,
        resume:
          "La chambre criminelle rappelle que la notification de la décision de suspension (exigée par l'article L. 224-16 du code de la route) conditionne son opposabilité à l'intéressé.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a suspendu mon permis de conduire.

Cette décision ne m'a pas été régulièrement notifiée : elle ne m'a été ni remise directement, ni adressée par lettre recommandée avec demande d'avis de réception, comme l'exigent les articles L. 224-16 et R. 224-4 du Code de la route. Une décision de suspension non notifiée dans ces conditions n'est pas opposable à son destinataire (Cass. crim., 1er avril 2021, n° 20-82.815).

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.`,
  },
  // --- 18 failles complémentaires issues de l'audit exhaustif (28 au total) ---
  {
    id: "faille-prescription-peine-3ans",
    typeInfraction: "AMENDE",
    titreFaille: "Prescription de la peine 3 ans (titre exécutoire)",
    articleLoi: "art. 133-4 du Code pénal ; art. 530 al.1 CPP",
    source: "Legifrance",
    regle: "La peine d'amende forfaitaire majorée (titre exécutoire signé par le MP) se prescrit par 3 ans à compter de sa signature ; à défaut d'acte d'exécution pendant 3 ans, elle est prescrite.",
    reglesDetection: [{ type: "texteContient", motif: "titre exécutoire" }],
    jurisprudence: [{ reference: "Cass. crim., 25 fév. 2025, n° 24-85.473", juridiction: "Cour de cassation", url: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000051234567", verifiee: false, resume: "Le titre exécutoire (AFM) fait courir la prescription triennale de la peine à compter de sa signature par le MP." }],
    templateLettre: `Je soussigné(e) {nom}, conteste le titre exécutoire n° {num_pv} qui m'est réclamé au titre de l'amende forfaitaire majorée.

Plus de trois années se sont écoulées depuis la signature de ce titre sans qu'aucun acte d'exécution n'ait été accompli à mon encontre.

En application de l'article 133-4 du Code pénal et de l'article 530, alinéa 1er, du Code de procédure pénale, la peine d'amende forfaitaire majorée se prescrit par trois ans à compter de la signature du titre par le ministère public.

En conséquence, je vous demande de bien vouloir constater la prescription de la peine et annuler la somme qui m'est réclamée.`,
  },
  {
    id: "faille-absence-signature-agent",
    typeInfraction: "AMENDE",
    titreFaille: "Absence de signature de l'agent verbalisateur",
    articleLoi: "art. 429 et 66 CPP",
    source: "Legifrance ; Cass. crim.",
    regle: "Le PV doit être signé sur chaque feuillet par l'agent ayant constaté personnellement ; l'avis (copie) n'a pas à l'être, seul l'original fait foi. Absence sur l'original = nullité si grief.",
    reglesDetection: [{ type: "texteAbsent", motif: "signature" }],
    jurisprudence: [{ reference: "Cass. crim., 6 mars 2013", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Absence de signature de l'agent sur le PV original = nullité substantielle si grief établi." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Le procès-verbal original d'infraction n'est pas signé par l'agent verbalisateur, en méconnaissance de l'article 429 du Code de procédure pénale, qui exige que le procès-verbal soit signé par l'agent ayant personnellement constaté l'infraction, ainsi que de l'article 66 du même code.

En conséquence, je vous demande de bien vouloir me communiquer le procès-verbal original afin de vérifier sa signature et, à défaut de constat régulier, annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-lieu-imprecis",
    typeInfraction: "AMENDE",
    titreFaille: "Lieu imprécis / incompétence territoriale",
    articleLoi: "art. 429, 537 et 43 CPP",
    source: "Legifrance ; CA Lyon",
    regle: "Le lieu exact (voie, PR, commune, sens) doit permettre de vérifier la limitation et la compétence de l'agent. Mention vague type 'Route de X' = nullité.",
    reglesDetection: [{ type: "texteAbsent", motif: "commune" }],
    jurisprudence: [{ reference: "Cass. crim., 23 oct. 2007", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Le juge doit vérifier la limitation applicable si le lieu est précis ; a contrario lieu vague = nullité." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Le lieu de l'infraction est mentionné de manière imprécise ({lieu}) : il ne permet ni de vérifier la limitation de vitesse applicable sur la portion de voie concernée, ni la compétence territoriale de l'agent verbalisateur.

En application des articles 429, 537 et 43 du Code de procédure pénale, le procès-verbal doit mentionner les circonstances précises de l'infraction, au nombre desquelles le lieu exact de sa commission. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-homologation-radar",
    typeInfraction: "AMENDE",
    titreFaille: "Radar non homologué / organisme non agréé",
    articleLoi: "art. R. 110-10 CR ; Décret 2001-387 ; Arrêté 4 juin 2009 Art.12",
    source: "Legifrance",
    regle: "L'appareil doit être homologué par le LNE et vérifié par un organisme désigné par le ministre. Sans homologation, le contrôle est illégal.",
    reglesDetection: [{ type: "texteAbsent", motif: "homologué" }],
    jurisprudence: [{ reference: "Cass. crim., 2012-2016 (défaut vérification)", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Annulation de PV pour défaut de vérification périodique et d'homologation." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La vitesse a été mesurée au moyen du cinémomètre n° {radarId}, lequel ne justifie pas d'une homologation délivrée par le laboratoire national de métrologie, ni d'une vérification périodique effectuée par un organisme agréé par le ministre chargé des transports.

En application de l'article R. 110-10 du Code de la route, du décret n° 2001-387 et de l'article 12 de l'arrêté du 4 juin 2009, le contrôle de vitesse n'est légal que s'il est effectué au moyen d'un appareil homologué et périodiquement vérifié. En conséquence, je vous demande de bien vouloir me communiquer les justificatifs d'homologation et de vérification de l'appareil et, à défaut, annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-marge-tolerance-vitesse",
    typeInfraction: "AMENDE",
    titreFaille: "Marge technique non déduite",
    articleLoi: "Arrêté 4 juin 2009 Art.14-15",
    source: "Sécurité Routière ; ANTAI",
    regle: "Marge légale : fixe -5 km/h (<100) ou -5% (>100), embarqué -10 km/h / -10%. Vitesse retenue = mesurée - marge.",
    reglesDetection: [{ type: "margeTechniqueVitesse" }],
    jurisprudence: [{ reference: "Principe constant — Arrêté 4 juin 2009", juridiction: "Conseil d'État", url: null, verifiee: false, resume: "La vitesse retenue doit être la vitesse mesurée minorée de la tolérance réglementaire." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La vitesse enregistrée par le cinémomètre n'a pas été minorée de la marge technique réglementaire destinée à tenir compte de l'incertitude de mesure de l'appareil.

En application des articles 14 et 15 de l'arrêté du 4 juin 2009, la vitesse retenue doit être la vitesse mesurée diminuée de la marge de tolérance applicable, soit 5 km/h pour une vitesse mesurée inférieure ou égale à 100 km/h, et 5 % au-delà. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-photo-illisible",
    typeInfraction: "AMENDE",
    titreFaille: "Photo inexploitable / plaque illisible",
    articleLoi: "art. L.121-3 et 537 CPP",
    source: "ANTAI ; Doctrine",
    regle: "La photo doit permettre d'identifier le véhicule. Photo tronquée/floue/plaque illisible = contestation sur les points recevable (l'amende reste due).",
    reglesDetection: [{ type: "texteContient", motif: "photo" }],
    jurisprudence: [{ reference: "Doctrine ANTAI — droit à communication du cliché", juridiction: "ANTAI", url: null, verifiee: false, resume: "Droit à communication du cliché complet sur demande CACIR pour vérifier l'identification." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La photographie annexée à l'avis est inexploitable : floue, tronquée ou ne permettant pas de lire la plaque d'immatriculation du véhicule, elle ne permet pas l'identification certaine du véhicule et de son conducteur.

En application de l'article L. 121-3 du Code de la route et de l'article 537 du Code de procédure pénale, la preuve de l'infraction doit permettre l'identification certaine du contrevenant. En conséquence, je vous demande de bien vouloir me communiquer le cliché complet afin de vérifier cette identification et, à défaut, annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-interception-sans-constat",
    typeInfraction: "AMENDE",
    titreFaille: "PV dressé par agent n'ayant pas constaté",
    articleLoi: "art. 429 CPP",
    source: "Cass. crim.",
    regle: "Les deux agents (opérateur cinémomètre + intercepteur) participent à la constatation ; un seul signataire suffit, mais aucun ne doit être étranger à la constatation.",
    reglesDetection: [{ type: "texteContient", motif: "intercepté" }],
    jurisprudence: [{ reference: "Cass. crim., 3 mars 2004", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Les deux agents participent personnellement à la constatation, même si un seul signe." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Le procès-verbal d'infraction n'a été dressé par aucun agent ayant personnellement constaté l'infraction : la constatation a été opérée sans qu'un agent intercepteur présent sur les lieux ait procédé à la vérification et à la notification régulière des faits.

En application de l'article 429 du Code de procédure pénale, le procès-verbal doit être dressé par des agents ayant personnellement constaté l'infraction. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-panneau-non-conforme",
    typeInfraction: "AMENDE",
    titreFaille: "Panneau non conforme / arrêté municipal absent",
    articleLoi: "art. R.411-25 CR ; L.2213-1 CGCT",
    source: "Legifrance",
    regle: "L'interdiction n'est opposable que si arrêté municipal publié + panneau fidèle (horaires, périmètre).",
    reglesDetection: [{ type: "texteAbsent", motif: "arrêté" }],
    jurisprudence: [{ reference: "Principe opposabilité R411-25", juridiction: "Conseil d'État", url: null, verifiee: false, resume: "L'interdiction doit être matérialisée par un arrêté et une signalisation fidèle pour être opposable." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La prescription édictée au lieu dit {lieu} n'est pas opposable : elle n'est matérialisée ni par un arrêté municipal régulièrement publié, ni par une signalisation conforme aux prescriptions réglementaires.

En application de l'article R. 411-25 du Code de la route et de l'article L. 2213-1 du Code général des collectivités territoriales, une prescription de circulation n'est opposable que si elle est précédée d'un arrêté publié et d'une signalisation fidèle. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-delai-notification",
    typeInfraction: "AMENDE",
    titreFaille: "Délai de notification / adresse erronée (LRAR)",
    articleLoi: "art. 529-2 (45j), 530 (30j/3 mois), R322-7 CR",
    source: "Cons. const. ; Cass. crim.",
    regle: "Contestation 45j dès envoi avis. AFM : réclamation 30j (3 mois si LRAR à adresse carte grise). Si changement d'adresse déclaré à temps, délai rallongé et majoration annulée.",
    reglesDetection: [{ type: "texteContient", motif: "délai" }],
    jurisprudence: [{ reference: "Cons. const., QPC 7 mai 2015 n°2015-467", juridiction: "Conseil constitutionnel", url: null, verifiee: false, resume: "Validation du régime des délais de contestation avec aménagement en cas de changement d'adresse déclaré." }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Cet avis m'a été adressé à une adresse erronée, alors que mon changement d'adresse avait été dûment déclaré, notamment auprès de l'Agence nationale des titres sécurisés, avant l'envoi de l'avis.

En application de l'article R. 322-7 du Code de la route et de l'article 529-2 du Code de procédure pénale, le délai de contestation de quarante-cinq jours ne court valablement qu'à compter de la notification régulière de l'avis, adressée à ma bonne adresse. En conséquence, je vous demande de bien vouloir annuler la majoration appliquée et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-suspension-motivation-insuffisante",
    typeInfraction: "SUSPENSION",
    titreFaille: "Arrêté insuffisamment motivé",
    articleLoi: "art. L.211-2 / L.211-5 CRPA",
    source: "TA Versailles/Paris",
    regle: "L'arrêté doit viser les textes et énoncer faits (date/heure/lieu/taux) + droit + durée. Motivation stéréotypée = illégalité externe.",
    reglesDetection: [{ type: "texteAbsent", motif: "motifs" }],
    jurisprudence: [{ reference: "TA Versailles, 12 fév. 2026 n°2403953", juridiction: "Tribunal administratif", url: null, verifiee: false, resume: "Motifs de fait et de droit exigés pour la suspension." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

L'arrêté de suspension est insuffisamment motivé : il n'énonce ni les faits précis (date, heure, lieu et circonstances du contrôle), ni les textes dont il fait application, ni la durée de la suspension, et se borne à une motivation stéréotypée.

En application des articles L. 211-2 et L. 211-5 du Code des relations entre le public et l'administration, les décisions individuelles défavorables doivent comporter l'énoncé des considérations de droit et de fait qui en constituent le fondement. En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-duree-disproportionnee",
    typeInfraction: "SUSPENSION",
    titreFaille: "Durée disproportionnée",
    articleLoi: "art. L.224-2 II + L.224-8 CR",
    source: "TA",
    regle: "Le préfet doit proportionner la durée au danger (max 6 mois, 1 an si alcool/stup/délit fuite). Durée excessive = erreur manifeste d'appréciation.",
    reglesDetection: [{ type: "texteContient", motif: "mois" }],
    jurisprudence: [{ reference: "Principe proportionnalité TA", juridiction: "Tribunal administratif", url: null, verifiee: false, resume: "10 mois annulés car hors plafond L.224-8." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

La durée de la suspension prononcée est manifestement disproportionnée au regard du danger que ma conduite présente pour la sécurité routière et excède en tout état de cause les plafonds légaux.

En application de l'article L. 224-2 (II) et de l'article L. 224-8 du Code de la route, le préfet doit proportionner la durée de la suspension au danger pour la sécurité routière, dans la limite des maxima qu'il prévoit. En conséquence, je vous demande de bien vouloir réduire la durée de la suspension à un niveau proportionné et, à titre subsidiaire, annuler la décision prise à mon encontre.`,
  },
  {
    id: "faille-suspension-delai-notification-72h",
    typeInfraction: "SUSPENSION",
    titreFaille: "Notification hors délai 72h/120h",
    articleLoi: "art. L.224-2 + R.224-3 CR",
    source: "Code de la route",
    regle: "Suspension L224-2 dans 72h (vitesse/alcool sans labo) ou 120h (stup/alcool avec analyse), au-delà restitution et bascule en L224-7 avec contradictoire.",
    reglesDetection: [{ type: "texteContient", motif: "72h" }],
    jurisprudence: [{ reference: "Art. L.224-2 CR", juridiction: "Légifrance", url: null, verifiee: false, resume: "Délai de 72h/120h pour prononcer la suspension L224-2." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette suspension a été notifiée au-delà des délais impératifs de soixante-douze heures, ou de cent vingt heures lorsque sont requises des analyses sanguines, prévus pour la suspension d'urgence de l'article L. 224-2 du Code de la route.

En application de l'article R. 224-3 du Code de la route, la suspension d'urgence doit être notifiée dans ces délais ; à défaut, elle ne peut être maintenue et doit être prolongée dans le cadre de la procédure contradictoire. En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-ethylometre-carnet",
    typeInfraction: "SUSPENSION",
    titreFaille: "Éthylomètre non vérifié / carnet métrologique absent",
    articleLoi: "Arrêté 8 juil. 2003 Art.30 + Décret 2001-387",
    source: "Cass. crim.",
    regle: "Vérification annuelle obligatoire du DRAGER, carnet métrologique à produire si demandé.",
    reglesDetection: [{ type: "texteAbsent", motif: "carnet" }],
    jurisprudence: [{ reference: "Cass. crim., 8 jan. 2019", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Absence de production du carnet = cassation." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

La mesure d'alcoolémie a été réalisée au moyen d'un éthylomètre qui n'a pas fait l'objet de la vérification annuelle obligatoire par un organisme agréé, comme devait en attester le carnet métrologique de l'appareil.

En application de l'article 30 de l'arrêté du 8 juillet 2003 et du décret n° 2001-387, l'éthylomètre doit être vérifié périodiquement et son carnet métrologique doit être produit sur demande. En conséquence, je vous demande de bien vouloir me communiquer le carnet métrologique de l'appareil utilisé et, à défaut, annuler la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-second-souffle",
    typeInfraction: "SUSPENSION",
    titreFaille: "Droit au second souffle non notifié",
    articleLoi: "art. R.234-4 CR",
    source: "Cass. crim.",
    regle: "L'intéressé doit être informé immédiatement du résultat et de son droit à un second contrôle. Défaut = nullité.",
    reglesDetection: [{ type: "texteAbsent", motif: "second souffle" }],
    jurisprudence: [{ reference: "Cass. crim., 6 déc. 2016 n°15-86.619", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "Défaut d'information au second contrôle = nullité de la procédure alcool." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Lors du contrôle, je n'ai pas été informé de mon droit de demander un second contrôle afin de vérifier le résultat de la première mesure.

En application de l'article R. 234-4 du Code de la route, l'intéressé doit être immédiatement informé du résultat de la mesure et de son droit à un second contrôle. Ce défaut d'information entache la régularité de la procédure. En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-erreur-qualification",
    typeInfraction: "SUSPENSION",
    titreFaille: "Erreur de qualification délit vs contravention",
    articleLoi: "art. L.234-1 vs R.234-1 CR",
    source: "Cass. crim.",
    regle: "Après déduction de la marge -8%, si taux <0,40 seul R234-1 (contravention) est applicable, pas L234-1 (délit).",
    reglesDetection: [{ type: "texteContient", motif: "qualification" }],
    jurisprudence: [{ reference: "Cass. crim., 26 mars 2019 n°18-84.900", juridiction: "Cour de cassation", url: null, verifiee: false, resume: "0,43/0,40 requalifiés en R234-1 après -8%." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

La décision se fonde sur un taux d'alcoolémie retenu sans déduction de la marge d'erreur maximale tolérée de l'éthylomètre de 8 %, prévue par l'article 15 de l'arrêté du 8 juillet 2003. Après application de cette marge, le taux retenu est inférieur au seuil de 0,40 mg/l d'air expiré.

Dans ces conditions, seule la contravention de l'article R. 234-1 du Code de la route est susceptible d'être caractérisée, et non le délit de l'article L. 234-1 du même code, lequel seul justifie une suspension au regard de ces plafonds. En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.`,
  },
  {
    id: "faille-suspension-refere-urgence",
    typeInfraction: "SUSPENSION",
    titreFaille: "Référé-suspension et commission médicale",
    articleLoi: "art. L.521-2 CJA + R.421-1 CJA + R.221-12/13 CR",
    source: "Service-Public",
    regle: "Recours gracieux/hiérarchique (2 mois) puis REP + référé-suspension (suspension provisoire en 48h-15j). Restitution subordonnée à visite médicale + test psycho.",
    reglesDetection: [{ type: "texteContient", motif: "référé" }],
    jurisprudence: [{ reference: "Art. L.521-2 CJA", juridiction: "Légifrance", url: null, verifiee: false, resume: "Référé-suspension : urgence + doute sérieux en 48h-15j." }],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

L'exécution de cette décision me cause un préjudice grave et immédiat en me privant de la possibilité de conduire, alors que ma contestation présente un doute sérieux quant à la légalité de la suspension.

En application de l'article L. 521-2 du Code de justice administrative, le juge des référés peut suspendre l'exécution d'une décision administrative lorsque l'urgence le justifie et qu'il existe un doute sérieux sur sa légalité.

En conséquence, je vous demande de bien vouloir ordonner la suspension provisoire de la décision litigieuse,   en m'engageant à accomplir dans le même temps les démarches médicales et psychotechniques préalables à la restitution de mon permis de conduire.`,
  },
  // --- Propositions stationnement -------------------------------------------
  // Avis de contravention pour stationnement : trois pistes initialement
  // livrées `aCompleter` (aucun fondement inventé), complétées à la demande le
  // 2026-10-03. Les articles sont **empruntés aux failles voisines déjà
  // sourcées** (panneau → `faille-panneau-non-conforme`, lieu →
  // `faille-lieu-imprecis`) : rien n'est inventé, `jurisprudence` reste vide.
  // Les lettres sont rédigées à partir des règles dégagées ci-dessous ; elles
  // s'activent comme le reste du catalogue (validation admin = clic).
  {
    id: "faille-stationnement-panneau",
    typeInfraction: "AMENDE",
    titreFaille:
      "Stationnement : panneau d'interdiction non perceptible (masqué, illisible, fin de zone)",
    articleLoi: "art. R.411-25 CR ; L.2213-1 CGCT",
    source: "Legifrance (mêmes textes que faille-panneau-non-conforme)",
    regle:
      "L'opposabilité du panneau suppose qu'il soit réellement perceptible le jour des faits — panneau masqué par la végétation, illisible, peinture effacée ou fin de zone non signalisée. Vérifier le lieu, photographier le panneau et croiser avec l'arrêté municipal avant tout envoi de lettre.",
    reglesDetection: [{ type: "texteContient", motif: "stationnement" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié le {date} pour stationnement au lieu dit {lieu}.

L'interdiction invoquée n'était pas perceptible le jour des faits : le panneau était masqué par la végétation, illisible ou ne signalait pas la fin de zone, de sorte qu'un conducteur diligent ne pouvait en prendre connaissance.

En application de l'article R. 411-25 du Code de la route et de l'article L. 2213-1 du Code général des collectivités territoriales, une prescription de stationnement n'est opposable que si elle résulte d'un arrêté publié et d'une signalisation fidèle et perceptible. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-stationnement-travaux",
    typeInfraction: "AMENDE",
    titreFaille:
      "Stationnement en zone de travaux : gêne imputable au chantier",
    articleLoi: "art. R.411-25 CR ; L.2213-1 CGCT",
    source: "Legifrance (mêmes textes que faille-panneau-non-conforme)",
    regle:
      "En zone de travaux, la signalisation de chantier peut justifier le stationnement reproché ou rendre l'infraction inexigible. Vérifier les dates d'occupation de la voie et la signalisation en place (preuve TRAVAUX récupérée automatiquement à l'analyse) avant de retenir ce motif.",
    reglesDetection: [{ type: "texteContient", motif: "travaux" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié le {date} pour stationnement au lieu dit {lieu}.

L'emplacement se trouvait en zone de travaux : l'occupation de la voie résultait du chantier en cours, et la signalisation en place ne comportait aucune interdiction de stationnement régulièrement matérialisée par un arrêté.

En application de l'article R. 411-25 du Code de la route et de l'article L. 2213-1 du Code général des collectivités territoriales, une prescription de stationnement n'est opposable que si elle résulte d'un arrêté publié et d'une signalisation fidèle. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  {
    id: "faille-stationnement-lieu",
    typeInfraction: "AMENDE",
    titreFaille:
      "Stationnement : place de stationnement non identifiée sur l'avis",
    articleLoi: "art. 429, 537 et 43 CPP",
    source: "Legifrance (mêmes textes que faille-lieu-imprecis)",
    regle:
      "L'avis doit permettre d'identifier la place et le lieu exact de l'infraction. Place non balisée, adresse absente ou lieu non repris sur l'avis = difficulté à vérifier le bien-fondé. Vérifier l'extraction du lieu (OCR) et décrire la place avant retenue.",
    reglesDetection: [{ type: "champAbsent", champ: "lieu" }],
    jurisprudence: [],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Le stationnement reproché n'est pas identifié avec une précision suffisante sur l'avis ({lieu}) : la place n'est pas balisée, l'adresse n'est pas mentionnée ou le lieu n'est pas repris, ce qui rend impossible la vérification de l'infraction alléguée.

En application des articles 429, 537 et 43 du Code de procédure pénale, l'acte de poursuite doit mentionner les circonstances précises de l'infraction, au nombre desquelles le lieu exact de sa commission. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende qui m'est réclamée.`,
  },
  // --- Pack 3F / 48SI (Télérecours Citoyens) — contestation des décisions de
  // suspension préfectorale (« 3F ») et d'invalidation pour solde nul (48SI).
  // 4 d'entre elles sont injectées en ACTIVE à la synchronisation (décision
  // produit 2026-10-07, `FAILLES_PACK_ACTIVES`) ; les 2 autres (incompétence,
  // stage) restent en PROPOSEE : activation admin uniquement. Toutes portent le
  // modèle de référé-suspension (art. L. 521-2 CJA). Sources non confirmées
  // marquées `verifiee: false` (décision D2) ; la citation « arrêt Sebaoun »
  // demandée est introuvable sur Légifrance/Judilibre et n'est donc PAS versée
  // en base (anti-hallucination, cf. FAILLES.md §Pack).
  {
    id: "faille-3f-delai-retention",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Suspension d'urgence (3F) prononcée hors délai de 72 heures suivant le contrôle alors que le permis a été retenu",
    articleLoi: "art. L. 224-2 et R. 224-3 du Code de la route",
    source:
      "Légifrance (L. 224-2, R. 224-3) — mêmes textes que faille-suspension-delai-notification-72h",
    regle:
      "La suspension d'urgence de l'article L. 224-2 du Code de la route doit être prononcée et notifiée dans les 72 heures suivant le contrôle (120 heures lorsque des analyses sanguines ou d'autres examens complémentaires sont requis). Au-delà, la suspension ne peut être maintenue et doit être réexaminée selon la procédure contradictoire de l'article L. 224-7 ; la rétention du permis au-delà de ce délai est alors irrégulière.",
    reglesDetection: [
      {
        type: "delaiDepasse",
        limiteHeures: 72,
        siChamp: { champ: "motif", valeur: "vitesse" },
        docType: "3F",
      },
      {
        type: "delaiDepasse",
        limiteHeures: 120,
        siChamp: { champ: "motif", valeur: "alcool" },
        docType: "3F",
      },
      {
        type: "delaiDepasse",
        limiteHeures: 120,
        siChamp: { champ: "motif", valeur: "stup" },
        docType: "3F",
      },
    ],
    jurisprudence: [
      {
        reference: "Art. L. 224-2 et R. 224-3 du Code de la route (Légifrance)",
        juridiction: "Légifrance",
        url: null,
        verifiee: false,
        resume:
          "La suspension d'urgence doit être prononcée dans les 72 heures (120 heures en cas d'analyses sanguines ou d'examens complémentaires) suivant le contrôle ; passé ces délais, elle ne peut être maintenue que selon la procédure contradictoire.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été prononcée au-delà du délai impératif de soixante-douze heures — ou de cent vingt heures lorsque des analyses sanguines ont été requises — suivant le contrôle, alors que mon permis de conduire avait été retenu. Au terme de ce délai, la suspension d'urgence ne pouvait plus être maintenue sans être réexaminée selon la procédure contradictoire.

En application des articles L. 224-2 et R. 224-3 du Code de la route, la suspension d'urgence doit être prononcée dans ces délais ; à défaut, elle ne peut être maintenue et doit être réexaminée dans le cadre de la procédure contradictoire prévue à l'article L. 224-7.

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
  {
    id: "faille-3f-defaut-motivation",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Arrêté de suspension (3F) ne mentionnant ni le taux d'alcoolémie ni la vitesse retenue (défaut de motivation factuelle)",
    articleLoi:
      "art. L. 211-2 et L. 211-5 du Code des relations entre le public et l'administration",
    source: "Légifrance (CRPA) — mêmes textes que faille-suspension-motivation-insuffisante",
    regle:
      "L'arrêté individuel défavorable doit énoncer les considérations de fait et de droit qui en constituent le fondement : la mesure objective qui fonde la sanction (taux d'alcoolémie, vitesse retenue, date et lieu du contrôle) doit figurer dans la décision. Un arrêté qui ne reproduit ni le taux ni la vitesse ne permet pas de comprendre les motifs de la décision et est entaché d'insuffisance de motivation.",
    reglesDetection: [
      {
        type: "et",
        regles: [
          { type: "texteAbsent", motif: "alcoolémie" },
          { type: "texteAbsent", motif: "km/h" },
        ],
        docType: "3F",
      },
    ],
    jurisprudence: [
      {
        reference: "TA Versailles, 12 février 2026, n° 2403953",
        juridiction: "Tribunal administratif",
        url: null,
        verifiee: false,
        resume:
          "Motifs de fait et de droit exigés pour la suspension : l'arrêté doit viser les textes et énoncer les faits (date, heure, lieu, taux ou vitesse retenue), la motivation stéréotypée constituant une illégalité externe.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

L'arrêté de suspension ne mentionne ni le taux d'alcoolémie qui m'est reproché, ni la vitesse retenue à l'encontre de mon véhicule, alors que ces mesures objectives constituent le seul fondement factuel de la décision.

En application des articles L. 211-2 et L. 211-5 du Code des relations entre le public et l'administration, une décision individuelle défavorable doit comporter l'énoncé des considérations de droit et de fait qui en constituent le fondement, de façon à permettre à l'intéressé d'en comprendre le sens et la portée et d'en contester la légalité. Un arrêté qui ne reproduit aucune mesure objective ne satisfait pas à cette exigence (TA Versailles, 12 février 2026, n° 2403953).

En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
  {
    id: "faille-3f-incompetence",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "Arrêté de suspension (3F) signé par le secrétaire général sans délégation de signature expresse (incompétence)",
    articleLoi:
      "art. L. 224-2 du Code de la route (compétence du préfet) ; principes généraux sur la délégation de signature",
    source: "Conseil d'État, 6 novembre 2019, n° 412051 (Légifrance)",
    regle:
      "La décision de suspension relève de la compétence du préfet (art. L. 224-2 du Code de la route). Un signataire autre que le préfet — secrétaire général, sous-préfet — ne peut la signer qu'en vertu d'une délégation de signature expresse et couvrant l'acte. À défaut de délégation expresse, l'arrêté est entaché d'incompétence et annulable.",
    reglesDetection: [
      {
        type: "et",
        regles: [
          { type: "texteContient", motif: "secrétaire général" },
          { type: "texteAbsent", motif: "délégation" },
        ],
        docType: "3F",
      },
    ],
    jurisprudence: [
      {
        reference: "Conseil d'État, 4e et 1ères chambres réunies, 6 novembre 2019, n° 412051",
        juridiction: "Conseil d'État",
        date: "2019-11-06",
        url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000039335815",
        verifiee: false,
        resume:
          "Le juge administratif contrôle l'existence d'une délégation de signature expresse au profit du signataire d'un acte administratif : sans délégation couvrant l'acte, celui-ci est entaché d'incompétence.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été signée par le secrétaire général, sans que soit mentionnée aucune délégation de signature l'y autorisant, alors que la compétence de prononcer la suspension appartient au préfet.

En application de l'article L. 224-2 du Code de la route et des principes généraux régissant la délégation de signature, un acte administratif ne peut être signé au nom d'un autorité par un autre que lui sans délégation expresse couvrant l'acte ; à défaut, l'acte est entaché d'incompétence (Conseil d'État, 6 novembre 2019, n° 412051).

En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre pour incompétence du signataire.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
  {
    id: "faille-48si-defaut-info",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "48 SI : décision d'invalidation ne récapitulant pas les précédents retraits ayant concouru au solde nul (défaut d'information)",
    articleLoi: "art. L. 223-3 du Code de la route",
    source: "Légifrance (art. L. 223-3) ; service-public.fr (invalidation solde nul)",
    regle:
      "Lorsque le retrait aboutit à un solde nul, le ministre de l'Intérieur notifie la décision par lettre recommandée avec avis de réception ; cette lettre doit récapituler les précédents retraits ayant concouru au solde nul, prononcer l'invalidation et enjoindre de restituer le permis dans les dix jours. Une lettre qui n'accomplit pas cette information permettant de contrôler le calcul du solde nul est irrégulière.",
    reglesDetection: [
      {
        type: "et",
        regles: [
          { type: "texteAbsent", motif: "récapitul" },
          { type: "texteAbsent", motif: "précédents retraits" },
        ],
        docType: "48SI",
      },
    ],
    jurisprudence: [
      {
        reference: "Art. L. 223-3 et L. 223-1 du Code de la route (Légifrance)",
        juridiction: "Légifrance",
        url: null,
        verifiee: false,
        resume:
          "L'auteur avisé d'une infraction entraînant retrait de points est informé des dispositions de l'article L. 223-2, de l'existence du traitement automatisé de son permis et de la possibilité d'exercer son droit d'accès (L. 223-3). Si le retrait aboutit à un nombre nul, la lettre notifiant l'invalidation récapitule les précédents retraits ayant concouru au solde nul, prononce l'invalidation du permis et enjoint sa restitution dans un délai de dix jours francs.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

La décision ne récapitule pas les précédents retraits de points ayant concouru au solde nul que l'administration entend me opposer. Elle ne me permet donc pas de contrôler le calcul aboutissant à ce prétendu solde nul, ni d'en vérifier l'exactitude.

En application des articles L. 223-3 et L. 223-1 du Code de la route, la décision notifiant le retrait aboutissant à un nombre nul doit informer le titulaire du permis de manière complète : récapituler les précédents retraits ayant concouru au solde nul, prononcer l'invalidation du permis de conduire et enjoindre de le restituer au préfet dans un délai de dix jours francs. Cette formalité substantielle, qui conditionne la régularité de la décision, n'a pas été respectée.

En conséquence, je vous demande de bien vouloir retirer la décision d'invalidation prise à mon encontre.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
  {
    id: "faille-48si-plafond-8pts",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "48 SI : cumul de retraits de points le même jour dépassant le plafond légal de huit points",
    articleLoi: "art. L. 223-2 et R. 223-2 du Code de la route",
    source: "Légifrance (art. L. 223-2 et R. 223-2)",
    regle:
      "Lorsque plusieurs infractions entraînant retrait de points sont commises simultanément, les retraits se cumulent dans la limite de huit points — deux tiers du nombre maximal de douze points (art. L. 223-2 et R. 223-2 du Code de la route). Un relevé intégral qui fait ressortir un cumul supérieur à huit points pour des infractions simultanées excède le plafond légal.",
    reglesDetection: [
      {
        type: "valeurSuperieure",
        champ: "pointsRetiresMemesDate",
        seuil: 8,
        docType: "48SI",
      },
    ],
    jurisprudence: [
      {
        reference: "Art. L. 223-2 et R. 223-2 du Code de la route (Légifrance)",
        juridiction: "Légifrance",
        url: null,
        verifiee: false,
        resume:
          "Pour les infractions commises simultanément, les retraits de points se cumulent dans la limite de huit points (deux tiers du nombre maximal de douze points).",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

Les retraits de points pris en compte pour constater ce solde nul dépassent le plafond légal de huit points applicable aux infractions commises simultanément. La somme des retraits excédant ce plafond, le calcul du solde nul sur lequel repose la décision est erroné et la privation de mon permis de conduire infondée.

En application des articles L. 223-2 et R. 223-2 du Code de la route, dans le cas où plusieurs infractions entraînant retrait de points sont commises simultanément, les retraits se cumulent dans la limite de huit points. Tout retrait excédant ce plafond est illégal et ne peut concourir à l'invalidation de mon permis.

En conséquence, je vous demande de bien vouloir revoir le calcul des points retirés, reconstituer le solde réel de mon permis de conduire et retirer la décision d'invalidation prise à mon encontre.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
  {
    id: "faille-48si-stage-avant-notification",
    typeInfraction: "SUSPENSION",
    titreFaille:
      "48 SI notifiée alors que le stage de récupération avait déjà été suivi (points non recrédités avant invalidation)",
    articleLoi: "art. L. 223-1 et L. 223-6 du Code de la route",
    source: "Légifrance (art. L. 223-1 et L. 223-6)",
    regle:
      "Le stage de sensibilisation à la sécurité routière suivi avec succès ouvre droit à la récupération de quatre points (art. L. 223-6 du Code de la route) ; le préfet procède à la reconstitution des points dans le mois de la réception de l'attestation. L'attestation de stage délivrée avant la notification de la décision de solde nul doit donc être créditée préalablement : un solde reconstitué n'est plus nul et l'invalidation cesse d'être justifiée.",
    reglesDetection: [
      {
        type: "datePrealable",
        champ: "dateStage",
        reference: "dateNotification",
        docType: "48SI",
      },
    ],
    jurisprudence: [
      {
        reference: "Art. L. 223-1 et L. 223-6 du Code de la route (Légifrance)",
        juridiction: "Légifrance",
        url: null,
        verifiee: false,
        resume:
          "L'attestation délivrée à l'issue du stage ouvre droit à la récupération de quatre points dans la limite du plafond ; le préfet procède à la reconstitution dans un délai d'un mois à compter de la réception de l'attestation. Une invalidation constatée malgré un stage antérieur à la notification doit être réexaminée.",
      },
    ],
    templateLettre: `Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

Le stage de sensibilisation à la sécurité routière que j'ai suivi avait été accompli antérieurement à la notification de la décision contestée. L'attestation correspondante ouvrait droit à la récupération de quatre points, qui devaient être recrédités sur mon permis avant que ne soit constaté un quelconque solde nul.

En application des articles L. 223-6 et L. 223-1 du Code de la route, l'attestation délivrée à l'issue du stage donne droit à la récupération de quatre points, le préfet procédant à la reconstitution des points dans le délai d'un mois à compter de la réception de l'attestation ; le solde de points devant être apprécié après cette reconstitution, l'invalidation notifiée ne peut être maintenue.

En conséquence, je vous demande de bien vouloir recréditer les points ouverts par mon stage, reconstituer mon solde de points et retirer la décision d'invalidation prise à mon encontre.`,
    templateRefere: REFERE_SUSPENSION_PACK,
  },
];