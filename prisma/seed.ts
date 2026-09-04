import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { CATALOGUE_SOURCES } from "../src/lib/catalogue-sources";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  // 1) FailleJuridique : toutes les 28 failles du catalogue (ACTIVE pour les 11 historiques, PROPOSEE pour les 17 nouvelles)
  for (const faille of CATALOGUE_SOURCES) {
    const isHistorique = [
      "faille-prescription-1-an",
      "faille-mentions-obligatoires",
      "faille-erreur-plaque",
      "faille-certificat-etalonnage",
      "faille-travaux-signalisation",
      "faille-meteo-visibilite",
      "faille-cession-vehicule",
      "faille-conducteur-different",
      "faille-paiement-deja-effectue",
      "faille-adresse-erronee",
      "faille-prescription-peine-3ans",
    ].includes(faille.id);

    await prisma.failleJuridique.upsert({
      where: { id: faille.id },
      update: {
        typeInfraction: faille.typeInfraction,
        titreFaille: faille.titreFaille,
        articleLoi: faille.articleLoi,
        source: faille.source,
        regle: faille.regle,
        reglesDetection: faille.reglesDetection as any,
        jurisprudence: faille.jurisprudence as any,
        templateLettre: faille.templateLettre,
        statut: isHistorique ? "ACTIVE" : "PROPOSEE",
      },
      create: {
        id: faille.id,
        typeInfraction: faille.typeInfraction,
        titreFaille: faille.titreFaille,
        articleLoi: faille.articleLoi,
        source: faille.source,
        regle: faille.regle,
        reglesDetection: faille.reglesDetection as any,
        jurisprudence: faille.jurisprudence as any,
        templateLettre: faille.templateLettre,
        statut: isHistorique ? "ACTIVE" : "PROPOSEE",
      },
    });
  }
  console.log(`Seed FailleJuridique : ${CATALOGUE_SOURCES.length} failles insérées.`);

  // 2) Utilisateurs de test (E2E / dev local)
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