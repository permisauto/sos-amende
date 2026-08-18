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
    reglesDetection: [{ type: "etalonnageExpire" }],
    templateLettre: `Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule portant la plaque {plaque}, conteste l'avis de contravention n° {num_pv} établi au moyen d'un cinémomètre.

En application de l'article L. 130-3 du Code de la route et de l'arrêté du 27 mars 2007 relatif aux conditions de l'étalonnage des cinémomètres, la mesure doit être effectuée par un appareil dûment étalonné. Je demande la communication du certificat d'étalonnage de l'appareil utilisé, valable à la date de l'infraction, sous un délai de 30 jours. À défaut de production de ce certificat, l'amende doit être annulée.`,
    source: "Code de la route / Arrêté du 27 mars 2007",
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