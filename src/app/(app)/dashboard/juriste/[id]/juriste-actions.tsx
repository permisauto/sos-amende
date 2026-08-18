"use client";

import { useActionState } from "react";
import {
  enregistrerDecisionOmp,
  rejeterDossier,
  retournerDossier,
  validerDossier,
} from "../actions";

export function JuristeActions({
  dossierId,
  mode = "full",
}: {
  dossierId: string;
  mode?: "full" | "rejet";
}) {
  const [valideState, valideAction, validePending] = useActionState(
    validerDossier,
    undefined,
  );
  const [retourState, retourAction, retourPending] = useActionState(
    retournerDossier,
    undefined,
  );
  const [rejetState, rejetAction, rejetPending] = useActionState(
    rejeterDossier,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      {mode === "full" && (
        <>
          <form action={valideAction} className="flex flex-col gap-2">
            <input type="hidden" name="dossierId" value={dossierId} />
            <button
              type="submit"
              disabled={validePending}
              className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {validePending
                ? "Validation…"
                : "Approuver la lettre pour l'envoi"}
            </button>
            {valideState?.error && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {valideState.error}
              </p>
            )}
          </form>

          <form action={retourAction} className="flex flex-col gap-2">
            <input type="hidden" name="dossierId" value={dossierId} />
            <button
              type="submit"
              disabled={retourPending}
              className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retourPending ? "Retour…" : "Retourner pour correction"}
            </button>
            {retourState?.error && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {retourState.error}
              </p>
            )}
          </form>
        </>
      )}

      <form action={rejetAction} className="flex flex-col gap-2">
        <input type="hidden" name="dossierId" value={dossierId} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            Motif du rejet (affiché au client)
          </span>
          <textarea
            name="motif"
            required
            rows={2}
            placeholder="Ex. : aucune faille juridique applicable à ce dossier."
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
          />
        </label>
        <button
          type="submit"
          disabled={rejetPending}
          className="rounded-full border border-red-200 px-6 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rejetPending ? "Rejet…" : "Rejeter le dossier"}
        </button>
        {rejetState?.error && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {rejetState.error}
          </p>
        )}
      </form>
    </div>
  );
}

export function DecisionOmpForm({ dossierId }: { dossierId: string }) {
  const [state, formAction, pending] = useActionState(
    enregistrerDecisionOmp,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="dossierId" value={dossierId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Décision de l&apos;OMP
        </span>
        <select
          name="decisionOmp"
          required
          defaultValue=""
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <option value="" disabled>
            Sélectionner la décision…
          </option>
          <option value="ACCEPTE">Requête acceptée (amende annulée)</option>
          <option value="REJETE">Requête rejetée</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Note (optionnelle, affichée au client)
        </span>
        <textarea
          name="decisionDetail"
          rows={2}
          placeholder="Ex. : annulation confirmée par l'OMP le …"
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enregistrement…" : "Enregistrer la décision"}
      </button>
      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}