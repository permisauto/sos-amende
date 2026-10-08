import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storageUrl } from "@/lib/storage";
import { RIB } from "@/lib/rib";
import { PaiementsAdmin } from "./paiements-admin";

export const dynamic = "force-dynamic";

const FILTRES = [
  { value: "EN_ATTENTE", label: "En attente" },
  { value: "VALIDES", label: "Validés" },
  { value: "REFUSES", label: "Refusés" },
  { value: "TOUT", label: "Tout" },
] as const;
type Filtre = (typeof FILTRES)[number]["value"];

const STATUT_PAR_FILTRE: Record<Filtre, string | undefined> = {
  EN_ATTENTE: "PENDING_VIREMENT",
  VALIDES: "PAID",
  REFUSES: "REFUSED",
  TOUT: undefined,
};

type LignePaiement = {
  id: string;
  amount: unknown;
  status: string;
  kind: string;
  optionLrar: boolean;
  createdAt: Date;
  valideLe: Date | null;
  refuseLe: Date | null;
  refusMotif: string | null;
  preuveUrl?: string | null;
  preuveNom?: string | null;
  preuveUploadedAt?: Date | null;
  user: { email: string; name: string | null; telephone: string | null };
};

export default async function AdminPaiementsPage(props: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const raw = typeof searchParams.f === "string" ? searchParams.f : "";
  const choisi = FILTRES.find((x) => x.value === raw);
  const filtre: Filtre = choisi ? choisi.value : "EN_ATTENTE";
  const q = (typeof searchParams.q === "string" ? searchParams.q : "")
    .trim()
    .slice(0, 80);

  const statut = STATUT_PAR_FILTRE[filtre];
  const where = {
    ...(statut ? { status: statut } : {}),
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { telephone: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  let paiements: LignePaiement[] = [];
  const counts = { PENDING_VIREMENT: 0, PAID: 0, REFUSED: 0 };
  try {
    const [found, groupes] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          user: { select: { email: true, name: true, telephone: true } },
        },
      }),
      prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    paiements = (await Promise.all(
      found.map(async (p) => ({
        ...(p as unknown as LignePaiement),
        preuveUrl: await storageUrl(p.preuveUrl),
      })),
    )) as LignePaiement[];
    for (const g of groupes) {
      if (g.status === "PENDING_VIREMENT") counts.PENDING_VIREMENT = g._count._all;
      else if (g.status === "PAID") counts.PAID = g._count._all;
      else if (g.status === "REFUSED") counts.REFUSED = g._count._all;
    }
  } catch (e) {
    console.error("admin/paiements: DB indisponible", e);
  }

  const hrefFiltre = (v: Filtre) =>
    `/dashboard/admin/paiements${v === "EN_ATTENTE" ? "" : `?f=${v}`}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Paiements</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Identité du client, preuve de virement, puis validation (+1 crédit,
            e-mail automatique) ou refus motivé (e-mail automatique au client).
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {RIB.titulaire}
        </span>
      </div>

      {/* KPIs réels (groupBy sur tous les statuts) + RIB */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">En attente</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {counts.PENDING_VIREMENT}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-700">Validés</p>
          <p className="mt-1 text-3xl font-bold text-emerald-900">
            {counts.PAID}
          </p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-medium text-red-700">Refusés</p>
          <p className="mt-1 text-3xl font-bold text-red-900">
            {counts.REFUSED}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">RIB</p>
          <p className="mt-1 font-mono text-sm">{RIB.iban}</p>
          <p className="text-xs text-zinc-500">
            BIC {RIB.bic} — {RIB.titulaire}
          </p>
          {RIB.placeholder && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              RIB provisoire de démonstration
            </p>
          )}
        </div>
      </section>

      {/* Filtres + recherche */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTRES.map((item) => (
            <Link
              key={item.value}
              href={
                q
                  ? `/dashboard/admin/paiements?f=${item.value}&q=${encodeURIComponent(q)}`
                  : hrefFiltre(item.value)
              }
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
        <form method="get" action="" className="flex gap-2">
          <input type="hidden" name="f" value={filtre} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher email / nom / téléphone…"
            className="w-64 rounded-full border border-zinc-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            Rechercher
          </button>
        </form>
      </div>

      <div className="mt-4">
        <PaiementsAdmin paiements={paiements} filtre={filtre} q={q} />
      </div>
    </div>
  );
}
