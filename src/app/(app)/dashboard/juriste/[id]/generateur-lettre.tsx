"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { genererVarianteLettre } from "../actions";

/**
 * Variante de lettre calculée côté serveur : une combinaison de failles
 * ACTIVE (une seule, ou plusieurs juxtaposées) avec le texte rempli depuis
 * les templates de la base juridique.
 */
export type VarianteLettre = {
  cle: string;
  titre: string;
  failleIds: string[];
  fondements: { titre: string; article: string }[];
  lettre: string;
};

/**
 * Générateur de lettre : le juriste ouvre une palette de variantes
 * (combinaisons de failles du dossier) et applique celle qu'il préfère. Un
 * résumé des fondements retenus est affiché AVANT l'application — rien n'est
 * écrit tant que le juriste ne valide pas. Seules des failles ACTIVE
 * alimentent les variantes (anti-hallucination) ; aucune saisie libre.
 */
export function GenerateurLettre({
  dossierId,
  variantes,
  lectureSeule = false,
  suggerees = false,
}: {
  dossierId: string;
  variantes: VarianteLettre[];
  lectureSeule?: boolean;
  suggerees?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [selection, setSelection] = useState<string>(variantes[0]?.cle ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(
    genererVarianteLettre,
    undefined,
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  const active =
    variantes.find((v) => v.cle === selection) ?? variantes[0] ?? null;

  useEffect(() => {
    if (!ouvert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        setConfirmed(false);
      }
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [ouvert]);

  useEffect(() => {
    if (state?.ok) {
      queueMicrotask(() => {
        setOuvert(false);
        setConfirmed(false);
      });
    }
  }, [state]);

  if (lectureSeule || variantes.length === 0) return null;

  const fermer = () => {
    setOuvert(false);
    setConfirmed(false);
  };

  const nbCaracteres = active?.lettre.length ?? 0;
  const totalFondements = active?.fondements.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOuvert(true);
          setConfirmed(false);
        }}
        className={
          suggerees
            ? "inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            : "rounded-full border border-violet-300 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-50"
        }
        title="Générer une autre version de la lettre depuis la base juridique"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.914a1.5 1.5 0 00-.44-1.06l-3.914-3.914A1.5 1.5 0 0011.586 2H4.5zm7.5 1.5v4a.5.5 0 01-.5.5h-4a.5.5 0 010-1h4v-3.5h.5zM7.5 9.5h5v1h-5v-1zm0 3h5v1h-5v-1zm0 3h3v1h-3v-1z" />
        </svg>
        Récrire la lettre
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  Générateur de lettre
                </h3>
                <p className="mt-1 text-sm text-zinc-600">
                  La lettre est rédigée depuis des failles juridiques validées
                  (base ACTIVE), jamais librement. Choisissez la combinaison,
                  lisez le résumé puis appliquez.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={fermer}
                aria-label="Fermer"
                className="rounded-full p-1 text-zinc-400 hover:text-zinc-700"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Variante à appliquer
                </legend>
                {variantes.map((v) => (
                  <label
                    key={v.cle}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      selection === v.cle
                        ? "border-violet-400 bg-violet-50/60"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="variante"
                      value={v.cle}
                      checked={selection === v.cle}
                      onChange={() => {
                        setSelection(v.cle);
                        setConfirmed(false);
                      }}
                      className="mt-1 h-4 w-4 text-violet-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-800">
                        {v.titre}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {v.fondements.length} fondement(s) · {v.lettre.length}{" "}
                        caractères
                      </span>
                      <details className="mt-1">
                        <summary className="cursor-pointer select-none text-xs font-semibold text-violet-700 hover:text-violet-900">
                          Aperçu de la lettre
                        </summary>
                        <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700">
                          {v.lettre}
                        </p>
                      </details>
                    </span>
                  </label>
                ))}
              </fieldset>

              {active && (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Résumé avant application
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {active.fondements.map((f) => (
                      <li key={`${active.cle}-${f.titre}`} className="text-sm text-zinc-700">
                        <span className="font-medium">• {f.titre}</span>
                        {f.article ? (
                          <span className="text-xs text-zinc-500"> ({f.article})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500">
                    Cette variante {totalFondements > 1 ? "juxtapose les fondements sélectionnés" : "reprend un seul fondement"} (
                    {nbCaracteres} caractères) — la lettre actuelle du dossier
                    sera remplacée.
                  </p>
                  {state?.error && (
                    <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                      {state.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-6 py-4">
              <p className="text-xs text-zinc-500">
                {confirmed
                  ? "Confirmez pour remplacer la lettre actuelle."
                  : "Un clic de plus pour confirmer — la lettre n'est pas encore modifiée."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fermer}
                  className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Annuler
                </button>
                {!confirmed ? (
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => setConfirmed(true)}
                    className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Voir le récapitulatif
                  </button>
                ) : (
                  <form action={formAction}>
                    <input type="hidden" name="dossierId" value={dossierId} />
                    {active?.failleIds.map((id) => (
                      <input key={id} type="hidden" name="failleId" value={id} />
                    ))}
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pending ? "Application…" : "Appliquer cette variante"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}