"use client";

import { useActionState } from "react";
import { changerMotDePasse, type ChangerMotDePasseState } from "./actions";

const initialState: ChangerMotDePasseState = {};

export function ChangerMotDePasse() {
  const [state, formAction, pending] = useActionState(
    changerMotDePasse,
    initialState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div>
        <label
          htmlFor="mdp-actuel"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Mot de passe actuel
        </label>
        <input
          id="mdp-actuel"
          name="actuel"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <div>
        <label
          htmlFor="mdp-nouveau"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Nouveau mot de passe
        </label>
        <input
          id="mdp-nouveau"
          name="nouveau"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8 caractères minimum"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <div>
        <label
          htmlFor="mdp-confirmation"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Confirmez le nouveau mot de passe
        </label>
        <input
          id="mdp-confirmation"
          name="confirmation"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {state?.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Mot de passe mis à jour.
        </p>
      )}
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Mise à jour…" : "Mettre à jour mon mot de passe"}
      </button>
    </form>
  );
}