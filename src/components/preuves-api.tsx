"use client";

import { useActionState } from "react";
import { recupererPreuvesApi } from "@/app/(app)/dashboard/juriste/actions";

export function PreuvesApiBlock({
  dossierId,
  lectureSeule,
  conditionsMeteo,
}: {
  dossierId: string;
  lectureSeule: boolean;
  conditionsMeteo: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: unknown) => recupererPreuvesApi(dossierId),
    undefined,
  );

  const ajoutees = state && "ajoutees" in state ? state.ajoutees : undefined;
  const verifiees = state && "verifiees" in state ? state.verifiees : undefined;
  const error = state && "error" in state ? state.error : undefined;
  const rienDeNouveau = !!state && ajoutees && ajoutees.length === 0;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="flex items-center justify-between text-sm font-semibold text-zinc-900">
        Preuves externes (sources publiques)
        {ajoutees && ajoutees.length > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {ajoutees.length} nouvelle{ajoutees.length > 1 ? "s" : ""} preuve
            {ajoutees.length > 1 ? "s" : ""} ajoutée{ajoutees.length > 1 ? "s" : ""}
          </span>
        )}
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Météo au jour de l&rsquo;infraction, fiche radar de la liste officielle des
        radars automatiques (data.gouv.fr) et travaux signalés dans la zone
        (plateforme OpendataSoft). Les preuves déjà identifiées sont simplement
        revérifiées (aucune redondance) ; seules les preuves non encore
        répertoriées sont ajoutées.
      </p>

      {conditionsMeteo && (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span className="font-semibold">Météo au jour de l&rsquo;infraction :</span>{" "}
          {conditionsMeteo}
        </p>
      )}

      {!lectureSeule && (
        <form action={formAction} className="mt-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {pending
              ? "Vérification en cours…"
              : "Vérifier les preuves (météo, radar, travaux)"}
          </button>
        </form>
      )}

      {ajoutees && ajoutees.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
          {ajoutees.map((a) => (
            <li key={a}>+ {a}</li>
          ))}
        </ul>
      )}
      {rienDeNouveau && (
        <ul className="mt-2 space-y-1 text-xs text-zinc-500">
          {verifiees && verifiees.length > 0 ? (
            verifiees.map((v) => <li key={v}>• {v}</li>)
          ) : (
            <li>• Aucune nouvelle preuve trouvée (preuves déjà à jour).</li>
          )}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}