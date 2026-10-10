"use client";

import { useEffect, useState } from "react";
import type { ActionEtat, SourceDto } from "./veille-list";

type TexteData = { contenu: string; dispositif: string | null };

/**
 * Lecture côte à côté (lot M) : à gauche le **texte de la décision**
 * (dispositif extrait localement, ou texte intégral), chargé à la demande via
 * `GET /api/veille/[id]/texte` ; à droite la **règle dégagée, ses conditions
 * d'application et les références** (articles, ECLI, juridiction).
 *
 * Lot O — correction admin : dans le drawer, l'admin peut basculer en
 * édition (`Modifier la proposition`) pour corriger titre, type, articles,
 * règle, conditions et résumé **avant** de valider : « Enregistrer les
 * corrections » écrit dans `SourceJuridique.proposition` sans créer de
 * faille, « Valider » soumet les valeurs corrigées (elles deviennent la
 * faille ACTIVE). Le juriste lit et attend, jamais d'édition.
 */
export function LectureDrawer({
  s,
  role,
  valider,
  ecart,
  onClose,
}: {
  s: SourceDto;
  role: string;
  valider: ActionEtat;
  ecart: ActionEtat;
  onClose: () => void;
}) {
  const [texte, setTexte] = useState<TexteData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<"dispositif" | "integral">("dispositif");
  const [edition, setEdition] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/veille/${s.id}/texte`);
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? "Publication introuvable."
              : "Chargement du texte impossible.",
          );
        }
        const d = (await r.json()) as TexteData;
        if (!annule) setTexte(d);
      } catch (e) {
        if (!annule) {
          setErreur(e instanceof Error ? e.message : "Chargement impossible.");
        }
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [s.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Une fois les corrections enregistrées (ou la validation faite), retour à
  // la consultation — même cadence que `lettre-edition.tsx` (bascule hors du
  // cycle de rendu pour éviter un rendu en cascade).
  useEffect(() => {
    if (valider.state?.ok) {
      queueMicrotask(() => setEdition(false));
    }
  }, [valider.state]);

  const p = s.proposition;
  const conditions = p?.conditions ?? [];
  const complet = p?.etat === "extrait";
  // Édition réservée à l'admin, sur une publication encore à lire et une
  // proposition réellement affichable (un `echec` se relance, ne se corrige pas).
  const modifiable =
    role === "ADMIN" && s.statut === "NOUVEAU" && !!p && p.etat !== "echec";
  const enEdition = edition && modifiable && !!p;
  const aDispositif = !!texte?.dispositif;
  const corps =
    texte == null
      ? ""
      : mode === "dispositif" && texte.dispositif
        ? texte.dispositif
        : texte.contenu;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="lecture-drawer"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Lecture de la décision : ${s.titre}`}
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Lecture côte à côté
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-zinc-900">
              {s.titre}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {[s.juridiction, s.ecli ?? s.reference].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="lecture-fermer"
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Fermer
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Colonne gauche : texte de la décision */}
          <section className="flex min-h-0 flex-col border-b border-zinc-200 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-6 py-3">
              <button
                type="button"
                disabled={!aDispositif || chargement}
                onClick={() => setMode("dispositif")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  mode === "dispositif" && aDispositif
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Dispositif
              </button>
              <button
                type="button"
                disabled={chargement}
                onClick={() => setMode("integral")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  mode === "integral" || !aDispositif
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Texte intégral
              </button>
              {aDispositif && (
                <span className="text-[11px] text-zinc-500">
                  Extrait local du passage « ordonne/décide » — sans IA.
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {chargement && (
                <p className="text-sm text-zinc-500">Chargement du texte…</p>
              )}
              {erreur && (
                <p className="text-sm text-red-700">{erreur}</p>
              )}
              {!chargement && !erreur && !aDispositif && mode === "dispositif" && (
                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Dispositif non repéré dans ce document — texte intégral
                  affiché.
                </p>
              )}
              {!chargement && !erreur && texte && (
                <pre
                  data-testid="lecture-texte"
                  className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800"
                >
                  {corps}
                </pre>
              )}
            </div>
          </section>

          {/* Colonne droite : règle, conditions, références, décision */}
          <section className="flex min-h-0 flex-col">
            {p && enEdition ? (
              /* --- Édition (admin) : corriger puis enregistrer/valider --- */
              <form
                action={valider.action}
                data-testid="lecture-form-correction"
                className="flex min-h-0 flex-1 flex-col"
              >
                <input type="hidden" name="id" value={s.id} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                    Corrigez la proposition suggérée par l&apos;IA, puis
                    enregistrez ou validez : c&apos;est votre saisie qui
                    deviendra la faille — jamais un article inventé par la
                    machine.
                  </p>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Titre de la faille
                    <input
                      type="text"
                      name="titre"
                      defaultValue={p.titre}
                      data-testid="lecture-titre"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Type d&apos;infraction
                    <select
                      name="typeInfraction"
                      defaultValue={p.typeInfraction}
                      data-testid="lecture-type"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="AMENDE">Amende</option>
                      <option value="SUSPENSION">Suspension</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Articles retenus (un par ligne)
                    <textarea
                      name="articles"
                      rows={2}
                      defaultValue={p.articles.join("\n")}
                      data-testid="lecture-articles"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Règle dégagée
                    <textarea
                      name="regle"
                      rows={5}
                      defaultValue={p.regle}
                      data-testid="lecture-regle-edit"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Motif décisif de la décision (verbatim, 20 à 600 caractères)
                    <textarea
                      name="motifDecisif"
                      rows={3}
                      defaultValue={p.motifDecisif ?? ""}
                      data-testid="lecture-motif-decisif-edit"
                      placeholder="Recopiez le passage où la juridiction énonce le motif de sa décision — ou laissez vide."
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm italic leading-relaxed text-zinc-900"
                    />
                  </label>
                  {p.obsolescence && (
                    <p
                      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"
                      data-testid="badge-obsolescence-edit"
                    >
                      <span className="font-semibold">Obsolescence signalée : </span>
                      {p.obsolescence} — appréciation IA en lecture seule, ne
                      modifiable que depuis une nouvelle extraction.
                    </p>
                  )}
                  <label className="block text-xs font-semibold text-zinc-500">
                    Conditions d&apos;application (une par ligne)
                    <textarea
                      name="conditions"
                      rows={4}
                      defaultValue={p.conditions.join("\n")}
                      data-testid="lecture-conditions-edit"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">
                    Objet de la décision (résumé)
                    <textarea
                      name="resume"
                      rows={2}
                      defaultValue={p.resume}
                      data-testid="lecture-resume"
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                  </label>
                  {p.extraits.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Extraits verbatim (conservés, non modifiables)
                      </p>
                      <ul className="mt-1.5 space-y-1.5 border-l-2 border-zinc-200 pl-3">
                        {p.extraits.map((e, i) => (
                          <li key={i} className="text-xs text-zinc-600">
                            « {e} »
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-6 py-4">
                  <button
                    type="submit"
                    name="intention"
                    value="brouillon"
                    disabled={valider.pending}
                    data-testid="lecture-enregistrer"
                    className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    {valider.pending ? "Enregistrement…" : "Enregistrer les corrections"}
                  </button>
                  <button
                    type="submit"
                    name="intention"
                    value="valider"
                    disabled={valider.pending}
                    data-testid="lecture-valider"
                    className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {valider.pending ? "Validation…" : "Valider (→ faille ACTIVE)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdition(false)}
                    disabled={valider.pending}
                    data-testid="lecture-annuler"
                    className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  {valider.state?.message && (
                    <p className="w-full text-xs text-emerald-700">
                      {valider.state.message}
                    </p>
                  )}
                  {valider.state?.error && (
                    <p className="w-full text-xs text-red-700">
                      {valider.state.error}
                    </p>
                  )}
                </footer>
              </form>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                  {!p && (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-800">
                        Aucune proposition extraite.
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Le cron l&apos;extrait automatiquement au prochain
                        passage (03:30).
                      </p>
                    </div>
                  )}

                  {p && p.etat === "echec" && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-800">
                        Extraction en échec
                      </p>
                      <p className="mt-1 text-xs text-red-700">{p.motif}</p>
                      <p className="mt-1 text-[11px] text-red-600">
                        Relance automatique au prochain passage (cron 03:30).
                      </p>
                    </div>
                  )}

                  {p && p.etat !== "echec" && (
                    <>
                      <div>
                        <p
                          className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
                          data-testid="lecture-regle-titre"
                        >
                          Règle dégagée
                          {p.etat !== "extrait" && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              proposition incomplète
                            </span>
                          )}
                        </p>
                        <p
                          className="mt-1.5 text-sm leading-relaxed text-zinc-800"
                          data-testid="lecture-regle"
                        >
                          {p.regle || "—"}
                        </p>
                      </div>

                      {p.obsolescence && (
                        <div
                          className="rounded-xl border border-amber-300 bg-amber-50 p-3"
                          data-testid="badge-obsolescence"
                        >
                          <p className="text-xs font-semibold text-amber-900">
                            Obsolescence signalée
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-amber-800">
                            {p.obsolescence}
                          </p>
                          <p className="mt-1.5 text-[11px] text-amber-700">
                            Appréciation automatique — à vérifier sur la source
                            avant usage. Ne bloque ni ne retire la publication.
                          </p>
                        </div>
                      )}

                      {p.motifDecisif && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Motif décisif (verbatim)
                          </p>
                          <p
                            className="mt-1.5 border-l-2 border-sky-300 pl-3 text-xs italic leading-relaxed text-zinc-700"
                            data-testid="lecture-motif-decisif"
                          >
                            « {p.motifDecisif} »
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Conditions d&apos;application
                        </p>
                        {conditions.length > 0 ? (
                          <ul
                            className="mt-1.5 space-y-1.5"
                            data-testid="lecture-conditions"
                          >
                            {conditions.map((c, i) => (
                              <li
                                key={i}
                                className="flex gap-2 text-sm text-zinc-800"
                              >
                                <span
                                  aria-hidden
                                  className="mt-0.5 font-semibold text-emerald-700"
                                >
                                  ☐
                                </span>
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1.5 text-sm text-zinc-500">
                            Aucune condition d&apos;application extraite.
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Références
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {p.articles.map((a) => (
                            <span
                              key={a}
                              className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900"
                            >
                              {a}
                            </span>
                          ))}
                          <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                            {p.typeInfraction === "SUSPENSION"
                              ? "Suspension"
                              : "Amende"}
                          </span>
                          {s.ecli && (
                            <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                              {s.ecli}
                            </span>
                          )}
                          {s.url && (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
                            >
                              Source primaire
                            </a>
                          )}
                        </div>
                        {p.resume && (
                          <p className="mt-2 text-xs text-zinc-600">{p.resume}</p>
                        )}
                      </div>

                      {p.extraits.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Extraits verbatim
                          </p>
                          <ul className="mt-1.5 space-y-1.5 border-l-2 border-zinc-200 pl-3">
                            {p.extraits.map((e, i) => (
                              <li key={i} className="text-xs text-zinc-600">
                                « {e} »
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Décision (admin) ou attente (juriste) */}
                {p &&
                  p.etat !== "echec" &&
                  s.statut === "NOUVEAU" &&
                  (role === "ADMIN" || complet) && (
                    <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-6 py-4">
                      {role === "ADMIN" ? (
                        <>
                          {modifiable && (
                            <button
                              type="button"
                              onClick={() => setEdition(true)}
                              data-testid="lecture-modifier"
                              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                            >
                              Modifier la proposition
                            </button>
                          )}
                          {complet && (
                            <form action={valider.action}>
                              <input type="hidden" name="id" value={s.id} />
                              <button
                                type="submit"
                                disabled={valider.pending}
                                data-testid="lecture-valider"
                                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                              >
                                {valider.pending
                                  ? "Validation…"
                                  : "Valider la lecture (→ faille ACTIVE)"}
                              </button>
                            </form>
                          )}
                          {!complet && (
                            <p className="text-[11px] font-medium text-amber-700">
                              Proposition incomplète : corrigez-la avant
                              validation.
                            </p>
                          )}
                          <form action={ecart.action}>
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              disabled={ecart.pending}
                              data-testid="lecture-ecarter"
                              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                            >
                              {ecart.pending ? "…" : "Écarter"}
                            </button>
                          </form>
                        </>
                      ) : (
                        complet && (
                          <p className="text-[11px] text-zinc-600">
                            En attente de validation par un administrateur.
                          </p>
                        )
                      )}
                      {(valider.state?.message || ecart.state?.message) && (
                        <p className="text-xs text-emerald-700">
                          {valider.state?.message ?? ecart.state?.message}
                        </p>
                      )}
                      {(valider.state?.error || ecart.state?.error) && (
                        <p className="text-xs text-red-700">
                          {valider.state?.error ?? ecart.state?.error}
                        </p>
                      )}
                    </footer>
                  )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
