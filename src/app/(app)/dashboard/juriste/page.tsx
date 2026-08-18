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

  const dossiers = await prisma.dossier.findMany({
    where: statut === "ALL" ? undefined : { statut },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      failleJuridique: { select: { titreFaille: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Espace juriste</h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
          {dossiers.length} dossier{dossiers.length > 1 ? "s" : ""}
        </span>
      </div>

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
          </Link>
        ))}
      </div>

      {dossiers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
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
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
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