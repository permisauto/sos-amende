"use client";

import { useActionState, useState } from "react";
import { relancerVerificationPoussee } from "../actions";

/**
 * Vérification poussée : le juriste ajoute ses remarques (annexées au texte
 * scanné) et le moteur relance la détection de failles sur ce dossier.
 * Aucune donnée juridique n'est inventée — seules les failles ACTIVE validées
 * par l'admin alimentent les lettres.
 */
export function VerificationPoussee({
  dossierId,
  lectureSeule = false,
}: {
  dossierId: string;
  lectureSeule?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(
    relancerVerificationPoussee,
    undefined,
  );

  if (lectureSeule) return null;

  const fermer = () => setOuvert(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-full border border-sky-300 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
      >
        Relancer la vérification
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">
                Vérification poussée
              </h3>
              <button
                type="button"
                onClick={fermer}
                className="rounded-full p-1 text-zinc-400 hover:text-zinc-700"
                aria-label="Fermer"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Le moteur relance la recherche de failles juridiques sur le
              dossier avec vos remarques en contexte. Une lettre sera
              régénérée depuis un template validé si un nouveau fondement est
              trouvé.
            </p>
            <form action={formAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="dossierId" value={dossierId} />
              <textarea
                name="remarques"
                required
                rows={3}
                minLength={10}
                placeholder="Ex. : la signalisation temporaire n'a pas été photographiée — vérifier les mentions de travaux…"
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              {state?.error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {state.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={fermer}
                  className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Recherche…" : "Relancer la vérification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}