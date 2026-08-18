import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";

const statusMeta: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
  INACTIVE: { label: "Inactive", cls: "bg-zinc-100 text-zinc-500" },
  PROPOSEE: {
    label: "Proposition à valider",
    cls: "bg-amber-100 text-amber-800",
  },
};

export default async function JuristeFaillesPage(
  props: PageProps<"/dashboard/juriste/failles">,
) {
  await requireJuriste();
  const { f } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "ALL";
  const filter = ["ACTIVE", "INACTIVE", "PROPOSEE", "ALL"].includes(raw)
    ? raw
    : "ALL";

  const failles = await prisma.failleJuridique.findMany({
    where: filter === "ALL" ? undefined : { statut: filter as never },
    orderBy: [{ statut: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/juriste"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour à la file d'attente
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        Bibliothèque des failles juridiques
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Référentiel des failles avec articles de loi et jurisprudences sourcées
        (base auto-alimentée). Les propositions (PROPOSEE) arrivent de
        l&apos;auto-alimentation ; l&apos;admin valide leur activation.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { value: "ALL", label: "Toutes" },
          { value: "ACTIVE", label: "Actives" },
          { value: "PROPOSEE", label: "Propositions" },
          { value: "INACTIVE", label: "Inactives" },
        ].map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/juriste/failles${item.value === "ALL" ? "" : `?f=${item.value}`}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === item.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {failles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            Aucune faille dans cette catégorie.
          </p>
        ) : (
          failles.map((faille) => {
            const meta = statusMeta[faille.statut] ?? {
              label: faille.statut,
              cls: "bg-zinc-100 text-zinc-500",
            };
            const jurisprudence = (
              faille.jurisprudence as
                | { reference: string; url?: string | null; verifiee?: boolean }[]
                | null
            ) ?? [];
            return (
              <article
                key={faille.id}
                className="rounded-2xl border border-zinc-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{faille.titreFaille}</h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-zinc-700">
                      {faille.articleLoi}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {faille.typeInfraction === "AMENDE"
                        ? "Amende"
                        : "Suspension"}
                      {faille.source ? ` · Source : ${faille.source}` : ""}
                    </p>
                  </div>
                </div>

                {jurisprudence.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Jurisprudence
                    </h3>
                    <ul className="mt-2 flex flex-col gap-2">
                      {jurisprudence.map((j, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              j.verifiee
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {j.verifiee ? "Vérifiée" : "À vérifier"}
                          </span>
                          <span className="text-zinc-700">{j.reference}</span>
                          {j.url && (
                            <a
                              href={j.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-emerald-700 hover:underline"
                            >
                              Consulter la source
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {faille.reglesDetection && (
                  <p className="mt-4 text-xs text-zinc-500">
                    {(faille.reglesDetection as unknown[]).length} règle(s) de
                    détection automatique.
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}