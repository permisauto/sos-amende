"use client";

import { useActionState, useState } from "react";
import { appliquerMiseAJourCatalogue } from "../actions";
import type { EcartCatalogue } from "@/lib/auto-alimentation";

function Afficher({ texte }: { texte: string }) {
  const court = texte.length > 400 ? `${texte.slice(0, 400)}…` : texte;
  return (
    <span className="block break-words whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700">
      {court || "—"}
    </span>
  );
}

/**
 * Bandeau « mise à jour disponible » (option B) : le catalogue sourcé a évolué
 * depuis la dernière synchro et la faille est déjà en base (ACTIVE/PROPOSEE).
 * Rien n'est appliqué sans action explicite de l'admin, qui voit le diff.
 */
export function MisesAJourCatalogue({ ecarts }: { ecarts: EcartCatalogue[] }) {
  if (ecarts.length === 0) return null;

  return (
    <section
      className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5"
      data-testid="mises-a-jour-catalogue"
    >
      <p className="text-sm font-semibold text-sky-900">
        {ecarts.length} mise{ecarts.length > 1 ? "s" : ""} à jour disponible
        {ecarts.length > 1 ? "s" : ""} dans le catalogue sourcé
      </p>
      <p className="mt-1 text-sm text-sky-800">
        Le contenu source a évolué depuis la dernière synchronisation. La mise à
        jour n&apos;est jamais appliquée automatiquement (une validation admin ne
        se rétrograde pas) : examinez le diff, puis appliquez-la ou ignorez-la.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {ecarts.map((ecart) => (
          <LigneEcart key={ecart.id} ecart={ecart} />
        ))}
      </ul>
    </section>
  );
}

function LigneEcart({ ecart }: { ecart: EcartCatalogue }) {
  const [state, action, pending] = useActionState(
    appliquerMiseAJourCatalogue,
    undefined,
  );
  const [ignoree, setIgnoree] = useState(false);

  if (state?.ok) {
    return (
      <li className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900">
        {ecart.titreFaille} — mise à jour appliquée (statut{" "}
        {ecart.statut.toLowerCase()} conservé).
      </li>
    );
  }

  if (ignoree) {
    return (
      <li className="rounded-xl border border-zinc-200 bg-white/60 px-4 py-3 text-sm text-zinc-500">
        {ecart.titreFaille} — mise à jour ignorée (prochaine synchronisation la
        signalera à nouveau).
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-sky-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {ecart.titreFaille}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {ecart.typeInfraction} · statut {ecart.statut} ·{" "}
            {ecart.champs.length} champ{ecart.champs.length > 1 ? "s" : ""}{" "}
            modifié{ecart.champs.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="id" value={ecart.id} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Application…" : "Appliquer la mise à jour"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setIgnoree(true)}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
          >
            Ignorer
          </button>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-sky-800">
          Voir le diff (avant / après)
        </summary>
        <ul className="mt-3 flex flex-col gap-3">
          {ecart.champs.map((c) => (
            <li key={c.champ}>
              <p className="text-xs font-semibold text-zinc-700">{c.champ}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-red-100 bg-red-50 p-2">
                  <p className="mb-1 text-[10px] font-bold uppercase text-red-500">
                    En base
                  </p>
                  <Afficher texte={c.actuel} />
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                  <p className="mb-1 text-[10px] font-bold uppercase text-emerald-600">
                    Catalogue sourcé
                  </p>
                  <Afficher texte={c.propose} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {state?.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </li>
  );
}
