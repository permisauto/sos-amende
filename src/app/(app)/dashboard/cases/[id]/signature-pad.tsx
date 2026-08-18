"use client";

import { useActionState, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { signerDossier } from "../actions";

export function SignaturePad({ dossierId }: { dossierId: string }) {
  const [state, formAction, pending] = useActionState(signerDossier, undefined);
  const padRef = useRef<SignatureCanvas>(null);
  const [signature, setSignature] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signature) return;
    const fd = new FormData();
    fd.set("dossierId", dossierId);
    fd.set("signature", signature);
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-300 bg-white p-2">
        <SignatureCanvas
          ref={padRef}
          onEnd={() =>
            setSignature(
              padRef.current?.getTrimmedCanvas().toDataURL("image/png") ?? null,
            )
          }
          canvasProps={{
            className: "h-40 w-full rounded-lg cursor-crosshair",
            height: 160,
          }}
          backgroundColor="white"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
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
        <button
          type="submit"
          disabled={!signature || pending}
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