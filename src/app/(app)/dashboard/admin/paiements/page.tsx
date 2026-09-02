import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { PaiementsAdmin } from "./paiements-admin";

export default async function AdminPaiementsPage() {
  await requireAdmin();

  let paiements: Array<Record<string, unknown>> = [];
  try {
    paiements = (await prisma.payment.findMany({
      where: { status: "PENDING_VIREMENT" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { email: true, name: true } } },
    })) as unknown as Array<Record<string, unknown>>;
  } catch (e) {
    console.error("admin paiements: DB indisponible", e);
  }

  const paidCount = await prisma.payment.count({ where: { status: "PAID" } }).catch(() => 0);
  const pendingCount = paiements.length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Paiements — virements en attente</h1>
      <p className="mt-1 text-sm text-zinc-600">Validez les virements reçus (faux RIB FR76 3000... pour test) → +1 crédit + email “Paiement validé”.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-700">En attente</p>
          <p className="text-3xl font-bold text-amber-900">{pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-700">Validés</p>
          <p className="text-3xl font-bold text-emerald-900">{paidCount}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">RIB de test</p>
          <p className="font-mono text-sm">FR76 3000 4000 0500 0012 3456 789</p>
          <p className="text-xs text-zinc-500">BIC BNPAFRPPXXX — SOS AMENDE - TEST</p>
        </div>
      </div>
      <div className="mt-8">
        <PaiementsAdmin paiements={paiements as never} />
      </div>
    </div>
  );
}
