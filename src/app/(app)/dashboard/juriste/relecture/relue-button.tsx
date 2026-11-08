"use client";

import { useActionState } from "react";
import { marquerFailleRelue, type RelectureState } from "./actions";

export function RelueButton({ failleId }: { failleId: string }) {
  const [state, action, pending] = useActionState<RelectureState, FormData>(
    marquerFailleRelue,
    undefined,
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={failleId} />
      <button
        type="submit"
        disabled={pending}
        data-testid="marquer-relue"
        className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Enregistrement…" : "Marquer comme relue"}
      </button>
      {state?.error && (
        <p className="mt-1 text-xs text-red-700">{state.error}</p>
      )}
    </form>
  );
}
