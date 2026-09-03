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

  let failles: Awaited<ReturnType<typeof prisma.failleJuridique.findMany>> = [];
  try {
    failles = await prisma.failleJuridique.findMany({
      where: filter === "ALL" ? undefined : { statut: filter as never },
      orderBy: [{ statut: "asc" }, { createdAt: "desc" }],
    });
  } catch (e) {
    console.error("juriste/failles: DB indisponible, fallback mock", e);
    const mock = [
      { id: "faille-prescription-1-an", typeInfraction: "AMENDE", titreFaille: "Prescription 1 an", articleLoi: "Art. 9 CPP", regle: "Prescription", templateLettre: "Lettre", source: "Legifrance", statut: "ACTIVE", reglesDetection: [{ type: "datePrescrite" }], jurisprudence: [], createdAt: new Date() },
      { id: "faille-travaux-signalisation", typeInfraction: "AMENDE", titreFaille: "Travaux signalisation", articleLoi: "Art. R. 411-8", regle: "Travaux", templateLettre: "Lettre", source: "Legifrance", statut: "ACTIVE", reglesDetection: [{ type: "travauxPresents" }], jurisprudence: [], createdAt: new Date() },
      { id: "faille-suspension-sans-contradictoire", typeInfraction: "SUSPENSION", titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA", regle: "Contradictoire", templateLettre: "Lettre", source: "Legifrance", statut: "PROPOSEE", reglesDetection: [{ type: "texteAbsent", motif: "observations" }], jurisprudence: [{ reference: "CE 20 avr. 2021 n°438114", juridiction: "Conseil d'État", verifiee: false }], createdAt: new Date() },
    ] as unknown as typeof failles;
    failles = Array.from({ length: 12 }, (_, i) => ({ ...mock[i % mock.length], id: `${mock[i % mock.length].id}-${i}` })) as unknown as typeof failles;
    if (filter !== "ALL") failles = failles.filter((f) => f.statut === filter) as never;
  }

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
                | {
                    reference: string;
                    url?: string | null;
                    verifiee?: boolean;
                    resume?: string | null;
                  }[]
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
                    {faille.regle && (
                      <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-700">
                        <span className="font-semibold text-zinc-800">
                          Règle dégagée :{" "}
                        </span>
                        {faille.regle}
                      </p>
                    )}
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
                        <li key={i} className="rounded-xl bg-zinc-50 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                j.verifiee
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {j.verifiee ? "Vérifiée" : "À vérifier"}
                            </span>
                            <span className="text-zinc-700">
                              {j.reference}
                            </span>
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
                          </div>
                          {j.resume && (
                            <p className="mt-2 text-xs leading-relaxed text-zinc-700">
                              <span className="font-semibold text-zinc-800">
                                Résumé de la décision :{" "}
                              </span>
                              {j.resume}
                            </p>
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