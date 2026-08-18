"use client";

import { useActionState } from "react";
import { demanderAvocat } from "../actions";

export type AvocatMatchDto = {
  statut: string;
  motif: string | null;
  partnerName: string | null;
  partnerBarreau: string | null;
  partnerEmail: string | null;
  note: string | null;
} | null;

export function AvocatRequest({
  dossierId,
  match,
}: {
  dossierId: string;
  match: AvocatMatchDto;
}) {
  const [state, formAction, pending] = useActionState(demanderAvocat, undefined);

  return (
    <div className="rounded-2xl border border-zinc-200 p-5">
      <h2 className="text-sm font-semibold text-zinc-700">
        Besoin d&apos;un avocat ?
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Pour certains recours (notamment les rétentions de permis), une
        représentation par avocat peut être recommandée. Notre équipe
        juridique peut vous orienter vers un avocat partenaire.
      </p>

      {!match && (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="dossierId" value={dossierId} />
          <textarea
            name="motif"
            rows={2}
            placeholder="Contexte de votre demande (facultatif)…"
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <div className="flex items-center gap-3">
            <button
              disabled={pending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Demander une mise en relation
            </button>
            {state?.error && (
              <p className="text-xs text-red-600">{state.error}</p>
            )}
          </div>
        </form>
      )}

      {match?.statut === "DEMANDE" && (
        <div className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Votre demande est en cours de traitement par un juriste.
          {match.motif && (
            <p className="mt-1 text-xs text-zinc-500">
              Contexte : « {match.motif} »
            </p>
          )}
        </div>
      )}

      {match?.statut === "AFFECTE" && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">{match.partnerName}</p>
          {match.partnerBarreau && (
            <p className="mt-0.5 text-xs text-emerald-700">
              Barreau : {match.partnerBarreau}
            </p>
          )}
          {match.partnerEmail && (
            <p className="mt-0.5 text-xs text-emerald-700">
              {match.partnerEmail}
            </p>
          )}
          {match.note && (
            <p className="mt-2 text-xs text-emerald-700">
              {match.note}
            </p>
          )}
        </div>
      )}

      {match?.statut === "REFUSE" && (
        <div className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <p>Votre demande de mise en relation n&apos;a pas été retenue.</p>
          {match.note && (
            <p className="mt-1 text-xs text-zinc-500">{match.note}</p>
          )}
        </div>
      )}
    </div>
  );
}