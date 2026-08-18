"use client";

import { useState } from "react";

export function MockAntaiForm() {
  const [result, setResult] = useState<{
    numeroDepot?: string;
    preuveUrl?: string;
    error?: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd);
    body.token = "dev-antai-mock";
    try {
      const res = await fetch("/api/antai/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ error: json.error ?? "Erreur inconnue" });
      } else {
        setResult(json);
      }
    } catch {
      setResult({ error: "Impossible de joindre le mock." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Numéro PV</span>
          <input
            name="numPv"
            required
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Plaque</span>
          <input
            name="plaque"
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Type</span>
          <select
            name="type"
            defaultValue="AMENDE"
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="AMENDE">AMENDE</option>
            <option value="SUSPENSION">SUSPENSION</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Requérant</span>
          <input
            name="nom"
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Lettre</span>
        <textarea
          name="lettre"
          rows={5}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Dépôt en cours…" : "Simuler le dépôt ANTAI"}
      </button>

      {result?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </p>
      )}
      {result?.numeroDepot && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Dépôt accepté : {result.numeroDepot}</p>
          <a href={result.preuveUrl} target="_blank" rel="noreferrer">
            Télécharger l'accusé de dépôt
          </a>
        </div>
      )}
    </form>
  );
}