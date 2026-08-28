"use client";

import { useSearchParams } from "next/navigation";

export function PricingBanners() {
  const sp = useSearchParams();
  const checkout = sp.get("checkout");
  const error = sp.get("error");

  if (checkout === "cancelled") {
    return (
      <div role="alert" className="mx-auto mb-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Paiement annulé — aucun montant n&apos;a été prélevé. Vous pouvez réessayer quand vous le souhaitez.
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mx-auto mb-8 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Erreur de paiement : {decodeURIComponent(error)}. Veuillez réessayer ou contacter le support si le problème persiste.
      </div>
    );
  }
  return null;
}
