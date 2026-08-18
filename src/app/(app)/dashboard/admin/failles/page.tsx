import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { synchroniserCatalogue } from "@/lib/auto-alimentation";
import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { FaillesAdmin, type FailleDto } from "./failles-admin";

export default async function AdminFaillesPage(
  props: PageProps<"/dashboard/admin/failles">,
) {
  await requireAdmin();
  // Auto-alimentation : les propositions du catalogue arrivent automatiquement
  // à l'ouverture de la page — l'admin ne fait que valider (ACTIVE/INACTIVE).
  // Idempotent : ne rétrograde jamais une faille déjà ACTIVE/INACTIVE.
  await synchroniserCatalogue();
  const { f } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "ALL";
  const filter = ["ACTIVE", "INACTIVE", "PROPOSEE", "ALL"].includes(raw)
    ? raw
    : "ALL";

  const [failles, suspensionActive] = await Promise.all([
    prisma.failleJuridique.findMany({
      where: filter === "ALL" ? undefined : { statut: filter as never },
      orderBy: { createdAt: "desc" },
    }),
    prisma.failleJuridique.count({
      where: { typeInfraction: "SUSPENSION", statut: "ACTIVE" },
    }),
  ]);

  const aSuspensionActive = suspensionActive > 0;

  const dto: FailleDto[] = failles.map((f) => ({
    id: f.id,
    typeInfraction: f.typeInfraction,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi,
    templateLettre: f.templateLettre,
    source: f.source,
    statut: f.statut,
    reglesDetection: f.reglesDetection as RegleDetection[] | null,
    jurisprudence: f.jurisprudence as JurisprudenceRef[] | null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Base juridique</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Gestion des failles juridiques et de leurs templates de lettre (réservé
        admin). La base s&apos;auto-alimente par mises à jour sourcées : les
        propositions (PROPOSEE) doivent être validées avant toute utilisation
        par le moteur.
      </p>
      <div className="mt-6">
        {!aSuspensionActive && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              Flux « Suspension de permis » : base juridique à compléter
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Le parcours suspension est fonctionnel côté produit, mais aucun
              fondement juridique n&apos;est encore validé pour ce type. Faites
              saisir les motifs par un juriste (typeInfraction : SUSPENSION)
              avant de l&apos;activer — garde-fou : aucun article ne doit être
              inventé.
            </p>
          </div>
        )}
        <FaillesAdmin failles={dto} filter={filter} />
      </div>
    </div>
  );
}