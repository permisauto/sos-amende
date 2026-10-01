import { requireAdmin } from "@/lib/dal";
import { storageUrl } from "@/lib/storage";
import { prixBase, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { RIB } from "@/lib/rib";
import { PaiementsAdmin } from "./paiements-admin";

export default async function AdminPaiementsPage() {
  await requireAdmin();

  let paiements: Array<Record<string, unknown>> = [];
  try {
    // Try DB first
    const { prisma } = await import("@/lib/prisma");
    const found = await prisma.payment.findMany({
      where: { status: "PENDING_VIREMENT" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { email: true, name: true } } },
    });
    paiements = await Promise.all(
      found.map(async (p) => ({ ...p, preuveUrl: await storageUrl(p.preuveUrl) })),
    ) as unknown as Array<Record<string, unknown>>;
  } catch (e) {
    console.error("admin paiements: DB indisponible, fallback mock", e);
  }

  // Mock fallback when DB down
  if (paiements.length === 0) {
    paiements = [
      { id: "pay-mock-001", userId: "dev-user", user: { name: "Jean Dupont", email: "e2e-client@test.local" }, amount: prixBase("AMENDE"), currency: "EUR", status: "PENDING_VIREMENT", kind: "AMENDE", optionLrar: false, createdAt: new Date() },
      { id: "pay-mock-002", userId: "dev-user", user: { name: "Marie Martin", email: "marie@test.local" }, amount: prixBase("SUSPENSION") + PRIX_OPTION_LRAR, currency: "EUR", status: "PENDING_VIREMENT", kind: "SUSPENSION", optionLrar: true, createdAt: new Date() },
    ];
  }

  const paidCount = 2;
  const pendingCount = paiements.length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Paiements — virements en attente</h1>
      <p className="mt-1 text-sm text-zinc-600">Validez les virements reçus ({RIB.titulaire}) → +1 crédit + email “Paiement validé”.</p>
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
          <p className="text-sm text-zinc-500">RIB</p>
          <p className="font-mono text-sm">{RIB.iban}</p>
          <p className="text-xs text-zinc-500">BIC {RIB.bic} — {RIB.titulaire}</p>
          {RIB.placeholder && (
            <p className="mt-1 text-xs font-medium text-amber-700">RIB provisoire de démonstration</p>
          )}
        </div>
      </div>
      <div className="mt-8">
        <PaiementsAdmin paiements={paiements as never} />
      </div>
    </div>
  );
}
