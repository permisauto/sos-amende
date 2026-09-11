"use client";

import { useActionState, useState } from "react";
import { supprimerCompte } from "./actions";

export function SuppressionCompte() {
  const [state, formAction, pending] = useActionState(supprimerCompte, undefined);
  const [confirm, setConfirm] = useState(false);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="confirm"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
        />
        Je comprends que cette action est définitive : mes dossiers, fichiers
        et données personnelles seront supprimés.
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={pending || !confirm}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          Supprimer définitivement mon compte
        </button>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}