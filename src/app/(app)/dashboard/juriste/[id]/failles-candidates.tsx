"use client";

import { useActionState, useState } from "react";
import { confirmerFaille, ecarterCandidats, rejeterFaille } from "../actions";

export type CandidatDto = {
  failleId: string;
  statut: string;
  /** Statut de la faille au catalogue (ACTIVE / PROPOSEE / INACTIVE). */
  statutFaille?: string;
  titre: string;
  articleLoi: string;
  principale: boolean;
  /** Rang d'ordonnancement (0 = principale proposée ; -1 = hors classement). */
  rangOrdre?: number;
  /** Score de corroboration documentaire (jamais une probabilité de succès). */
  score?: number;
  /** Dernière suggestion/observation IA rattachée à cette candidature. */
  suggestionIa?: {
    source?: string;
    pertinence?: string;
    justification?: string;
    controle?: string;
    signalement?: string;
    nouvelleProposition?: boolean;
    at?: string;
  } | null;
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
  lectureSeule = false,
  contradictions = [],
}: {
  dossierId: string;
  candidats: CandidatDto[];
  lectureSeule?: boolean;
  /** Contradictions factuelles du questionnaire (information seule, Lot 2.2). */
  contradictions?: { cle: string; message: string }[];
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [bulkState, bulkAction, bulkPending] = useActionState(
    ecarterCandidats,
    undefined,
  );
  // Une faille CONFIRMEE n'est pas « écartable » en masse (il faut la
  // déclasser une par une) ; une faille PROPOSEE au catalogue n'est jamais
  // retenue, mais reste écartable.
  const selectionnable = candidats.filter(
    (c) => c.statut === "CANDIDATE" && c.statutFaille === "ACTIVE",
  );
  const toggle = (failleId: string) =>
    setSelection((s) =>
      s.includes(failleId) ? s.filter((x) => x !== failleId) : [...s, failleId],
    );

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
      {contradictions.length > 0 && (
        <div
          data-testid="contradictions-faits"
          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <p className="font-semibold">
            Réponses contradictoires ({contradictions.length})
          </p>
          <ul className="mt-1 list-disc pl-4">
            {contradictions.map((c) => (
              <li key={c.cle}>{c.message}</li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700">
            À vérifier avant de retenir les failles concernées — information
            seule, aucune faille n&apos;est écartée automatiquement.
          </p>
        </div>
      )}

      {!lectureSeule && selectionnable.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
            <input
              type="checkbox"
              data-testid="selectionner-tout"
              checked={
                selection.length > 0 &&
                selection.length === selectionnable.length
              }
              onChange={(e) =>
                setSelection(
                  e.target.checked
                    ? selectionnable.map((c) => c.failleId)
                    : [],
                )
              }
              className="h-4 w-4 rounded border-zinc-300"
            />
            Tout sélectionner
          </label>
          <span className="text-xs text-zinc-500">
            {selection.length} sélectionnée(s)
          </span>
          {selection.length > 0 && (
            <form action={bulkAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="dossierId" value={dossierId} />
              {selection.map((id) => (
                <input key={id} type="hidden" name="failleIds" value={id} />
              ))}
              <input
                type="text"
                name="motifEcartement"
                data-testid="motif-ecartement"
                placeholder="Motif de l'écartement (5 car. min.)"
                className="min-w-56 flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={bulkPending}
                data-testid="ecarter-selection"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {bulkPending ? "Écartement…" : "Écarter la sélection"}
              </button>
            </form>
          )}
          {bulkState?.error && (
            <p className="w-full rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
              {bulkState.error}
            </p>
          )}
        </div>
      )}

      {candidats.map((c) => (
        <CandidatRow
          key={c.failleId}
          dossierId={dossierId}
          candidat={c}
          lectureSeule={lectureSeule}
          selectionne={selection.includes(c.failleId)}
          selectionnable={
            !lectureSeule &&
            c.statut === "CANDIDATE" &&
            c.statutFaille === "ACTIVE"
          }
          onToggle={() => toggle(c.failleId)}
        />
      ))}
    </div>
  );
}

function CandidatRow({
  dossierId,
  candidat,
  lectureSeule = false,
  selectionne = false,
  selectionnable = false,
  onToggle,
}: {
  dossierId: string;
  candidat: CandidatDto;
  lectureSeule?: boolean;
  selectionne?: boolean;
  selectionnable?: boolean;
  onToggle?: () => void;
}) {
  const [confState, confAction, confPending] = useActionState(
    confirmerFaille,
    undefined,
  );
  const [rejState, rejAction, rejPending] = useActionState(
    rejeterFaille,
    undefined,
  );
  // Faille non encore validée au catalogue (ex. proposition créée par
  // l'auto-enrichissement IA) : le juriste la consulte et peut l'écarter de
  // son dossier, mais la confirmation est réservée aux failles ACTIVE —
  // l'activation du catalogue reste un geste admin (Q3 validée).
  const proposeeAuCatalogue = candidat.statutFaille === "PROPOSEE";

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${selectionne ? "border-emerald-300 bg-emerald-50/40" : "border-zinc-200"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          {selectionnable && (
            <input
              type="checkbox"
              data-testid={`selection-${candidat.failleId}`}
              checked={selectionne}
              onChange={onToggle}
              aria-label={`Sélectionner ${candidat.titre}`}
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
          )}
          <div>
            <p className="text-sm font-medium text-zinc-900">{candidat.titre}</p>
            <p className="text-xs text-zinc-500">
              {candidat.articleLoi}
              {candidat.statut === "CANDIDATE" &&
                typeof candidat.score === "number" && (
                  <>
                    {" · "}
                    <span className="text-zinc-400">
                      corroboration {candidat.score}%
                    </span>
                  </>
                )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {candidat.principale && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              Faille retenue
            </span>
          )}
          {typeof candidat.rangOrdre === "number" && candidat.rangOrdre >= 0 && (
            <span
              className="rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-700"
              data-testid={`rang-${candidat.rangOrdre}`}
              title="Ordre proposé par le classement (corroboration + historique). Le juriste reste seul décideur."
            >
              {candidat.rangOrdre === 0
                ? "Principale proposée"
                : `Moyen ${candidat.rangOrdre + 1}`}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statutCls[candidat.statut] ?? statutCls.CANDIDATE}`}
          >
            {statutLabels[candidat.statut] ?? candidat.statut}
          </span>
          {proposeeAuCatalogue && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Proposition (catalogue)
            </span>
          )}
          {!lectureSeule &&
            !proposeeAuCatalogue &&
            candidat.statut !== "CONFIRMEE" &&
            candidat.statut !== "REJETEE" && (
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
          {!lectureSeule && candidat.statut !== "REJETEE" && (
            <form action={rejAction} className="flex items-center gap-2">
              <input type="hidden" name="dossierId" value={dossierId} />
              <input type="hidden" name="failleId" value={candidat.failleId} />
              <input
                type="text"
                name="motifEcartement"
                data-testid="motif-ecartement-individuel"
                placeholder="Motif (5 car. min.)"
                className="w-44 rounded-full border border-zinc-300 px-3 py-1 text-xs"
              />
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
      {proposeeAuCatalogue && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Proposition au catalogue :</span>{" "}
          faille suggérée hors base validée — activation réservée à l&apos;admin
          depuis la bibliothèque juridique (règle puis template à rédiger).
          Aucune lettre ne peut la retenir tant qu&apos;elle n&apos;est pas
          ACTIVE.
        </div>
      )}
      {candidat.suggestionIa?.justification && (
        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <p>
            <span className="font-semibold">
              Suggestion IA
              {candidat.suggestionIa.pertinence
                ? ` · ${candidat.suggestionIa.pertinence}`
                : ""}
              {candidat.suggestionIa.source === "mock" ? " (simulée)" : ""} :
            </span>{" "}
            {candidat.suggestionIa.justification}
          </p>
          {candidat.suggestionIa.controle && (
            <p className="mt-1">
              <span className="font-semibold">À contrôler :</span>{" "}
              {candidat.suggestionIa.controle}
            </p>
          )}
        </div>
      )}
      {candidat.suggestionIa?.signalement && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Signalé par l&apos;IA :</span>{" "}
          {candidat.suggestionIa.signalement}
        </div>
      )}
      {(confState?.error || rejState?.error) && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {confState?.error ?? rejState?.error}
        </p>
      )}
    </div>
  );
}