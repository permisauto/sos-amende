"use client";

import { useActionState } from "react";
import { validerVirement, refuserVirement } from "../actions";

type Paiement = { id: string; userId: string; amount: unknown; kind: string; status: string; createdAt: Date; user: { email: string; name: string | null } };

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
              <p className="font-mono text-xs text-zinc-500">ID: {p.id.slice(0, 8)} — Réf à vérifier par email/WhatsApp</p>
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
        </div>
      ))}
    </div>
  );
}
