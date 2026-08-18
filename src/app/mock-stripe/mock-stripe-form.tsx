"use client";

import { useState } from "react";

export function MockStripeForm({
  type,
  initialEmail,
}: {
  type: "AMENDE" | "SUSPENSION";
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("pending");
    try {
      const res = await fetch("/api/stripe/mock/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, email }),
      });
      if (res.ok) {
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-4 text-emerald-800">
        <p className="font-semibold">Paiement validé (démo)</p>
        <p className="mt-1 text-sm">
          1 crédit a été ajouté à {email}. Connectez-vous pour lancer votre
          dossier.
        </p>
        <a
          href="/login"
          className="mt-3 inline-block rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Adresse e-mail (compte crédité)
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </label>
      <button
        type="submit"
        disabled={status === "pending"}
        className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "pending"
          ? "Paiement…"
          : `Payer ${type === "SUSPENSION" ? "59" : "39"} € (démo)`}
      </button>
      {status === "error" && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Une erreur est survenue (e-mail requis).
        </p>
      )}
    </form>
  );
}