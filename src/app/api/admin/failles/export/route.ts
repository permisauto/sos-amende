import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

/**
 * Export de la base juridique (JSON) — réservé aux administrateurs.
 * Sert à la maintenance « par mises à jour » : export → modification →
 * réimport via l'action importerFailles.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") {
    return new Response("Non autorisé", { status: 401 });
  }

  const failles = await prisma.failleJuridique.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Réordonne les clés pour un JSON lisible (reglesDetection + jurisprudence
  // après les champs texte), sans transformation de données.
  const sortie = failles.map((f) => ({
    id: f.id,
    typeInfraction: f.typeInfraction,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi,
    regle: f.regle,
    templateLettre: f.templateLettre,
    source: f.source,
    statut: f.statut,
    reglesDetection: f.reglesDetection,
    jurisprudence: f.jurisprudence,
  }));

  return new Response(JSON.stringify(sortie, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="base-juridique.json"',
    },
  });
}