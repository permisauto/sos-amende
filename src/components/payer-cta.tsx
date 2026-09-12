"use client";

import { useRouter } from "next/navigation";

/**
 * Bouton de paiement (inscription inversée) : redirige vers la page publique
 * de paiement par virement bancaire (`/paiement`), seul mode de paiement V1.
 * Affiché quand le client n'a plus de crédit et doit payer pour continuer.
 */
export function PayerCta({
  type = "AMENDE",
  label,
  className,
}: {
  type?: "AMENDE" | "SUSPENSION";
  label: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/paiement?type=${type}`)}
      className={
        className ??
        "rounded-full bg-emerald-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-emerald-700"
      }
    >
      {label}
    </button>
  );
}