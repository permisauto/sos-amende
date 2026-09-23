"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidatDto } from "./failles-candidates";
import { FaillesCandidates } from "./failles-candidates";
import {
  BibliothequeJuriste,
  type FailleBibliotheque,
} from "@/components/bibliotheque-juriste";

export function SuggestionsDrawer({
  dossierId,
  candidats,
  lectureSeule,
  failleRetenue,
  bibliotheque,
}: {
  dossierId: string;
  candidats: CandidatDto[];
  lectureSeule: boolean;
  failleRetenue: FailleBibliotheque | null;
  bibliotheque: FailleBibliotheque[];
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path d="M9 4.5a.75.75 0 00-1.408-.5l-2.94 5.5a.75.75 0 00.657 1.093h1.658l-.62 4.158a.75.75 0 001.127.679l5.5-4.25A.75.75 0 0013 10H11.26l1.03-5.148A.75.75 0 0011.59 4l-2.59.5z" />
          <path d="M15.25 1.5a.75.75 0 01.75.75v.783l.64-.64a.75.75 0 111.06 1.06l-.64.64h.784a.75.75 0 010 1.5h-.784l.64.64a.75.75 0 01-1.06 1.06l-.64-.64v.783a.75.75 0 01-1.5 0V8.154l-.64.64a.75.75 0 01-1.06-1.06l.64-.64h-.784a.75.75 0 010-1.5h.784l-.64-.64a.75.75 0 011.06-1.06l.64.64V2.25a.75.75 0 01.75-.75z" />
        </svg>
        Suggestions IA
      </button>

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Suggestions IA pour ce dossier"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl transition-[transform,visibility] duration-300 ${
          open ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">Suggestions IA</h2>
            <p className="mt-0.5 text-sm text-zinc-600">
              Aide à la décision : failles détectées, variantes juridiques et
              modèles de lettres adaptés à ce dossier — sans quitter le
              dossier.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer les suggestions"
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
          {candidats.length > 0 && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Failles détectées — à confirmer ou écarter
              </h2>
              <div className="mt-3">
                <FaillesCandidates
                  dossierId={dossierId}
                  candidats={candidats}
                  lectureSeule={lectureSeule}
                />
              </div>
            </section>
          )}

          <BibliothequeJuriste
            failleRetenue={failleRetenue}
            bibliotheque={bibliotheque}
          />
        </div>
      </aside>
    </>
  );
}