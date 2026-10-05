"use client";

import { useActionState } from "react";
import { verifierFailles } from "../actions";

/**
 * « Vérifier les failles » (verification 2.0) — équivalent du bloc
 * « Vérifier les preuves » : le juriste relance la recherche des failles du
 * cas d'espèce (contexte enrichi : pièces versées, météo, questionnaire) avec
 * option d'analyse approfondie IA. L'IA ne propose que des ids du catalogue,
 * toujours à confirmer par le juriste — aucune lettre n'est écrite par le
 * modèle.
 */
export function VerificationFailles({
  dossierId,
  iaDisponible,
  derniereVerification = null,
}: {
  dossierId: string;
  iaDisponible: boolean;
  derniereVerification?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    verifierFailles,
    undefined,
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Vérification des failles</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Relance la recherche de failles correspondant au cas d&apos;espèce :
        données extraites, texte du PV, questionnaire, pièces déjà versées et
        météo réelle sont pris en compte. Vos décisions (failles confirmées ou
        écartées) sont conservées ; une lettre n&apos;est régénérée que si de
        nouveaux fondements sont trouvés.
      </p>

      {derniereVerification && (
        <p className="mt-2 text-xs text-zinc-400">
          Dernière vérification : {derniereVerification}
        </p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="dossierId" value={dossierId} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            Remarques (optionnel)
          </span>
          <textarea
            name="remarques"
            rows={2}
            placeholder="Ex. : la signalisation temporaire n'a pas été photographiée — vérifier les mentions de travaux…"
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        {iaDisponible && (
          <label className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
            <input
              type="checkbox"
              name="ia"
              defaultChecked
              className="mt-0.5 h-4 w-4 accent-sky-600"
            />
            <span>
              <span className="font-semibold">
                Analyse approfondie (IA)
              </span>{" "}
              — compare les faits du dossier à chaque faille du catalogue et
              justifie chaque suggestion. Les suggestions restent à confirmer
              par vous ; aucun article n&apos;est inventé.
            </span>
          </label>
        )}

        {state?.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state?.ok && state.message && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {state.message}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "Vérification en cours…" : "Vérifier les failles"}
          </button>
        </div>
      </form>
    </div>
  );
}
