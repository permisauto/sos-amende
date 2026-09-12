"use client";

import { useState } from "react";

/**
 * Téléversement de la preuve de virement, branché sur la page de paiement.
 * `paymentId` vient de la réponse de `/api/paiement/virement` (ou de
 * `payerParVirement` en espace client). Une fois la preuve envoyée, on
 * affiche l'état « preuve reçue » et le message de validation sous 24 h.
 */
export function PreuveVirementUpload({ paymentId }: { paymentId: string }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("paymentId", paymentId);
      form.append("fichier", file);
      const res = await fetch("/api/paiement/virement/preuve", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">✓ Preuve de virement reçue</p>
        <p className="mt-1">
          Merci. Votre preuve a bien été transmise. Un juriste vérifiera votre virement
          et validera le paiement sous 24 h ouvrées — vous serez notifié.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <p className="font-semibold text-emerald-900">Téléversez votre preuve de virement</p>
      <p className="mt-1 text-xs text-emerald-800">
        Capture de l'ordre de virement ou relevé (JPEG, PNG, WebP ou PDF — max. 8 Mo).
      </p>
      <label className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white px-4 py-3 text-center text-emerald-700 hover:border-emerald-500">
        <span>{uploading ? "Envoi en cours…" : "Choisir un fichier (preuve du virement)"}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}