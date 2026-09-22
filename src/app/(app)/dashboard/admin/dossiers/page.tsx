import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";

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

const statutBadge: Record<string, string> = {
  EN_ATTENTE_VALIDATION: "bg-amber-100 text-amber-800",
  EN_ATTENTE_PRE_SIGNATURE: "bg-indigo-100 text-indigo-800",
  EN_ATTENTE_PAIEMENT: "bg-zinc-100 text-zinc-600",
  PRET: "bg-amber-100 text-amber-800",
  A_VERIFIER: "bg-indigo-100 text-indigo-800",
  ENVOYE: "bg-emerald-100 text-emerald-800",
  REJETE: "bg-red-100 text-red-800",
  RESOLU: "bg-emerald-100 text-emerald-800",
  ERREUR_TECHNIQUE: "bg-red-100 text-red-700",
  ANNULE: "bg-zinc-100 text-zinc-500",
  EN_ANALYSE: "bg-zinc-100 text-zinc-600",
  BROUILLON: "bg-zinc-100 text-zinc-600",
};

// Pipeline de l'état d'avancement (étapes principales du flux).
const PIERRE = [
  "BROUILLON",
  "EN_ANALYSE",
  "EN_ATTENTE_PAIEMENT",
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_PRE_SIGNATURE",
  "PRET",
  "ENVOYE",
  "RESOLU",
] as const;

const TERMINAL = new Set(["REJETE", "ERREUR_TECHNIQUE", "ANNULE"]);

const LIBELLES_PIERRE = [
  "Brouillon",
  "Analyse",
  "Paiement",
  "À valider",
  "Signature",
  "Prêt",
  "Envoyé",
  "Résolu",
];

function etapeIndexes(statut: string): { courant: number; total: number } {
  const idx = PIERRE.indexOf(statut as (typeof PIERRE)[number]);
  if (idx >= 0) return { courant: idx, total: PIERRE.length - 1 };
  return { courant: 0, total: PIERRE.length - 1 };
}

function Avancement({ statut }: { statut: string }) {
  if (TERMINAL.has(statut)) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100" />
        <span className="text-[11px] font-medium text-zinc-500">
          Clôturé
        </span>
      </div>
    );
  }
  const { courant, total } = etapeIndexes(statut);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= courant
                ? i < total
                  ? "bg-emerald-500"
                  : "bg-emerald-600"
                : "bg-zinc-200"
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] font-medium text-zinc-500">
        Étape {courant + 1} / {total} — {LIBELLES_PIERRE[courant]}
      </span>
    </div>
  );
}

const FILTRES = [
  { value: "EN_COURS", label: "En cours" },
  { value: "EN_ATTENTE_VALIDATION", label: "À valider" },
  { value: "ENVOYE", label: "Envoyés" },
  { value: "RESOLU", label: "Résolus" },
  { value: "ALL", label: "Tous" },
];

export default async function AdminSuiviDossiersPage(props: {
  searchParams: Promise<{ f?: string }>;
}) {
  const admin = await requireAdmin();
  const searchParams = await props.searchParams;
  const raw = typeof searchParams.f === "string" ? searchParams.f : "EN_COURS";
  const filtre = FILTRES.some((x) => x.value === raw) ? raw : "EN_COURS";

  let dossiers: Array<{
    id: string;
    type: "AMENDE" | "SUSPENSION";
    statut: string;
    prix: unknown;
    createdAt: Date;
    dateLimite: Date | null;
    valideLe: Date | null;
    user: { name: string | null; email: string | null };
    failleJuridique: { titreFaille: string } | null;
  }> = [];
  let stats: Array<{ statut: string; _count: number }> = [];
  let nonLusEquipe = new Map<string, number>();

  const EN_COURS = [
    "BROUILLON",
    "EN_ANALYSE",
    "EN_ATTENTE_PAIEMENT",
    "EN_ATTENTE_VALIDATION",
    "EN_ATTENTE_PRE_SIGNATURE",
    "A_VERIFIER",
    "PRET",
    "ENVOYE",
  ] as const;
  type Statut = (typeof EN_COURS)[number];

  try {
    const where =
      filtre === "ALL"
        ? undefined
        : filtre === "EN_COURS"
          ? { statut: { in: EN_COURS as unknown as Statut[] } }
          : { statut: filtre as Statut };
    const res = await Promise.all([
      prisma.dossier.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          user: { select: { name: true, email: true } },
          failleJuridique: { select: { titreFaille: true } },
        },
      }),
      prisma.dossier.groupBy({ by: ["statut"], _count: true }),
      prisma.messageInterne.groupBy({
        by: ["dossierId"],
        where: { lu: false, expediteurId: { not: admin.id } },
        _count: { _all: true },
      }),
    ]);
    dossiers = res[0] as unknown as typeof dossiers;
    stats = res[1] as unknown as Array<{ statut: string; _count: number }>;
    nonLusEquipe = new Map(
      res[2].map((g) => [g.dossierId, g._count._all]),
    );
  } catch (e) {
    console.error("admin/dossiers: DB indisponible", e);
  }

  const countBy = (s: string) =>
    stats.find((x) => x.statut === s)?._count ?? 0;
  const enCours = EN_COURS.reduce((acc, s) => acc + countBy(s), 0);
  const aValider = countBy("EN_ATTENTE_VALIDATION") + countBy("PRET");
  const envoyes = countBy("ENVOYE");
  const resolus = countBy("RESOLU");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suivi des dossiers</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Vue d&apos;ensemble des dossiers et de leur état d&apos;avancement.
            Consultation seule : le traitement est assuré par les juristes.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {admin.name ?? admin.email}
        </span>
      </div>

      {/* Indicateurs d'avancement global */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Dossiers en cours</p>
          <p className="mt-1 text-3xl font-bold">{enCours}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">À valider</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">{aValider}</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-medium text-sky-700">Envoyés</p>
          <p className="mt-1 text-3xl font-bold text-sky-900">{envoyes}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-700">Résolus</p>
          <p className="mt-1 text-3xl font-bold text-emerald-900">{resolus}</p>
        </div>
      </section>

      {/* Filtres */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTRES.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/admin/dossiers${item.value === "EN_COURS" ? "" : `?f=${item.value}`}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filtre === item.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {item.label}
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
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Faille retenue</th>
                <th className="px-4 py-3 font-medium">État d&apos;avancement</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dossiers.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/juriste/${item.id}`}
                      className="font-medium hover:text-emerald-700"
                    >
                      {item.user.name ?? item.user.email}
                    </Link>
                    <p className="text-xs text-zinc-500">{item.user.email}</p>
                    {(nonLusEquipe.get(item.id) ?? 0) > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                        Équipe : {(nonLusEquipe.get(item.id) ?? 0)} nouveau
                        {nonLusEquipe.get(item.id)! > 1 ? "x" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.type === "AMENDE" ? "Amende" : "Suspension"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.failleJuridique?.titreFaille ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Avancement statut={item.statut} />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}