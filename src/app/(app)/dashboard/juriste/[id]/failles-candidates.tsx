"use client";

import { useActionState } from "react";
import { confirmerFaille, rejeterFaille } from "../actions";

export type CandidatDto = {
  failleId: string;
  statut: string;
  titre: string;
  articleLoi: string;
  principale: boolean;
};

const statutLabels: Record<string, string> = {
  CANDIDATE: "Candidat",
  CONFIRMEE: "Confirmée",
  REJETEE: "Écartée",
};

const statutCls: Record<string, string> = {
  CANDIDATE: "bg-zinc-100 text-zinc-600",
  CONFIRMEE: "bg-emerald-100 text-emerald-800",
  REJETEE: "bg-red-100 text-red-700",
};

export function FaillesCandidates({
  dossierId,
  candidats,
}: {
  dossierId: string;
  candidats: CandidatDto[];
}) {
  if (candidats.length === 0) {
    return (
      <p className="mt-3 text-sm text-zinc-500">
        Aucune faille détectée par le scan. Si un motif s&apos;applique,
        ajoutez-le à la base juridique (admin) puis retournez le dossier pour
        relancer la détection.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {candidats.map((c) => (
        <CandidatRow key={c.failleId} dossierId={dossierId} candidat={c} />
      ))}
    </div>
  );
}

function CandidatRow({
  dossierId,
  candidat,
}: {
  dossierId: string;
  candidat: CandidatDto;
}) {
  const [confState, confAction, confPending] = useActionState(
    confirmerFaille,
    undefined,
  );
  const [rejState, rejAction, rejPending] = useActionState(
    rejeterFaille,
    undefined,
  );

  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">{candidat.titre}</p>
          <p className="text-xs text-zinc-500">{candidat.articleLoi}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {candidat.principale && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              Faille retenue
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statutCls[candidat.statut] ?? statutCls.CANDIDATE}`}
          >
            {statutLabels[candidat.statut] ?? candidat.statut}
          </span>
          {candidat.statut !== "CONFIRMEE" && (
            <form action={confAction}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <input type="hidden" name="failleId" value={candidat.failleId} />
              <button
                type="submit"
                disabled={confPending}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {confPending ? "…" : "Confirmer"}
              </button>
            </form>
          )}
          {candidat.statut !== "REJETEE" && (
            <form action={rejAction}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <input type="hidden" name="failleId" value={candidat.failleId} />
              <button
                type="submit"
                disabled={rejPending}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {rejPending ? "…" : "Écarter"}
              </button>
            </form>
          )}
        </div>
      </div>
      {(confState?.error || rejState?.error) && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {confState?.error ?? rejState?.error}
        </p>
      )}
    </div>
  );
}