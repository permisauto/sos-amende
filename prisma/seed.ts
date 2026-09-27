import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role, Prisma } from "../src/generated/prisma/client";
import { CATALOGUE_SOURCES } from "../src/lib/catalogue-sources";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

/**
 * FAILLES HISTORIQUES — les 4 failles AMENDE de référence (FAILLE_IDS du
 * moteur, cf. src/lib/moteur.ts). Le catalogue restructure (c5a2482) a renommé
 * leurs IDs (faille-erreur-plaque-jurisprudence, faille-etalonnage-jurisprudence,
 * faille-avis-mentions-obligatoires…) : elles doivent pourtant rester ACTIVE
 * sous leur ID historique, sinon `analyserDossier` (qui ne détecte que sur les
 * failles ACTIVE) ne générerait aucune lettre sur une base fraîche.
 * Le catalogue (PROPOSEE) propose les versions enrichies en doublon — l'admin
 * peut écarter ces propositions ou les garder comme variantes.
 *
 * CHARTE D'ÉCRITURE DES LETTRES (formalisme commun à toutes les failles) :
 * 1. Identification — premier paragraphe : le requérant et l'acte contesté
 *    (avis de contravention ou décision, n°, date) ;
 * 2. Faits — exposé sobre et factuel au présent, sans emphase ;
 * 3. Droit — fondement légal (articles) puis jurisprudence, articulés en une
 *    phrase maîtrisée ;
 * 4. Conclusion — demande précise, à la première personne du singulier,
 *    formulée « En conséquence, je vous demande de bien vouloir … ».
 * Style soutenu ; ni crochets, ni promesse de pièce jointe non garantie, ni
 * formulation vague. La date {date} est écrite en toutes lettres au remplissage.
 */
