"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  enregistrerDecisionOmp,
  envoyerContestation,
  rejeterDossier,
  retournerDossier,
  validerDossier,
} from "../actions";
import { canauxEnvoi, libelleCanal, type InfractionType } from "@/lib/envoi";

export function JuristeActions({
  dossierId,
  mode = "full",
  validee = false,
  organisme = "ANTAI",
  type = "AMENDE",
  lectureSeule = false,
  showCanal = false,
  canalEnvoi = null,
}: {
  dossierId: string;
  mode?: "full" | "rejet";
  validee?: boolean;
  organisme?: string;
  type?: InfractionType;
  lectureSeule?: boolean;
  showCanal?: boolean;
  canalEnvoi?: string | null;
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
      {lectureSeule ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Lecture seule (administrateur) : le traitement du dossier
          (validation, rejet, envoi) est réservé aux juristes.
        </p>
      ) : (
        <>
      {mode === "full" &&
        (validee ? (
          <>
            <EnvoyerContestationForm
              dossierId={dossierId}
              organisme={organisme}
              type={type}
              canalActuel={canalEnvoi}
            />
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Lettre déjà validée.{" "}
              {canalEnvoi === "LRAR"
                ? "Canal retenu : lettre recommandée — SOS Amende envoie la lettre par nos soins. Vous pouvez basculer vers un envoi en ligne (ANTAI/Télérecours)."
                : "Choisissez le canal d'envoi ci-dessus, puis relancez l'envoi en ligne ou envoyez la lettre recommandée (SOS Amende)."}
            </p>
          </>
        ) : (
          <>
            <form action={valideAction} className="flex flex-col gap-2">
              <input type="hidden" name="dossierId" value={dossierId} />
              {showCanal && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    Canal d&apos;envoi de la contestation
                  </span>
                  <select
                    name="canalEnvoi"
                    defaultValue=""
                    required
                    className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="" disabled>
                      Choisir le canal…
                    </option>
                    {canauxEnvoi(type).map((canal) => (
                      <option key={canal} value={canal}>
                        {libelleCanal(canal)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="submit"
                disabled={validePending}
                className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validePending
                  ? "Validation…"
                  : showCanal
                    ? "Valider et Envoyer"
                    : "Valider et envoyer la contestation"}
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
        ))}

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
      </>
      )}
    </div>
  );
}

/**
 * Envoi / bascule du canal de la contestation (lettre + pièces jointes) —
 * affiché quand la validation a été enregistrée (dossier PRET + validé). Le
 * juriste choisit ou bascule le canal au moment de l'envoi : amende → ANTAI
 * (en ligne) ou lettre recommandée (envoyée par SOS Amende) ; suspension →
 * Télérecours (en ligne) ou lettre recommandée. Pour le canal LRAR, SOS Amende
 * expédie la lettre : le juriste peut saisir le numéro de recommandé.
 */
export function EnvoyerContestationForm({
  dossierId,
  organisme = "ANTAI",
  type = "AMENDE",
  canalActuel = null,
}: {
  dossierId: string;
  organisme?: string;
  type?: InfractionType;
  canalActuel?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    envoyerContestation,
    undefined,
  );
  const [canal, setCanal] = useState<string | null>(
    canalActuel ?? canauxEnvoi(type)[0],
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="dossierId" value={dossierId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Canal d&apos;envoi de la contestation
        </span>
        <select
          name="canalEnvoi"
          value={canal ?? ""}
          onChange={(e) => setCanal(e.target.value)}
          required
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <option value="" disabled>
            Choisir le canal…
          </option>
          {canauxEnvoi(type).map((c) => (
            <option key={c} value={c}>
              {libelleCanal(c)}
            </option>
          ))}
        </select>
      </label>
      {canal === "LRAR" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            Numéro de recommandé (optionnel)
          </span>
          <input
            name="numeroRecommandé"
            placeholder="Ex. 3A 018 234 5678 9"
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Envoi…"
          : canal === "LRAR"
            ? "Envoyer la lettre recommandée (SOS Amende)"
            : `Envoyer la contestation à ${organisme} (lettre + preuves)`}
      </button>
      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {canal === "LRAR" && (
        <p className="text-xs text-zinc-500">
          SOS Amende expédie la lettre en recommandé avec accusé de réception
          pour le compte du client : aucune action de sa part.
        </p>
      )}
    </form>
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