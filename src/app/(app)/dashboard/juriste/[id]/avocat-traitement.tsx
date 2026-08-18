"use client";

import { useActionState } from "react";
import { traiterDemandeAvocat } from "../actions";

export type AvocatMatchDto = {
  statut: string;
  motif: string | null;
  partnerName: string | null;
  partnerBarreau: string | null;
  partnerEmail: string | null;
  note: string | null;
} | null;

export function AvocatTraitement({
  matchId,
  match,
}: {
  matchId: string;
  match: AvocatMatchDto;
}) {
  const [state, formAction, pending] = useActionState(
    traiterDemandeAvocat,
    undefined,
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Mise en relation avocat</h2>

      {match?.motif && (
        <p className="mt-2 text-sm text-zinc-600">
          Demande du client : « {match.motif} »
        </p>
      )}

      {match?.statut === "DEMANDE" && (
        <>
          <p className="mt-2 text-sm text-zinc-600">
            Le client demande une orientation vers un avocat partenaire.
            Affectez un partenaire (recommandé pour les rétentions de permis)
            ou refusez avec une note.
          </p>
          <form action={formAction} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="matchId" value={matchId} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Avocat partenaire
              </span>
              <input
                name="partnerName"
                required
                placeholder="Nom de l'avocat"
                className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700">
                  Barreau
                </span>
                <input
                  name="partnerBarreau"
                  placeholder="Ex. Paris"
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700">
                  Email
                </span>
                <input
                  name="partnerEmail"
                  type="email"
                  placeholder="cabinet@exemple.fr"
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Note au client
              </span>
              <textarea
                name="note"
                rows={2}
                className="rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                name="action"
                value="AFFECTE"
                disabled={pending}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Affecter l&apos;avocat
              </button>
              <button
                name="action"
                value="REFUSE"
                disabled={pending}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                Refuser la demande
              </button>
              {state?.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}
            </div>
          </form>
        </>
      )}

      {match?.statut === "AFFECTE" && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">{match.partnerName}</p>
          {match.partnerBarreau && (
            <p className="mt-0.5 text-xs">Barreau : {match.partnerBarreau}</p>
          )}
          {match.partnerEmail && (
            <p className="mt-0.5 text-xs">{match.partnerEmail}</p>
          )}
          {match.note && (
            <p className="mt-2 text-xs">{match.note}</p>
          )}
        </div>
      )}

      {match?.statut === "REFUSE" && (
        <div className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <p>Demande refusée.</p>
          {match.note && <p className="mt-1 text-xs">{match.note}</p>}
        </div>
      )}

      {!match && (
        <p className="mt-2 text-sm text-zinc-500">
          Aucune demande de mise en relation pour ce dossier.
        </p>
      )}
    </div>
  );
}