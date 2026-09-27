"use client";

import { useActionState } from "react";
import { definirMotDePasse, type MotDePasseState } from "./actions";

const initialState: MotDePasseState = {};

export function MotDePasseForm({ mode }: { mode: "creer" | "redefinir" }) {
  const [state, formAction, pending] = useActionState(
    definirMotDePasse,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8 caractères minimum"
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <div>
        <label
          htmlFor="password-confirmation"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Confirmez le mot de passe
        </label>
        <input
          id="password-confirmation"
          name="passwordConfirmation"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8 caractères minimum"
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Enregistrement…"
          : mode === "redefinir"
            ? "Enregistrer le nouveau mot de passe"
            : "Créer mon mot de passe"}
      </button>
    </form>
  );
}