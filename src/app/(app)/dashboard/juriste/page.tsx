import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";

const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_ANALYSE: "En analyse",
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  EN_ATTENTE_VALIDATION: "À valider par le juriste",
  EN_ATTENTE_PRE_SIGNATURE: "En attente de signature client",
  A_VERIFIER: "À vérifier",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  REJETE: "Rejeté",
  ERREUR_TECHNIQUE: "Erreur technique",
  RESOLU: "Résolu",
  ANNULE: "Annulé",
};

const statusValues = [
  "BROUILLON",
  "EN_ANALYSE",
  "EN_ATTENTE_PAIEMENT",
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_PRE_SIGNATURE",
  "A_VERIFIER",
  "PRET",
  "ENVOYE",
  "REJETE",
  "ERREUR_TECHNIQUE",
  "RESOLU",
  "ANNULE",
] as const;
type Statut = (typeof statusValues)[number];

const filters = [
  { value: "EN_ATTENTE_VALIDATION", label: "À valider / à approuver" },
  { value: "EN_ATTENTE_PRE_SIGNATURE", label: "En attente de signature" },
  { value: "EN_ATTENTE_PAIEMENT", label: "En attente de paiement" },
  { value: "EN_ANALYSE", label: "À analyser" },
  { value: "ENVOYE", label: "Envoyés" },
  { value: "ALL", label: "Tous" },
];

const filterStatuts: Record<string, Statut[] | "ALL"> = {
  EN_ATTENTE_VALIDATION: ["EN_ATTENTE_VALIDATION", "A_VERIFIER", "PRET"],
  EN_ATTENTE_PRE_SIGNATURE: ["EN_ATTENTE_PRE_SIGNATURE"],
  EN_ATTENTE_PAIEMENT: ["EN_ATTENTE_PAIEMENT", "BROUILLON"],
  EN_ANALYSE: ["EN_ANALYSE"],
  ENVOYE: ["ENVOYE"],
  ALL: "ALL",
};

const stagesJuriste: Array<{
  key: string;
  label: string;
  statuts: string[];
}> = [
  {
    key: "paiement",
    label: "En attente de paiement",
    statuts: ["BROUILLON", "EN_ATTENTE_PAIEMENT"],
  },
  { key: "analyse", label: "À analyser", statuts: ["EN_ANALYSE"] },
  {
    key: "validation",
    label: "Lettres à valider / à approuver",
    statuts: ["EN_ATTENTE_VALIDATION", "A_VERIFIER", "PRET"],
  },
  {
    key: "signature",
    label: "En attente de signature client",
    statuts: ["EN_ATTENTE_PRE_SIGNATURE"],
  },
  { key: "envoye", label: "Envoyés", statuts: ["ENVOYE"] },
  {
    key: "cloture",
    label: "Clôturés",
    statuts: ["RESOLU", "REJETE", "ANNULE", "ERREUR_TECHNIQUE"],
  },
];

const statutBadge: Record<string, string> = {
  EN_ATTENTE_VALIDATION: "bg-amber-100 text-amber-800",
  EN_ATTENTE_PRE_SIGNATURE: "bg-indigo-100 text-indigo-800",
  EN_ATTENTE_PAIEMENT: "bg-zinc-100 text-zinc-600",
  PRET: "bg-amber-100 text-amber-800",
  A_VERIFIER: "bg-indigo-100 text-indigo-800",
  ENVOYE: "bg-emerald-100 text-emerald-800",
  REJETE: "bg-red-100 text-red-800",
  RESOLU: "bg-emerald-100 text-emerald-800",
};

