import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";

/**
 * Portabilité des données (RGPD, art. 20) : export JSON des données
 * personnelles de l'utilisateur connecté (profil, dossiers, paiements,
 * mises en relation avocat, rappels). Champs internes exclus : passwordHash,
 * jetons next-auth, stripeCustomerId.
 */
export async function GET() {
  const user = await requireUser();

  const [dossiers, payments, matches, rappels] = await Promise.all([
    prisma.dossier.findMany({
      where: { userId: user.id },
      include: {
        courriers: { orderBy: { createdAt: "asc" } },
        preuves: { orderBy: { createdAt: "asc" } },
        evenements: { orderBy: { createdAt: "asc" } },
        failleJuridique: { select: { titreFaille: true, articleLoi: true } },
        faillesRetenues: { include: { faille: { select: { titreFaille: true, articleLoi: true } } } },
        lawyerMatch: {
          select: {
            statut: true,
            motif: true,
            partnerName: true,
            partnerBarreau: true,
            partnerEmail: true,
            note: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lawyerMatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rappel.findMany({
      where: { dossier: { userId: user.id } },
      orderBy: { sentAt: "asc" },
    }),
  ]);

  const exportData = {
    genererLe: new Date().toISOString(),
    logiciel: "SOS Amende",
    utilisateur: {
      id: user.id,
      email: user.email,
      nom: user.name,
      role: user.role,
      credits: user.credits,
    },
    dossiers: dossiers.map((d) => ({
      id: d.id,
      type: d.type,
      statut: d.statut,
      prix: d.prix.toString(),
      pvUrl: d.pvUrl,
      extractedData: d.extractedData,
      faille: d.failleJuridique
        ? { titre: d.failleJuridique.titreFaille, article: d.failleJuridique.articleLoi }
        : null,
      faillesDetectees: d.faillesRetenues.map((df) => ({
        statut: df.statut,
        titre: df.faille.titreFaille,
        article: df.faille.articleLoi,
      })),
      lettreGeneree: d.lettreGeneree,
      motifRejet: d.motifRejet,
      decisionOmp: d.decisionOmp,
      decisionDetail: d.decisionDetail,
      dateLimite: d.dateLimite,
      courriers: d.courriers.map((c) => ({
        pdfUrl: c.pdfUrl,
        signatureUrl: c.signatureUrl,
        preuveDepotUrl: c.preuveDepotUrl,
        createdAt: c.createdAt,
      })),
      preuves: d.preuves.map((p) => ({
        nom: p.nom,
        type: p.type,
        url: p.url,
        createdAt: p.createdAt,
      })),
      evenements: d.evenements.map((e) => ({
        type: e.type,
        detail: e.detail,
        createdAt: e.createdAt,
      })),
      miseEnRelationAvocat: d.lawyerMatch,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    paiements: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount: p.amount.toString(),
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
    })),
    misesEnRelationAvocat: matches.map((m) => ({
      dossierId: m.dossierId,
      statut: m.statut,
      motif: m.motif,
      partnerName: m.partnerName,
      partnerBarreau: m.partnerBarreau,
      createdAt: m.createdAt,
    })),
    rappels: rappels.map((r) => ({
      dossierId: r.dossierId,
      type: r.type,
      sentAt: r.sentAt,
    })),
  };

  const body = JSON.stringify(exportData, null, 2);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sos-amende-donnees-${date}.json"`,
    },
  });
}