"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function DashboardCheckoutBanner() {
  const sp = useSearchParams();
  if (sp.get("checkout") !== "success") return null;
  return (
    <div role="status" className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4">
      <p className="font-semibold text-emerald-900">✓ Paiement confirmé — 1 crédit ajouté à votre compte</p>
      <p className="mt-1 text-sm text-emerald-700">
        Vous pouvez maintenant téléverser votre PV. Votre dossier sera analysé et la lettre préparée par un juriste.
      </p>
      <Link href="/dashboard/cases/new" className="mt-3 inline-block rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
        Téléverser mon PV
      </Link>
    </div>
  );
}
