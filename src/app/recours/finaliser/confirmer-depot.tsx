"use client";

import { useActionState } from "react";
import { confirmerDepotSurPortail, type DepotState } from "./actions";

/**
 * Bouton « J'ai déposé ma contestation » — le client confirme avoir déposé
 * sur le portail officiel via le guide assisté ; le dossier passe ENVOYE.
 */
export function ConfirmerDepotForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<DepotState, FormData>(
    confirmerDepotSurPortail,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Merci ! Votre dossier est marqué comme déposé auprès du service
        compétent. Vous recevrez un e-mail avec le suivi de la décision.
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "Confirmation…" : "J’ai déposé ma contestation"}
      </button>
    </form>
  );
}