const FAILLES_HISTORIQUES = [
  {
    id: "faille-prescription-1-an",
    typeInfraction: "AMENDE",
    titreFaille: "Prescription de l'action publique (1 an)",
    articleLoi: "Article 9 du Code de procédure pénale",
    source: "Code de procédure pénale",
    regle:
      "L'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise (art. 9 CPP) : un avis notifié plus d'un an après les faits porte sur une infraction prescrite, l'amende doit être annulée.",
    reglesDetection: [{ type: "datePrescrite" }],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

En application de l'article 9 du Code de procédure pénale, l'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. Plus d'un an s'étant écoulé entre la date de l'infraction et la notification du présent avis, l'action publique est éteinte.

Cette contestation est dès lors fondée. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.`,
  },
  {
    id: "faille-mentions-obligatoires",
    typeInfraction: "AMENDE",
    titreFaille: "Défaut de mentions obligatoires sur l'avis de contravention",
    articleLoi: "Articles R. 246-1 et suivants du Code de la route",
    source: "Code de la route",
    regle:
      "L'avis de contravention doit comporter l'ensemble des mentions obligatoires du code de la route (signature de l'agent, heure de constatation, matricule…) ; leur absence entache le titre exécutoire d'irrégularité.",
    reglesDetection: [
      { type: "champAbsent", champ: "numTelePaiement" },
      { type: "champAbsent", champ: "cle" },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Cet avis ne comporte pas l'ensemble des mentions obligatoires prescrites par les articles R. 246-1 et suivants du Code de la route, notamment la signature de l'agent verbalisateur, l'heure de constatation et le matricule de celui-ci. Cette omission entache la procédure d'une irrégularité substantielle.

En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.`,
  },
  {
    id: "faille-erreur-plaque",
    typeInfraction: "AMENDE",
    titreFaille: "Erreur de plaque d'immatriculation",
    articleLoi: "Article 530-1 du Code de procédure pénale",
    source: "Code de procédure pénale",
    regle:
      "L'erreur de plaque d'immatriculation sur l'avis de contravention (identification du véhicule ou de son titulaire) permet au titulaire qui n'est pas l'auteur de l'infraction d'obtenir l'exonération (art. 530-1 CPP).",
    reglesDetection: [{ type: "plaqueIncorrecte" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La plaque {plaque} mentionnée sur cet avis de contravention ne correspond pas au véhicule dont je suis titulaire ; je ne suis dès lors pas l'auteur de l'infraction qui m'est reprochée.

En application de l'article 530-1 du Code de procédure pénale, je demande à être exonéré de l'amende encourue. Je vous demande en conséquence de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.`,
  },
  {
    id: "faille-certificat-etalonnage",
    typeInfraction: "AMENDE",
    titreFaille:
      "Demande de communication du certificat d'étalonnage du cinémomètre",
    articleLoi:
      "Article L. 130-3 du Code de la route et arrêté du 27 mars 2007",
    source: "Code de la route / Arrêté du 27 mars 2007",
    regle:
      "La mesure de vitesse doit être effectuée par un appareil dûment étalonné (art. L. 130-3 CR, arrêté du 27 mars 2007) : le certificat d'étalonnage valable à la date de l'infraction doit être communiqué sur demande, à défaut l'amende est annulée.",
    reglesDetection: [{ type: "etalonnageExpire" }],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} établi d'après une mesure de vitesse réalisée par un cinémomètre.

En application de l'article L. 130-3 du Code de la route et de l'arrêté du 27 mars 2007 relatif aux conditions de l'étalonnage des cinémomètres, la mesure de vitesse doit être effectuée au moyen d'un appareil dûment étalonné. Je demande en conséquence la communication du certificat d'étalonnage du cinémomètre utilisé, valable à la date de l'infraction, dans un délai de trente jours.

À défaut de production de ce certificat dans le délai imparti, la mesure doit être regardée comme irrégulière et la contravention annulée. Je vous prie dès lors de bien vouloir m'exonérer du paiement de l'amende réclamée.`,
  },
];

const isHistorique = new Set([
  "faille-prescription-peine-3ans",
]);

async function main() {
  // 1) FailleJuridique : les 4 failles historiques (FAILLE_IDS du moteur) en ACTIVE
  for (const faille of FAILLES_HISTORIQUES) {
    await prisma.failleJuridique.upsert({
      where: { id: faille.id },
      update: {
        typeInfraction: faille.typeInfraction,
        titreFaille: faille.titreFaille,
        articleLoi: faille.articleLoi,
        source: faille.source,
        regle: faille.regle,
        reglesDetection: faille.reglesDetection,
        templateLettre: faille.templateLettre,
        statut: "ACTIVE",
      },
      create: {
        ...faille,
        jurisprudence: [],
        statut: "ACTIVE",
      },
    });
  }
  console.log(`Seed FailleJuridique historique : ${FAILLES_HISTORIQUES.length} failles ACTIVE.`);

  // 2) FailleJuridique : catalogue sourcé (ACTIVE pour les historiques du
  //    catalogue, PROPOSEE pour les nouvelles — l'admin valide ensuite).
  for (const faille of CATALOGUE_SOURCES) {
    const estHistorique = isHistorique.has(faille.id);

    await prisma.failleJuridique.upsert({
      where: { id: faille.id },
      update: {
        typeInfraction: faille.typeInfraction,
        titreFaille: faille.titreFaille,
        articleLoi: faille.articleLoi,
        source: faille.source,
        regle: faille.regle,
        reglesDetection: faille.reglesDetection as Prisma.InputJsonValue,
        jurisprudence: faille.jurisprudence as Prisma.InputJsonValue,
        templateLettre: faille.templateLettre,
        statut: estHistorique ? "ACTIVE" : "PROPOSEE",
      },
      create: {
        id: faille.id,
        typeInfraction: faille.typeInfraction,
        titreFaille: faille.titreFaille,
        articleLoi: faille.articleLoi,
        source: faille.source,
        regle: faille.regle,
        reglesDetection: faille.reglesDetection as Prisma.InputJsonValue,
        jurisprudence: faille.jurisprudence as Prisma.InputJsonValue,
        templateLettre: faille.templateLettre,
        statut: estHistorique ? "ACTIVE" : "PROPOSEE",
      },
    });
  }
  console.log(`Seed FailleJuridique catalogue : ${CATALOGUE_SOURCES.length} failles (dont ${[...isHistorique].length} ACTIVE).`);

  // 3) Utilisateurs de test (E2E / dev local uniquement — jamais en production)
  const estProduction = process.env.NODE_ENV === "production" || process.env.SEED_E2E_USERS === "0";
  if (estProduction) {
    console.log("Seed utilisateurs E2E : ignoré (production).");
    return;
  }
  const e2eUsers = [
    { email: "e2e-client@test.local", name: "Client E2E", role: Role.CLIENT, credits: 50 },
    { email: "e2e-juriste@test.local", name: "Juriste E2E", role: Role.JURISTE, credits: 0 },
    { email: "e2e-admin@test.local", name: "Admin E2E", role: Role.ADMIN, credits: 0 },
  ];
  for (const u of e2eUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, credits: u.credits },
      create: { email: u.email, name: u.name, role: u.role, credits: u.credits },
    });
  }
  console.log(`Seed utilisateurs E2E : ${e2eUsers.length} comptes prêts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());