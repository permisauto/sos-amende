"use client";

import { useActionState } from "react";
import { envoyerDossier } from "../actions";
import {
  delaiLibelle,
  destinataireLrar,
  pieceAJoindre,
  type InfractionType,
} from "@/lib/envoi";

export function LrKit({
  dossierId,
  dateLimite,
  pdfUrl,
  type,
}: {
  dossierId: string;
  dateLimite?: Date | null;
  pdfUrl?: string | null;
  type: InfractionType;
}) {
  const [state, formAction, pending] = useActionState(envoyerDossier, undefined);

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Kit d'envoi — lettre validée</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Prêt pour l&apos;envoi
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Votre lettre a été validée par un juriste. À vous de l&apos;envoyer :
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
        {pdfUrl && (
          <li>
            Téléchargez et imprimez la{" "}
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-700 hover:underline"
            >
              lettre de contestation (PDF)
            </a>
            .
          </li>
        )}
        <li>
          Joignez {pieceAJoindre(type)} et tout justificatif (certificat de
          cession, dépôt de plainte, etc.).
        </li>
        <li>
          Postez l&apos;ensemble en <strong>recommandé avec accusé de
          réception</strong> (LRAR) {destinataireLrar(type)}.
        </li>
        {dateLimite && (
          <li>
            Votre envoi doit être expédié avant le{" "}
            <strong>{dateLimite.toLocaleDateString("fr-FR")}</strong> (
            {delaiLibelle(type)}).
          </li>
        )}
        <li>Conservez le récépissé : il fait foi de la date d&apos;envoi.</li>
      </ol>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="dossierId" value={dossierId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "J'ai envoyé ma lettre"}
        </button>
        <p className="mt-2 text-xs text-zinc-500">
          Confirmez uniquement une fois le courrier réellement expédié.
        </p>
        {state?.error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}