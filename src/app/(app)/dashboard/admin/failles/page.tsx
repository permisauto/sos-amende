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

  const [failles, suspensionActive, stats] = await Promise.all([
    prisma.failleJuridique.findMany({
      where: filter === "ALL" ? undefined : { statut: filter as never },
      orderBy: { createdAt: "desc" },
    }),
    prisma.failleJuridique.count({
      where: { typeInfraction: "SUSPENSION", statut: "ACTIVE" },
    }),
    prisma.failleJuridique.groupBy({
      by: ["statut"],
      _count: true,
    }),
  ]);

  const aSuspensionActive = suspensionActive > 0;
  const nbActives = stats.find((x) => x.statut === "ACTIVE")?._count ?? 0;
  const nbProposees = stats.find((x) => x.statut === "PROPOSEE")?._count ?? 0;
  const nbInactives = stats.find((x) => x.statut === "INACTIVE")?._count ?? 0;

  const dto: FailleDto[] = failles.map((f) => ({
    id: f.id,
    typeInfraction: f.typeInfraction,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi,
    regle: f.regle,
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

      {/* Statistiques */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-700">Actives</p>
          <p className="mt-1 text-3xl font-bold text-emerald-900">
            {nbActives}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Utilisées par le moteur de détection
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">
            Propositions à valider
          </p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {nbProposees}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            À lire en détail avant activation
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Inactives</p>
          <p className="mt-1 text-3xl font-bold">{nbInactives}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Écartées ou désactivées
          </p>
        </div>
      </section>

      {nbProposees > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {nbProposees} proposition{nbProposees > 1 ? "s" : ""} en attente
                de validation
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Ouvrez « Lire en détail » pour examiner la base légale, le
                template de lettre et les références de jurisprudence avant de
                valider ou d&apos;écarter.
              </p>
            </div>
            <a
              href="/dashboard/admin/failles?f=PROPOSEE"
              className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Voir les propositions
            </a>
          </div>
        </div>
      )}
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