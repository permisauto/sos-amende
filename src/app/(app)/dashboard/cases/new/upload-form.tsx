"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { createDossier } from "../actions";

/** Étapes affichées pendant le traitement, pour que le client comprenne l'attente. */
const ETAPES_TRAITEMENT = [
  "Document reçu et enregistré",
  "Lecture automatique du document",
  "Recherche des motifs de contestation",
  "Vérification par un juriste",
];

export function UploadForm({
  defaultType,
  signatureExistante,
}: {
  defaultType?: "AMENDE" | "SUSPENSION" | null;
  /** Signature déjà enregistrée sur le compte (User.signatureUrl) : plus besoin de resigner. */
  signatureExistante?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createDossier, undefined);
  const [type, setType] = useState(defaultType ?? "AMENDE");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  // Une signature existe déjà sur le compte : on ne montre le pad qu'à la demande.
  const [reSigner, setReSigner] = useState(!signatureExistante);
  const inputRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<SignatureCanvas>(null);

  function acceptFile(candidate: File | undefined | null) {
    if (!candidate) return;
    setFile(candidate);
  }

  const previewUrl = file?.type.startsWith("image/")
    ? URL.createObjectURL(file)
    : null;

  // Après chaque action, React remet le formulaire à zéro (dont l'input file,
  // que l'API interdit de remplir programmatiquement) : on resynchronise l'état
  // local pour ne pas afficher un fichier que l'input ne contient plus.
  useEffect(() => {
    if (state?.error && inputRef.current) {
      inputRef.current.value = "";
      setFile(null);
    }
  }, [state]);

  // Panneau de traitement : l'OCR (et son retry) peut durer plusieurs dizaines
  // de secondes. Le formulaire reste monté (état conservé, page stable) mais
  // désactivé — sans explication, un bouton figé passe pour un plantage.
  const panneauTraitement = pending && (
    <div
      className="flex flex-col items-center gap-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
      data-testid="traitement-en-cours"
    >
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      <div>
        <p className="text-lg font-semibold text-emerald-900">
          Analyse de votre document en cours
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-emerald-800">
          Comptez environ une à deux minutes. Vous pouvez fermer cette page :
          votre dossier est enregistré et vous recevrez un e-mail dès que
          l&apos;analyse sera terminée.
        </p>
      </div>
      <ol className="flex w-full max-w-sm flex-col gap-2 text-left">
        {ETAPES_TRAITEMENT.map((etape, i) => (
          <li key={etape} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i === 0
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-300 bg-white text-emerald-600"
              }`}
            >
              {i === 0 ? "✓" : i + 1}
            </span>
            <span
              className={
                i === 0 ? "font-medium text-emerald-900" : "text-emerald-800"
              }
            >
              {etape}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  // `action={formAction}` (et NON un onSubmit qui appelle `formAction(fd)`) :
  // React ne montre `pending` que si la soumission passe par sa propre
  // gestion du formulaire (transition maison). Un preventDefault manuel fait
  // échouer cette transition → le bouton reste figé sans aucun retour.
  return (
    <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
      {panneauTraitement}
      <input type="hidden" name="signature" value={signature ?? ""} />
      <div
        role="button"
        tabIndex={0}
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (pending) return;
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (pending) return;
          acceptFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          pending
            ? "cursor-not-allowed border-zinc-200 bg-zinc-100 opacity-60"
            : dragging
              ? "cursor-pointer border-emerald-500 bg-emerald-50"
              : "cursor-pointer border-zinc-300 bg-zinc-50 hover:border-emerald-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="pv"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Aperçu du PV"
                className="max-h-40 rounded-lg object-contain"
              />
            ) : (
              <span className="text-3xl">📄</span>
            )}
            <p className="text-sm font-medium text-zinc-800">{file.name}</p>
            <p className="text-xs text-zinc-500">
              {(file.size / 1024).toFixed(0)} Ko
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Vider aussi l'input : sinon reprendre le même fichier ne
                // déclenche aucun événement change.
                if (inputRef.current) inputRef.current.value = "";
                setFile(null);
              }}
              className="text-xs font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Changer de fichier
            </button>
          </div>
        ) : (
          <div>
            <span className="text-3xl">⬆️</span>
            <p className="mt-2 text-sm font-medium text-zinc-700">
              Glissez votre avis de contravention ici
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ou cliquez pour parcourir — JPEG, PNG, WebP ou PDF (8 Mo max)
            </p>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Type d&apos;infraction
        </span>
        <select
          name="type"
          value={type}
          disabled={pending}
          onChange={(e) => setType(e.target.value as "AMENDE" | "SUSPENSION")}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="AMENDE">Amende</option>
          <option value="SUSPENSION">Suspension de permis</option>
        </select>
      </label>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <fieldset
        disabled={pending}
        className="rounded-2xl border border-zinc-200 p-4 disabled:opacity-60"
      >
        <legend className="px-2 text-sm font-medium text-zinc-700">
          Votre signature
        </legend>
        {signatureExistante && !reSigner ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-600">
              Votre signature est déjà enregistrée. Elle sera apposée
              automatiquement sur la lettre de ce dossier — vous n&apos;avez
              rien à refaire.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureExistante}
                alt="Votre signature enregistrée"
                className="h-12 object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setReSigner(true);
                  setSignature(null);
                }}
                className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-white"
              >
                Signer à nouveau
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-500">
              {signatureExistante
                ? "Votre nouvelle signature remplacera celle enregistrée sur votre compte."
                : "Elle est capturée une fois ici et sera apposée automatiquement sur chaque lettre de contestation. Vous pourrez la modifier à tout moment."}
            </p>
            <div className="rounded-xl border border-zinc-300 bg-white p-2">
              <SignatureCanvas
                ref={padRef}
                onEnd={() =>
                  setSignature(
                    padRef.current?.getTrimmedCanvas().toDataURL("image/png") ??
                      null,
                  )
                }
                canvasProps={{
                  className: "h-32 w-full rounded-lg cursor-crosshair",
                  height: 128,
                }}
                backgroundColor="white"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {signature && (
                <button
                  type="button"
                  onClick={() => {
                    padRef.current?.clear();
                    setSignature(null);
                  }}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Effacer ma signature
                </button>
              )}
              {signatureExistante && (
                <button
                  type="button"
                  onClick={() => setReSigner(false)}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Revenir à ma signature enregistrée
                </button>
              )}
            </div>
          </>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={!file || pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        )}
        {pending ? "Traitement en cours…" : "Lancer l'analyse de mon dossier"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Analyse gratuite. Comptez 1 à 2 minutes — vous pourrez fermer la page.
      </p>
    </form>
  );
}