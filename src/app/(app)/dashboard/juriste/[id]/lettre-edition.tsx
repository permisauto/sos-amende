"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { modifierLettre } from "../actions";

/**
 * Lettre consultable et, au besoin, modifiable par le juriste avant validation.
 * La lettre s'affiche toujours en lecture seule par défaut (consultation) ; un
 * bouton « Modifier la lettre » ouvre l'édition. La signature (si déjà apposée
 * par le client) est recollée automatiquement en bas de la lettre par l'action
 * `modifierLettre` — le juriste modifie le texte, jamais la signature.
 * Le bouton Télécharger génère le PDF à partir du contenu affiché (POST /api/dossier/[id]/lettre)
 * pour garantir que le PDF téléchargé est identique à la prévisualisation.
 * `lectureSeule` (admin) verrouille toute interaction : simple consultation.
 */
export function LettreEdition({
  dossierId,
  lettre,
  signee,
  lectureSeule = false,
}: {
  dossierId: string;
  lettre: string;
  signee: boolean;
  lectureSeule?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    modifierLettre,
    undefined,
  );
  const [edition, setEdition] = useState(false);
  const [dlPending, setDlPending] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Une fois la lettre enregistrée, retour à la consultation. La bascule est
  // différée hors du cycle de rendu pour éviter un rendu en cascade.
  useEffect(() => {
    if (state?.ok) {
      queueMicrotask(() => setEdition(false));
    }
  }, [state]);

  const lectureActive = lectureSeule || !edition;

  async function handleDownload() {
    const txt = textRef.current?.value ?? lettre;
    if (txt.trim().length < 10) {
      setDlError("Lettre trop courte.");
      return;
    }
    setDlPending(true);
    setDlError(null);
    try {
      const res = await fetch(`/api/dossier/${dossierId}/lettre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lettre: txt }),
      });
      if (!res.ok) throw new Error("Génération PDF échouée");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lettre-${dossierId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Erreur téléchargement");
    } finally {
      setDlPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-800">
        {lectureActive ? (
          <p className="whitespace-pre-wrap">{lettre}</p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="dossierId" value={dossierId} />
            <textarea
              ref={textRef}
              name="lettre"
              required
              rows={16}
              aria-label="Texte de la lettre de contestation"
              defaultValue={lettre}
              className="min-w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="text-xs text-zinc-500">
              {signee
                ? "La lettre est déjà signée par le client : votre signature restera collée en bas de la nouvelle version (PDF régénéré automatiquement)."
                : "La lettre n'est pas encore signée : le client signera après votre relecture."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Enregistrement…" : "Enregistrer la lettre modifiée"}
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
                Lettre enregistrée, retour automatique à la consultation.
              </p>
            )}
            {state?.error && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {state.error}
              </p>
            )}
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!lectureSeule && !edition && (
          <button
            type="button"
            onClick={() => setEdition(true)}
            className="rounded-full border border-emerald-200 px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            Modifier la lettre
          </button>
        )}
        {!lectureSeule && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={dlPending}
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dlPending ? "Génération…" : "Télécharger la lettre affichée (PDF)"}
          </button>
        )}
        {lectureSeule && (
          <p className="text-xs text-zinc-500">
            Lecture seule (administrateur) : la modification est réservée aux
            juristes.
          </p>
        )}
      </div>
      {dlError && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {dlError}
        </p>
      )}
    </div>
  );
}