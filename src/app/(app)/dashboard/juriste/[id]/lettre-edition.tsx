"use client";

import { useActionState } from "react";
import { modifierLettre } from "../actions";

/**
 * Édition de la lettre par le juriste avant validation. La signature (si déjà
 * apposée par le client) est recollée automatiquement en bas de la lettre par
 * l'action `modifierLettre` — le juriste modifie le texte, jamais la signature.
 */
export function LettreEdition({
  dossierId,
  lettre,
  signee,
}: {
  dossierId: string;
  lettre: string;
  signee: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    modifierLettre,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="dossierId" value={dossierId} />
      <textarea
        name="lettre"
        required
        rows={16}
        aria-label="Texte de la lettre de contestation"
        defaultValue={lettre}
        className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
      <p className="text-xs text-zinc-500">
        {signee
          ? "La lettre est déjà signée par le client : votre signature restera collée en bas de la nouvelle version (PDF régénéré automatiquement)."
          : "La lettre n'est pas encore signée : le client signera après votre relecture."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer la lettre modifiée"}
        </button>
        {state?.ok && (
          <span className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            Lettre enregistrée.
          </span>
        )}
      </div>
      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}