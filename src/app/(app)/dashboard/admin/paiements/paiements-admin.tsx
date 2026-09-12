"use client";

import { useActionState } from "react";
import { validerVirement, refuserVirement } from "../actions";

type Paiement = { id: string; userId: string; amount: unknown; kind: string; status: string; createdAt: Date; preuveUrl?: string | null; preuveNom?: string | null; preuveUploadedAt?: Date | null; user: { email: string; name: string | null } };

export function PaiementsAdmin({ paiements }: { paiements: Paiement[] }) {
  const [valState, valAction, valPending] = useActionState(validerVirement, undefined);
  const [refState, refAction, refPending] = useActionState(refuserVirement, undefined);

  if (paiements.length === 0) {
    return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-zinc-500">Aucun virement en attente. Les demandes virement apparaissent ici après “Valider et recevoir le RIB”.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {(valState?.error || refState?.error) && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{valState?.error ?? refState?.error}</p>}
      {(valState?.ok || refState?.ok) && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Action effectuée.</p>}
      {paiements.map((p) => (
        <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{p.user.name ?? p.user.email} — {p.user.email}</p>
              <p className="text-sm text-zinc-600">{p.kind} — {String(p.amount)} € — {new Date(p.createdAt).toLocaleString("fr-FR")}</p>
              <p className="font-mono text-xs text-zinc-500">ID: {p.id.slice(0, 8)}</p>
            </div>
            <div className="flex gap-2">
              <form action={valAction}>
                <input type="hidden" name="id" value={p.id} />
                <button disabled={valPending || refPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {valPending ? "..." : "Valider → +1 crédit"}
                </button>
              </form>
              <form action={refAction}>
                <input type="hidden" name="id" value={p.id} />
                <button disabled={valPending || refPending} className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                  Refuser
                </button>
              </form>
            </div>
          </div>
          {p.preuveUrl ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <span>✓ Preuve de virement reçue</span>
                {p.preuveUploadedAt && <span className="font-normal text-emerald-700">— {new Date(p.preuveUploadedAt).toLocaleString("fr-FR")}</span>}
              </p>
              <a href={p.preuveUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium text-emerald-700 underline">
                {p.preuveNom ?? "Voir la preuve"}
              </a>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Pas encore de preuve de virement téléversée.</p>
          )}
        </div>
      ))}
    </div>
  );
}
