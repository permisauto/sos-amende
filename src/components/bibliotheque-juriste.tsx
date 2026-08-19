"use client";

import { useMemo, useState } from "react";

export type RefJurisprudentielle = {
  reference: string;
  juridiction?: string | null;
  date?: string | null;
  url?: string | null;
  verifiee: boolean;
};

export type FailleBibliotheque = {
  id: string;
  titreFaille: string;
  articleLoi: string;
  statut: string;
  jurisprudence: RefJurisprudentielle[];
};

/**
 * Bibliothèque juriste dynamique : sur un dossier, affiche les références de
 * la faille retenue (celles qui fondent la lettre) et permet une recherche
 * live dans l'ensemble de la bibliothèque pour vérifier que les références
 * citées sont exactes et conformes (garde-fou anti-hallucination).
 */
export function BibliothequeJuriste({
  failleRetenue,
  bibliotheque,
}: {
  failleRetenue: FailleBibliotheque | null;
  bibliotheque: FailleBibliotheque[];
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bibliotheque
      .filter((f) => {
        const haystack = [
          f.titreFaille,
          f.articleLoi,
          ...f.jurisprudence.map((j) => j.reference),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 6);
  }, [query, bibliotheque]);

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Bibliothèque juridique — vérification des références
        </h2>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
          {bibliotheque.length} faille{bibliotheque.length > 1 ? "s" : ""} dans
          la bibliothèque
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Vérifiez que les références citées dans la lettre sont exactes
        (articles et jurisprudences sourcées).
      </p>

      {failleRetenue && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Faille retenue pour cette lettre
          </p>
          <p className="mt-1 font-semibold text-emerald-900">
            {failleRetenue.titreFaille}
          </p>
          <p className="text-sm text-emerald-800">{failleRetenue.articleLoi}</p>
          {failleRetenue.jurisprudence.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {failleRetenue.jurisprudence.map((j, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      j.verifiee
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {j.verifiee ? "Vérifiée" : "À vérifier"}
                  </span>
                  <span className="text-emerald-900">{j.reference}</span>
                  {j.url && (
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-800 underline"
                    >
                      Source
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4">
        <label
          htmlFor="recherche-bibliotheque"
          className="text-sm font-medium text-zinc-700"
        >
          Rechercher une référence dans la bibliothèque
        </label>
        <input
          id="recherche-bibliotheque"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Article, jurisprudence, mot-clé…"
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {query.trim() ? (
        results.length === 0 ? (
          <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Aucune référence trouvée dans la bibliothèque.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100">
            {results.map((f) => (
              <li key={f.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-900">{f.titreFaille}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      f.statut === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : f.statut === "PROPOSEE"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {f.statut === "ACTIVE"
                      ? "Active"
                      : f.statut === "PROPOSEE"
                        ? "Proposition"
                        : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-zinc-600">{f.articleLoi}</p>
                {f.jurisprudence.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {f.jurisprudence.map((j, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-2 text-xs"
                      >
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            j.verifiee
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {j.verifiee ? "Vérifiée" : "À vérifier"}
                        </span>
                        <span className="text-zinc-700">{j.reference}</span>
                        {j.url && (
                          <a
                            href={j.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-emerald-700 hover:underline"
                          >
                            Source
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Tapez un mot-clé pour rechercher dans les {bibliotheque.length} failles
          de la bibliothèque (articles, titres, jurisprudences).
        </p>
      )}
    </div>
  );
}