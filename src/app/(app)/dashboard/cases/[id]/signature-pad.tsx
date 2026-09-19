"use client";

import { useActionState, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { signerDossier } from "../actions";

/**
 * Signature du client sur la lettre. Si une signature a été capturée au dépôt
 * (User.signatureUrl), elle est proposée par défaut (case cochée) et réutilisée
 * sans re-tracé ; l'utilisateur peut décocher pour tracer une nouvelle
 * signature qui remplacera celle du profil.
 */
export function SignaturePad({
  dossierId,
  signatureInitiale,
}: {
  dossierId: string;
  signatureInitiale?: string | null;
}) {
  const [state, formAction, pending] = useActionState(signerDossier, undefined);
  const padRef = useRef<SignatureCanvas>(null);
  const detecteSignature = Boolean(signatureInitiale);
  const [reutiliser, setReutiliser] = useState<boolean>(detecteSignature);
  const [signature, setSignature] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reutiliser && !signature) return;
    const fd = new FormData();
    fd.set("dossierId", dossierId);
    if (!reutiliser && signature) {
      fd.set("signature", signature);
    }
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {detecteSignature ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={reutiliser}
              onChange={(e) => setReutiliser(e.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm text-zinc-700">
              <span className="font-medium">
                Réutiliser ma signature enregistrée
              </span>{" "}
              (celle-ci est apposée automatiquement sur vos lettres).
              Décochez pour tracer une nouvelle signature.
            </span>
          </label>
          {reutiliser && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureInitiale as string}
              alt="Aperçu de votre signature enregistrée"
              className="mt-3 h-20 rounded-lg border border-zinc-200 bg-white object-contain p-1"
            />
          )}
          {!reutiliser && (
            <div className="mt-3 rounded-xl border border-zinc-300 bg-white p-2">
              <SignatureCanvas
                ref={padRef}
                onEnd={() =>
                  setSignature(
                    padRef.current?.getTrimmedCanvas().toDataURL("image/png") ??
                      null,
                  )
                }
                canvasProps={{
                  className: "h-40 w-full rounded-lg cursor-crosshair",
                  height: 160,
                }}
                backgroundColor="white"
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            Aucune signature enregistrée sur votre profil : tracez-la une
            première fois ici. Elle sera conservée et réutilisée pour vos
            prochaines lettres.
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
                className: "h-40 w-full rounded-lg cursor-crosshair",
                height: 160,
              }}
              backgroundColor="white"
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        {!reutiliser && (
          <button
            type="button"
            onClick={() => {
              padRef.current?.clear();
              setSignature(null);
            }}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Effacer
          </button>
        )}
        <button
          type="submit"
          disabled={pending || (!reutiliser && !signature)}
          className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Génération du PDF…" : "Signer et générer le PDF"}
        </button>
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}