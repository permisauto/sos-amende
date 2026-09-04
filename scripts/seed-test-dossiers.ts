import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role, DossierStatut, DossierType, FailleStatut } from "../src/generated/prisma/client";
import { storageWrite } from "../src/lib/storage";
import { randomUUID } from "crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // Get test users
  const client = await prisma.user.findUnique({ where: { email: "e2e-client@test.local" } });
  const juriste = await prisma.user.findUnique({ where: { email: "e2e-juriste@test.local" } });
  if (!client || !juriste) throw new Error("Users not found");

  // Get all ACTIVE failles
  const failles = await prisma.failleJuridique.findMany({ where: { statut: "ACTIVE" } });
  if (failles.length === 0) throw new Error("No ACTIVE failles");

  // Create a fake PV PNG (1x1 transparent) for each dossier
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const pngBuffer = Buffer.from(pngBase64, "base64");

  // 8 comprehensive test dossiers covering all statuts
  const testDossiers = [
    // 1. EN_ANALYSE - amende, just uploaded
    {
      type: "AMENDE" as DossierType,
      statut: "EN_ANALYSE" as DossierStatut,
      plaque: "AB-123-CD",
      numPv: "P123456789",
      date: "2026-08-15",
      montant: 135,
      lieu: "A6 km 45, sens Paris-Lyon",
      extractedData: {
        plaque: "AB-123-CD",
        date: "2026-08-15",
        heure: "14:32",
        montant: 135,
        numPv: "P123456789",
        lieu: "A6 km 45, sens Paris-Lyon",
        radarId: "R-2026-0042",
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: true, meteo_defavorable: false },
      pvPath: "uploads/pv/pv-1.png",
    },
    // 2. A_VERIFIER - amende, analysed, letter generated
    {
      type: "AMENDE" as DossierType,
      statut: "A_VERIFIER" as DossierStatut,
      plaque: "EF-456-GH",
      numPv: "P234567890",
      date: "2026-07-20",
      montant: 90,
      lieu: "Rue de la Paix, Paris 2e",
      extractedData: {
        plaque: "EF-456-GH",
        date: "2026-07-20",
        heure: "10:15",
        montant: 90,
        numPv: "P234567890",
        lieu: "Rue de la Paix, Paris 2e",
        radarId: null,
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: false, meteo_defavorable: true, conditions_meteo: "brouillard épais" },
      pvPath: "uploads/pv/pv-2.png",
    },
    // 3. PRET - amende, juriste validated, ready for signature
    {
      type: "AMENDE" as DossierType,
      statut: "PRET" as DossierStatut,
      plaque: "IJ-789-KL",
      numPv: "P345678901",
      date: "2026-06-10",
      montant: 45,
      lieu: "Boulevard périphérique, sortie Porte de Bagnolet",
      extractedData: {
        plaque: "IJ-789-KL",
        date: "2026-06-10",
        heure: "08:45",
        montant: 45,
        numPv: "P345678901",
        lieu: "Boulevard périphérique, sortie Porte de Bagnolet",
        radarId: "R-2025-0123",
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: false, meteo_defavorable: false },
      pvPath: "uploads/pv/pv-3.png",
      valideLe: new Date("2026-08-01"),
    },
    // 4. ENVOYE - amende, client sent LRAR
    {
      type: "AMENDE" as DossierType,
      statut: "ENVOYE" as DossierStatut,
      plaque: "MN-012-OP",
      numPv: "P456789012",
      date: "2026-05-01",
      montant: 135,
      lieu: "RN7, commune de Fontainebleau",
      extractedData: {
        plaque: "MN-012-OP",
        date: "2026-05-01",
        heure: "16:20",
        montant: 135,
        numPv: "P456789012",
        lieu: "RN7, commune de Fontainebleau",
        radarId: "R-2025-0456",
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: true, meteo_defavorable: false },
      pvPath: "uploads/pv/pv-4.png",
      valideLe: new Date("2026-07-15"),
      dateLimite: new Date("2026-08-15"),
    },
    // 5. RESOLU - amende, OMP accepted (annulée)
    {
      type: "AMENDE" as DossierType,
      statut: "RESOLU" as DossierStatut,
      plaque: "QR-345-ST",
      numPv: "P567890123",
      date: "2026-03-15",
      montant: 135,
      lieu: "A10, aire de Tours",
      extractedData: {
        plaque: "QR-345-ST",
        date: "2026-03-15",
        heure: "11:00",
        montant: 135,
        numPv: "P567890123",
        lieu: "A10, aire de Tours",
        radarId: null,
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: false, meteo_defavorable: false },
      pvPath: "uploads/pv/pv-5.png",
      valideLe: new Date("2026-06-01"),
      dateLimite: new Date("2026-05-15"),
      decisionOmp: "ACCEPTE" as const,
      decisionDetail: "Amende annulée - prescription acquise",
    },
    // 6. SUSPENSION - EN_ANALYSE
    {
      type: "SUSPENSION" as DossierType,
      statut: "EN_ANALYSE" as DossierStatut,
      plaque: "UV-678-WX",
      numPv: "S123456789",
      date: "2026-08-10",
      montant: 0,
      lieu: "Préfecture de Lyon",
      extractedData: {
        plaque: "UV-678-WX",
        date: "2026-08-10",
        heure: "09:00",
        montant: 0,
        numPv: "S123456789",
        lieu: "Préfecture de Lyon",
        radarId: null,
        decisionType: "SUSPENSION_6_MOIS",
        motif: "Alcoolémie 0,45 mg/L",
      },
      questionnaire: {},
      pvPath: "uploads/pv/pv-6.png",
    },
    // 7. SUSPENSION - A_VERIFIER
    {
      type: "SUSPENSION" as DossierType,
      statut: "A_VERIFIER" as DossierStatut,
      plaque: "YZ-901-AB",
      numPv: "S234567890",
      date: "2026-07-01",
      montant: 0,
      lieu: "Préfecture de Marseille",
      extractedData: {
        plaque: "YZ-901-AB",
        date: "2026-07-01",
        heure: "14:00",
        montant: 0,
        numPv: "S234567890",
        lieu: "Préfecture de Marseille",
        radarId: null,
        decisionType: "SUSPENSION_12_MOIS",
        motif: "Stupéfiants",
      },
      questionnaire: {},
      pvPath: "uploads/pv/pv-7.png",
    },
    // 8. REJETE - amende, juriste rejected
    {
      type: "AMENDE" as DossierType,
      statut: "REJETE" as DossierStatut,
      plaque: "CD-234-EF",
      numPv: "P678901234",
      date: "2026-04-01",
      montant: 135,
      lieu: "A7, péage de Salon-de-Provence",
      extractedData: {
        plaque: "CD-234-EF",
        date: "2026-04-01",
        heure: "12:30",
        montant: 135,
        numPv: "P678901234",
        lieu: "A7, péage de Salon-de-Provence",
        radarId: "R-2025-0789",
        paiementDejaFait: false,
        vehiculeCede: false,
        vehiculeVole: false,
        conducteurDifferent: false,
      },
      questionnaire: { travaux_presents: false, meteo_defavorable: false },
      pvPath: "uploads/pv/pv-8.png",
      motifRejet: "Aucune faille applicable : PV régulier, toutes mentions présentes, pas de prescription.",
    },
  ];

  for (let i = 0; i < testDossiers.length; i++) {
    const d = testDossiers[i];
    const faille = failles[i % failles.length];

    // Upload PV
    const pvKey = `uploads/pv/test-${d.numPv}.png`;
    await storageWrite(pvKey, pngBuffer);

    // Create dossier
    const dossier = await prisma.dossier.create({
      data: {
        userId: client.id,
        type: d.type,
        statut: d.statut,
        pvUrl: pvKey,
        pvTexte: `AVIS DE CONTRAVENTION\nN° ${d.numPv}\nDate: ${d.date}\nPlaque: ${d.plaque}\nLieu: ${d.lieu}\nMontant: ${d.montant} EUR`,
        extractedData: d.extractedData as any,
        failleJuridiqueId: faille.id,
        dateLimite: d.dateLimite,
        valideLe: d.valideLe,
        motifRejet: d.motifRejet,
        decisionOmp: d.decisionOmp,
        decisionDetail: d.decisionDetail,
        prix: d.type === "AMENDE" ? 3900 : 5900, // cents
      },
    });

    // Create DossierFaille links for all candidate failles
    for (const f of failles) {
      await prisma.dossierFaille.create({
        data: {
          dossierId: dossier.id,
          failleId: f.id,
          statut: f.id === faille.id ? "CONFIRMEE" : "CANDIDATE",
        },
      });
    }

    // Generate letter if A_VERIFIER or beyond
    if (["A_VERIFIER", "PRET", "ENVOYE", "RESOLU", "REJETE"].includes(d.statut)) {
      const lettre = faille.templateLettre
        .replace(/\{nom\}/g, "Jean Dupont")
        .replace(/\{plaque\}/g, d.plaque)
        .replace(/\{num_pv\}/g, d.numPv)
        .replace(/\{date\}/g, d.date)
        .replace(/\{montant\}/g, `${d.montant} €`)
        .replace(/\{radarId\}/g, d.extractedData.radarId ?? "")
        .replace(/\{lieu\}/g, d.lieu)
        .replace(/\{conditions_meteo\}/g, (d.questionnaire as any)?.conditions_meteo ?? "")
        .replace(/\{duree\}/g, "6 mois")
        .replace(/\{adresse\}/g, "123 Rue Test, 75000 Paris");

      await prisma.dossier.update({
        where: { id: dossier.id },
        data: { lettreGeneree: lettre },
      });
    }

    // Create signature + PDF + Courrier for PRET/ENVOYE/RESOLU
    if (["PRET", "ENVOYE", "RESOLU"].includes(d.statut)) {
      const sigKey = `uploads/signatures/sig-${d.numPv}.png`;
      await storageWrite(sigKey, pngBuffer);

      const pdfKey = `uploads/lettres/lettre-${d.numPv}.pdf`;
      await storageWrite(pdfKey, Buffer.from("%PDF-1.4 mock"));

      await prisma.courrier.create({
        data: {
          dossierId: dossier.id,
          pdfUrl: pdfKey,
          signatureUrl: sigKey,
          preuveDepotUrl: d.statut === "ENVOYE" ? `uploads/accuses/accuse-${d.numPv}.pdf` : null,
        },
      });

      // Add DossierEvents timeline
      const events: Array<{ type: string; detail: string; createdAt?: Date }> = [
        { type: "CREATION", detail: "Dossier créé", createdAt: new Date(d.date) },
        { type: "ANALYSE", detail: "Analyse OCR + questionnaire complétée", createdAt: new Date(Date.parse(d.date) + 86400000) },
        { type: "LETTRE_GENEREE", detail: `Lettre générée (faille: ${faille.titreFaille})`, createdAt: d.valideLe ? new Date(d.valideLe.getTime() - 86400000) : undefined },
        { type: "VALIDATION", detail: "Lettre validée par le juriste", createdAt: d.valideLe },
      ];
      if (d.statut === "ENVOYE" || d.statut === "RESOLU") {
        events.push({ type: "ENVOI", detail: "Envoyé par le client en recommandé avec accusé de réception", createdAt: d.dateLimite ? new Date(d.dateLimite.getTime() - 86400000) : undefined });
      }
      if (d.statut === "RESOLU") {
        events.push({ type: "DECISION", detail: `Décision OMP: ${d.decisionOmp} - ${d.decisionDetail}`, createdAt: new Date() });
      }

      for (const ev of events) {
        if (ev.createdAt) {
          await prisma.dossierEvent.create({
            data: { dossierId: dossier.id, type: ev.type, detail: ev.detail, createdAt: ev.createdAt },
          });
        }
      }
    }

    // Add rejection event for REJETE
    if (d.statut === "REJETE") {
      await prisma.dossierEvent.create({
        data: {
          dossierId: dossier.id,
          type: "REJET",
          detail: `Rejeté par le juriste : ${d.motifRejet}`,
          createdAt: new Date(),
        },
      });
      // Credit refund for rejection
      await prisma.user.update({
        where: { id: client.id },
        data: { credits: { increment: 1 } },
      });
    }

    console.log(`Created dossier ${i + 1}: ${d.numPv} (${d.statut})`);
  }

  console.log("All test dossiers created successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());