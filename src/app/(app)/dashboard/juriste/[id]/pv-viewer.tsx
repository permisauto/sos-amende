"use client";

import { useState } from "react";

/**
 * Aperçu du document versé par le client (avis de contravention / décision de
 * suspension) affiché à côté de la lettre pour le contrôle côte à côte :
 * image avec zoom et pivotement, PDF dans une iframe (repli « Ouvrir » en
 * cas d'iframe refusée), et le texte OCR extrait replié sous le média — le
 * juriste confronte la lettre au document source sans quitter la page.
 */
export function PvViewer({
  url,
  titre,
  pvTexte = null,
}: {
  url: string | null;
  titre: string;
  pvTexte?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const estImage = url !== null && /\.(jpe?g|png|webp)(\?.*)?$/i.test(url);

  const bouton =
    "rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      data-testid="pv-apercu"
      className="flex h-full min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {titre}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {url && estImage && (
            <>
              <button
                type="button"
                aria-label="Réduire l'aperçu"
                disabled={zoom <= 1}
                onClick={() =>
                  setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))
                }
                className={bouton}
              >
                −
              </button>
              <span className="w-11 text-center text-xs tabular-nums text-zinc-500">
                {Math.round(zoom * 100)} %
              </span>
              <button
                type="button"
                aria-label="Agrandir l'aperçu"
                disabled={zoom >= 3}
                onClick={() =>
                  setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))
                }
                className={bouton}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Pivoter l'aperçu"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className={bouton}
              >
                Pivoter
              </button>
              <button
                type="button"
                aria-label="Réinitialiser l'aperçu"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
                className={bouton}
              >
                Réinit.
              </button>
            </>
          )}
          {url && !estImage && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Ouvrir le document (PDF)
            </a>
          )}
        </div>
      </div>

      {!url ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-500">
          Aucun document téléversé pour ce dossier.
        </p>
      ) : estImage ? (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-zinc-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={titre}
            className="max-w-none rounded-lg bg-white shadow-sm"
            style={{
              width: `${zoom * 100}%`,
              transform: `rotate(${rotation}deg)`,
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-zinc-50">
          <iframe
            src={url}
            title={titre}
            className="h-full min-h-[18rem] w-full border-0"
          />
        </div>
      )}

      {pvTexte && (
        <details className="border-t border-zinc-100 px-4 py-3">
          <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Texte extrait (OCR)
          </summary>
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-700">
            {pvTexte}
          </pre>
        </details>
      )}
    </section>
  );
}