export default async function JuristePage(
  props: PageProps<"/dashboard/juriste">,
) {
  const juriste = await requireJuriste();
  const { f } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "ALL";
  const statut: Statut | "ALL" =
    raw === "ALL"
      ? "ALL"
      : statusValues.includes(raw as Statut)
        ? (raw as Statut)
        : "ALL";

  let dossiers: Array<{
    id: string;
    type: "AMENDE" | "SUSPENSION";
    statut: string;
    extractedData: unknown;
    createdAt: Date;
    user: { name: string | null; email: string | null };
    failleJuridique: { titreFaille: string } | null;
  }> = [];
  let stats: Array<{ statut: string; _count: number }> = [];
  let nonLus = new Map<string, number>();
  let nonLusEquipe = new Map<string, number>();
  try {
    const selection = filterStatuts[statut] ?? "ALL";
    const where = selection === "ALL" ? undefined : { statut: { in: selection } };
    const res = await Promise.all([
      prisma.dossier.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          failleJuridique: { select: { titreFaille: true } },
        },
      }),
      prisma.dossier.groupBy({ by: ["statut"], _count: true }),
      prisma.message.groupBy({
        by: ["dossierId"],
        where: { lu: false, auteurId: { not: juriste.id } },
        _count: { _all: true },
      }),
      prisma.messageInterne.groupBy({
        by: ["dossierId"],
        where: { lu: false, expediteurId: { not: juriste.id } },
        _count: { _all: true },
      }),
    ]);
    dossiers = res[0];
    stats = res[1] as Array<{ statut: string; _count: number }>;
    nonLus = new Map(res[2].map((g) => [g.dossierId, g._count._all]));
    nonLusEquipe = new Map(res[3].map((g) => [g.dossierId, g._count._all]));
  } catch (e) {
    console.error("juriste dashboard: DB indisponible", e);
  }

  const countBy = (s: string) =>
    stats.find((x) => x.statut === s)?._count ?? 0;

  const groupes = stagesJuriste
    .map((stage) => ({
      ...stage,
      dossiers: dossiers.filter((d) => stage.statuts.includes(d.statut)),
    }))
    .filter((g) => g.dossiers.length > 0);

  const renderLigne = (item: (typeof dossiers)[number]) => {
    const data = item.extractedData as {
      num_pv?: string;
      plaque?: string;
    } | null;
    return (
      <tr key={item.id} className="hover:bg-zinc-50">
        <td className="px-4 py-3">
          <Link
            href={`/dashboard/juriste/${item.id}`}
            className="font-medium hover:text-emerald-700"
          >
            {item.user.name ?? item.user.email}
          </Link>
          <p className="text-xs text-zinc-500">{item.user.email}</p>
          {(nonLus.get(item.id) ?? 0) > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              {(nonLus.get(item.id) ?? 0) > 1
                ? `${nonLus.get(item.id)} nouveaux`
                : "Nouveau"}
            </span>
          )}
          {(nonLusEquipe.get(item.id) ?? 0) > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
              Équipe : {(nonLusEquipe.get(item.id) ?? 0)} nouveau
              {nonLusEquipe.get(item.id)! > 1 ? "x" : ""}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-zinc-600">
          {data?.num_pv ?? "—"}
          <p className="text-xs text-zinc-500">{data?.plaque ?? ""}</p>
        </td>
        <td className="px-4 py-3 text-zinc-600">
          {item.type === "AMENDE" ? "Amende" : "Suspension"}
        </td>
        <td className="px-4 py-3 text-zinc-600">
          {item.failleJuridique?.titreFaille ?? "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              statutBadge[item.statut] ?? "bg-zinc-100 text-zinc-700"
            }`}
          >
            {statusLabels[item.statut] ?? item.statut}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-500">
          {item.createdAt.toLocaleDateString("fr-FR")}
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Validez les lettres, suivez les envois et renseignez les décisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/juriste/failles"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Bibliothèque juridique
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">À valider</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {countBy("EN_ATTENTE_VALIDATION") + countBy("PRET")}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Lettres générées à vérifier avant envoi
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm font-medium text-indigo-700">À signer</p>
          <p className="mt-1 text-3xl font-bold text-indigo-900">
            {countBy("EN_ATTENTE_PRE_SIGNATURE")}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            En attente de la signature du client
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Envoyés</p>
          <p className="mt-1 text-3xl font-bold">{countBy("ENVOYE")}</p>
          <p className="mt-1 text-xs text-zinc-500">Décision OMP à suivre</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Résolus</p>
          <p className="mt-1 text-3xl font-bold">{countBy("RESOLU")}</p>
          <p className="mt-1 text-xs text-zinc-500">Dossiers clôturés</p>
        </div>
      </section>

      {/* Filtres */}
      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/juriste${item.value === "ALL" ? "" : `?f=${item.value}`}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              statut === item.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {item.label}
            {item.value !== "ALL" && countBy(item.value) > 0
              ? ` (${countBy(item.value)})`
              : ""}
          </Link>
        ))}
      </div>

      {dossiers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">Aucun dossier dans cette catégorie.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {groupes.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {g.label}
                </h2>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                  {g.dossiers.length} dossier
                  {g.dossiers.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">PV</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Faille</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium">Créé le</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {g.dossiers.map(renderLigne)}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
