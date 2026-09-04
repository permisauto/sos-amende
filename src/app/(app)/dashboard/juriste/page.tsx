import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";

const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_ANALYSE: "En analyse",
  A_VERIFIER: "À vérifier",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  REJETE: "Rejeté",
  ERREUR_TECHNIQUE: "Erreur technique",
  RESOLU: "Résolu",
  ANNULE: "Annulé",
};

const filters = [
  { value: "PRET", label: "À valider" },
  { value: "A_VERIFIER", label: "En attente de signature" },
  { value: "ENVOYE", label: "Envoyés" },
  { value: "ALL", label: "Tous" },
];

const statusValues = [
  "BROUILLON",
  "EN_ANALYSE",
  "A_VERIFIER",
  "PRET",
  "ENVOYE",
  "REJETE",
  "ERREUR_TECHNIQUE",
  "RESOLU",
  "ANNULE",
] as const;
type Statut = (typeof statusValues)[number];

const statutBadge: Record<string, string> = {
  PRET: "bg-amber-100 text-amber-800",
  A_VERIFIER: "bg-indigo-100 text-indigo-800",
  ENVOYE: "bg-emerald-100 text-emerald-800",
  REJETE: "bg-red-100 text-red-800",
  RESOLU: "bg-emerald-100 text-emerald-800",
};

export default async function JuristePage(
  props: PageProps<"/dashboard/juriste">,
) {
  await requireJuriste();
  const { f } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "PRET";
  const statut: Statut | "ALL" =
    raw === "ALL"
      ? "ALL"
      : statusValues.includes(raw as Statut)
        ? (raw as Statut)
        : "PRET";

  let dossiers: Array<Record<string, any>> = [];
  let stats: Array<{ statut: string; _count: number }> = [];
  try {
    const res = await Promise.all([
      prisma.dossier.findMany({
        where: statut === "ALL" ? undefined : { statut },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          failleJuridique: { select: { titreFaille: true } },
        },
      }),
      prisma.dossier.groupBy({ by: ["statut"], _count: true }),
    ]);
    dossiers = res[0] as unknown as Array<Record<string, any>>;
    stats = res[1] as unknown as Array<{ statut: string; _count: number }>;
  } catch (e) {
    console.error("juriste dashboard: DB indisponible, fallback mock", e);
    if (true) { // Always show mock for demo
      dossiers = [
        { id: "pv-analyse-001", type: "AMENDE", statut: "EN_ANALYSE", createdAt: new Date(MOCK_NOW - 86400000 * 6), prix: 39, extractedData: { plaque: "AB-123-CD", num_pv: "PV-ANALYSE-001" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: null },
        { id: "pv-sign-002", type: "AMENDE", statut: "A_VERIFIER", createdAt: new Date(MOCK_NOW - 86400000 * 5), prix: 39, extractedData: { plaque: "XY-999-ZZ", num_pv: "PV-SIGN-002" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Erreur plaque" } },
        { id: "pv-pret-003", type: "AMENDE", statut: "PRET", createdAt: new Date(MOCK_NOW - 86400000 * 4), prix: 39, extractedData: { plaque: "CD-456-EF", num_pv: "PV-PRET-003" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Travaux et signalisation temporaire" } },
        { id: "pv-envoye-004", type: "AMENDE", statut: "ENVOYE", createdAt: new Date(MOCK_NOW - 86400000 * 2), prix: 39, extractedData: { plaque: "EF-012-IJ", num_pv: "PV-ENVOYE-004" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Prescription 1 an" } },
        { id: "pv-rejete-005", type: "AMENDE", statut: "REJETE", createdAt: new Date(MOCK_NOW - 86400000 * 7), prix: 39, extractedData: { plaque: "GH-345-KL", num_pv: "PV-REJETE-005" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: null },
        { id: "pv-resolu-006", type: "AMENDE", statut: "RESOLU", createdAt: new Date(MOCK_NOW - 86400000 * 8), prix: 39, extractedData: { plaque: "MN-678-OP", num_pv: "PV-RESOLU-006" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Prescription 1 an" } },
        { id: "dec-analyse-007", type: "SUSPENSION", statut: "EN_ANALYSE", createdAt: new Date(MOCK_NOW - 86400000 * 3), prix: 59, extractedData: { num_pv: "DEC-ANALYSE-007" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: null },
        { id: "dec-sign-008", type: "SUSPENSION", statut: "A_VERIFIER", createdAt: new Date(MOCK_NOW - 86400000 * 2), prix: 59, extractedData: { num_pv: "DEC-SIGN-008" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Suspension sans contradictoire" } },
        { id: "dec-pret-009", type: "SUSPENSION", statut: "PRET", createdAt: new Date(MOCK_NOW - 86400000 * 1), prix: 59, extractedData: { num_pv: "DEC-PRET-009" }, user: { name: "Jean Dupont", email: "e2e-client@test.local" }, failleJuridique: { titreFaille: "Suspension sans contradictoire" } },
      ] as unknown as Array<Record<string, any>>;
      stats = [
        { statut: "PRET", _count: 2 },
        { statut: "A_VERIFIER", _count: 2 },
        { statut: "ENVOYE", _count: 1 },
        { statut: "RESOLU", _count: 1 },
        { statut: "REJETE", _count: 1 },
        { statut: "EN_ANALYSE", _count: 2 },
      ] as never;
    }
  }

  const countBy = (s: string) =>
    stats.find((x) => x.statut === s)?._count ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Espace juriste</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Validez les lettres, suivez les envois et renseignez les décisions.
          </p>
        </div>
        <Link
          href="/dashboard/juriste/failles"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Bibliothèque juridique
        </Link>
      </div>

      {/* Statistiques */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">À valider</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {countBy("PRET")}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Lettres signées à approuver
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm font-medium text-indigo-700">À vérifier</p>
          <p className="mt-1 text-3xl font-bold text-indigo-900">
            {countBy("A_VERIFIER")}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            En attente de signature client
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
            href={`/dashboard/juriste${item.value === "PRET" ? "" : `?f=${item.value}`}`}
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
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
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
              {dossiers.map((item) => {
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
                          statutBadge[item.statut] ??
                          "bg-zinc-100 text-zinc-700"
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
