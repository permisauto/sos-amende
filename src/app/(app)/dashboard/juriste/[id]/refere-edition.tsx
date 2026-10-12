"use client";

import { useActionState, useEffect, useState } from "react";
import { modifierRefere } from "../actions";

/**
 * Référé-suspension (art. L. 521-2 CJA) : affiché en lecture seule par défaut
 * (consultation), avec bouton « Modifier le référé » tant que le dossier n'est
 * pas validé. Le texte enregistré dans `Dossier.refereGenere` est exactement
 * celui qui partira dans le pack Télérecours (`genererPackTelecours` le
 * priorise sur le template de la faille) — le juriste relit donc le référé
 * tel qu'il sera déposé. Aucun PDF à cet instant : le pack n'est généré qu'à
 * la validation/signature.
 * `modifiable` masque l'édition (dossier déjà validé/envoyé) ;
 * `lectureSeule` (admin) verrouille toute interaction avec une mention.
 */
export function RefereEdition({
  dossierId,
  refere,
  modifiable = true,
  lectureSeule = false,
}: {
  dossierId: string;
  refere: string;
  modifiable?: boolean;
  lectureSeule?: boolean;
}) {
  const [state, formAction, pending] = useActionState(modifierRefere, undefined);
  const [edition, setEdition] = useState(false);

  // Une fois le référé enregistré, retour à la consultation (hors cycle de
  // rendu, comme LettreEdition — pas de rendu en cascade).
  useEffect(() => {
    if (state?.ok) {
      queueMicrotask(() => setEdition(false));
    }
  }, [state]);

  return (
    <div
      data-testid="refere-bloc"
      className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-5"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Référé-suspension (art. L. 521-2 CJA)
        </p>
        <p className="mt-1 text-xs text-indigo-700/80">
          Rédigé à l&apos;analyse — relu et modifiable avant validation : le
          pack Télérecours déposé contiendra exactement ce texte.
        </p>
      </div>
      <div
        data-testid="refere-apercu"
        className="max-h-80 overflow-y-auto rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800"
      >
        {edition ? (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="dossierId" value={dossierId} />
            <textarea
              name="refere"
              required
              rows={14}
              aria-label="Texte du référé-suspension"
              defaultValue={refere}
              className="min-w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                data-testid="refere-enregistrer"
                disabled={pending}
                className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Enregistrement…" : "Enregistrer le référé"}
              </button>
              <button
                type="button"
                onClick={() => setEdition(false)}
                disabled={pending}
                className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
            {state?.ok && (
              <p className="text-sm font-medium text-emerald-700">
                Référé enregistré — le pack PDF l&apos;utilisera tel quel.
              </p>
            )}
            {state?.error && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {state.error}
              </p>
            )}
          </form>
        ) : (
          <p className="whitespace-pre-wrap">{refere}</p>
        )}
      </div>
      {!lectureSeule && modifiable && !edition && (
        <div>
          <button
            type="button"
            data-testid="refere-modifier"
            onClick={() => setEdition(true)}
            className="rounded-full border border-indigo-200 px-6 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            Modifier le référé
          </button>
        </div>
      )}
      {lectureSeule && (
        <p className="text-xs text-zinc-500">
          Lecture seule (administrateur) : la modification est réservée aux
          juristes.
        </p>
      )}
    </div>
  );
}
