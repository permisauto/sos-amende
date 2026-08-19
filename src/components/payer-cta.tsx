"use client";

import { useState } from "react";

/**
 * Bouton de paiement (inscription inversée) : appelle `/api/stripe/checkout`
 * puis redirige vers la session Stripe (ou le portail mock en dev). Utilisé
 * quand le client n'a plus de crédit et doit payer pour lancer un dossier.
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lancerPaiement() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Paiement indisponible.");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paiement indisponible.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={lancerPaiement}
        disabled={pending}
        className={
          className ??
          "rounded-full bg-emerald-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        }
      >
        {pending ? "Redirection vers le paiement…" : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}