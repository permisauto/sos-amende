import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const failles = [
  {
    id: "faille-prescription-1-an",
    typeInfraction: "AMENDE",
    titreFaille: "Prescription de l'action publique (1 an)",
    articleLoi: "Article 9 du Code de procédure pénale",
    regle:
      "L'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise (art. 9 CPP) : un avis notifié plus d'un an après les faits porte sur une infraction prescrite, l'amende doit être annulée.",
    reglesDetection: [{ type: "datePrescrite" }],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule portant la plaque {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

En application de l'article 9 du Code de procédure pénale, l'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. Or, plus d'un an s'est écoulé entre la date de l'infraction et la notification du présent avis.

L'infraction est donc prescrite. Je demande en conséquence l'annulation de l'amende qui m'est réclamée.`,
    source: "Code de procédure pénale",
  },
  {
    id: "faille-mentions-obligatoires",
    typeInfraction: "AMENDE",
    titreFaille: "Défaut de mentions obligatoires sur l'avis de contravention",
    articleLoi: "Articles R. 246-1 et suivants du Code de la route",
    regle:
      "L'avis de contravention doit comporter l'ensemble des mentions obligatoires du code de la route (signature de l'agent, heure de constatation, matricule…) ; leur absence entache le titre exécutoire d'irrégularité.",
    reglesDetection: [
      { type: "champAbsent", champ: "numTelePaiement" },
      { type: "champAbsent", champ: "cle" },
    ],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule portant la plaque {plaque}, conteste l'avis de contravention n° {num_pv}.

Cet avis ne comporte pas l'ensemble des mentions obligatoires prévues par le Code de la route (notamment la signature de l'agent verbalisateur, l'heure de constatation et le matricule de l'agent). Le titre exécutoire est ainsi entaché d'une irrégularité.

Je demande en conséquence l'annulation de l'amende qui m'est réclamée.`,
    source: "Code de la route",
  },
  {
    id: "faille-erreur-plaque",
    typeInfraction: "AMENDE",
    titreFaille: "Erreur de plaque d'immatriculation",
    articleLoi: "Article 530-1 du Code de procédure pénale",
    regle:
      "L'erreur de plaque d'immatriculation sur l'avis de contravention (identification du véhicule ou de son titulaire) permet au titulaire qui n'est pas l'auteur de l'infraction d'obtenir l'exonération (art. 530-1 CPP).",
    reglesDetection: [{ type: "plaqueIncorrecte" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv}.

Conformément à l'article 530-1 du Code de procédure pénale, je demande l'exonération de l'amende au motif que je ne suis pas l'auteur de l'infraction : la plaque {plaque} mentionnée sur l'avis de contravention ne correspond pas à mon véhicule.

Je demande en conséquence l'annulation de l'amende qui m'est réclamée.`,
    source: "Code de procédure pénale",
  },
  {
    id: "faille-certificat-etalonnage",
    typeInfraction: "AMENDE",
    titreFaille: "Demande de communication du certificat d'étalonnage du cinémomètre",
    articleLoi: "Article L. 130-3 du Code de la route et arrêté du 27 mars 2007",
    regle:
      "La mesure de vitesse doit être effectuée par un appareil dûment étalonné (art. L. 130-3 CR, arrêté du 27 mars 2007) : le certificat d'étalonnage valable à la date de l'infraction doit être communiqué sur demande, à défaut l'amende est annulée.",
    reglesDetection: [{ type: "etalonnageExpire" }],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule portant la plaque {plaque}, conteste l'avis de contravention n° {num_pv} établi au moyen d'un cinémomètre.

En application de l'article L. 130-3 du Code de la route et de l'arrêté du 27 mars 2007 relatif aux conditions de l'étalonnage des cinémomètres, la mesure doit être effectuée par un appareil dûment étalonné. Je demande la communication du certificat d'étalonnage de l'appareil utilisé, valable à la date de l'infraction, sous un délai de 30 jours. À défaut de production de ce certificat, l'amende doit être annulée.`,
    source: "Code de la route / Arrêté du 27 mars 2007",
  },
  {
    id: "faille-travaux-signalisation",
    typeInfraction: "AMENDE",
    titreFaille: "Travaux et signalisation temporaire non conforme",
    articleLoi: "Article R. 411-8 du Code de la route",
    regle: "La signalisation temporaire de travaux doit être conforme et lisible ; son absence ou non-conformité vicie la constatation de l'infraction.",
    reglesDetection: [{ type: "travauxPresents" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : des travaux avec signalisation temporaire étaient présents au lieu dit {lieu} le {date}. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation.`,
    source: "Code de la route",
  },
  {
    id: "faille-meteo-visibilite",
    typeInfraction: "AMENDE",
    titreFaille: "Conditions météo dégradées affectant la visibilité / signalisation",
    articleLoi: "Article R. 413-17 du Code de la route",
    regle: "Des conditions météo dégradées (pluie forte, brouillard, verglas) affectant la visibilité et la lisibilité de la signalisation peuvent vicier la constatation.",
    reglesDetection: [{ type: "meteoDefavorable" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : le {date} à {lieu}, les conditions météo étaient dégradées ({conditions_meteo}), affectant la visibilité et la lisibilité de la signalisation (art. R. 413-17 CR).`,
    source: "Code de la route",
  },
  {
    id: "faille-cession-vehicule",
    typeInfraction: "AMENDE",
    titreFaille: "Véhicule cédé avant l'infraction",
    articleLoi: "Article 529-10 du Code de procédure pénale",
    regle: "Le titulaire qui établit avoir cédé son véhicule avant l'infraction (certificat de cession) n'est pas redevable de l'amende.",
    reglesDetection: [{ type: "vehiculeCede" }, { type: "texteContient", motif: "cession" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : mon véhicule {plaque} avait été cédé le {date} (certificat de cession joint), soit avant l'infraction constatée le {date}. En application de l'article 529-10 CPP, je ne suis pas redevable.`,
    source: "Code de procédure pénale",
  },
  {
    id: "faille-conducteur-different",
    typeInfraction: "AMENDE",
    titreFaille: "Conducteur différent / véhicule volé / usurpation",
    articleLoi: "Article 529-10 du Code de procédure pénale",
    regle: "Le titulaire qui établit ne pas être le conducteur (vol, usurpation, prêt) peut obtenir l'exonération sur justificatif.",
    reglesDetection: [{ type: "conducteurDifferent" }, { type: "vehiculeVole" }, { type: "texteContient", motif: "vol" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : je n'étais pas le conducteur du véhicule {plaque} le {date} (véhicule volé / usurpation / prêt). Pièce jointe à l'appui.`,
    source: "Code de procédure pénale",
  },
  {
    id: "faille-paiement-deja-effectue",
    typeInfraction: "AMENDE",
    titreFaille: "Paiement déjà effectué — double sanction",
    articleLoi: "Article 529-2 du Code de procédure pénale",
    regle: "L'amende ne peut être exigée deux fois : le paiement déjà effectué (preuve de télépaiement) éteint l'action.",
    reglesDetection: [{ type: "paiementDejaFait" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : cette amende a déjà été réglée le {date} (référence {numTelePaiement}). Je joins la preuve de paiement. En application de l'article 529-2 CPP, aucune nouvelle exaction ne peut être réclamée.`,
    source: "Code de procédure pénale",
  },
  {
    id: "faille-adresse-erronee",
    typeInfraction: "AMENDE",
    titreFaille: "Adresse / lieu erroné sur le PV",
    articleLoi: "Article 429 du Code de procédure pénale",
    regle: "L'erreur sur l'adresse du titulaire ou le lieu de constatation vicie la régularité du PV et ouvre droit à l'exonération.",
    reglesDetection: [{ type: "adresseIncorrecte" }],
    templateLettre: `Je soussigné(e) {nom}, conteste l'avis n° {num_pv} : l'adresse indiquée ({adresse}) / le lieu ({lieu}) est erroné. Cette erreur matérielle entache la régularité du PV (art. 429 CPP).`,
    source: "Code de procédure pénale",
  },
];

async function main() {
  for (const faille of failles) {
    await prisma.failleJuridique.upsert({
      where: { id: faille.id },
      update: faille,
      create: faille,
    });
  }
  console.log(`Seed FailleJuridique : ${failles.length} failles insérées.`);

  // Utilisateurs de test (E2E / dev local)
  const e2eUsers: {
    email: string;
    name: string;
    role: Role;
    credits: number;
  }[] = [
    {
      email: "e2e-client@test.local",
      name: "Client E2E",
      role: Role.CLIENT,
      credits: 10,
    },
    {
      email: "e2e-juriste@test.local",
      name: "Juriste E2E",
      role: Role.JURISTE,
      credits: 0,
    },
    {
      email: "e2e-admin@test.local",
      name: "Admin E2E",
      role: Role.ADMIN,
      credits: 0,
    },
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