"use client";

import { useActionState, useState } from "react";
import { envoyerMessage } from "@/app/(app)/dashboard/messages/actions";
import { libellePreuve } from "@/lib/preuve-labels";

type Manquante = { type: string; raison: string };

/**
 * Bloc « Pièces manquantes » côté juriste : les réponses du client qui
 * appellent une pièce non encore téléversée, avec une demande de complément
 * en un clic (messagerie du dossier + e-mail au client via `envoyerMessage`).
 * Jamais bloquant : le dossier avance sans la pièce, on la relance en douceur.
 */
export function PiecesManquantes({
  dossierId,
  numPv,
  pieces,
}: {
  dossierId: string;
  numPv?: string | null;
  pieces: Manquante[];
}) {
  const [state, action, pending] = useActionState(envoyerMessage, undefined);
  const [open, setOpen] = useState(false);

  const libelles = pieces.map((p) => libellePreuve(p.type)).join(", ");
  const modele =
    `Bonjour,\n` +
    `Pour compléter votre dossier${numPv ? ` n° ${numPv}` : ""}, merci de joindre dans l'espace « Pièces justificatives » : ${libelles}.\n` +
    (pieces[0] ? `Cette pièce suit votre réponse : « ${pieces[0].raison} ».\n` : "") +
    `Vous pouvez signer et déposer votre contestation sans elle : elle renforce simplement le dossier.\nMerci !`;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-amber-900">
            Pièces manquantes
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Réponses du client qui appellent une pièce non encore versée. Le
            dossier n&apos;est pas bloqué : relance en douceur.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          {open ? "Fermer" : "Demander au client"}
        </button>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {pieces.map((p) => (
          <li
            key={p.type}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-800">
                Manquante : {libellePreuve(p.type)}
              </p>
              <p className="text-xs text-zinc-600">
                Réponse cochée : « {p.raison} »
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              En attente du client
            </span>
          </li>
        ))}
      </ul>

      {state?.ok && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-emerald-800">
          Demande envoyée — le client est notifié par e-mail et dans son
          espace.
        </p>
      )}
      {state?.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {open && (
        <form
          action={action}
          className="mt-4 flex flex-col gap-3 border-t border-amber-200 pt-4"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <textarea
            name="contenu"
            aria-label="Demande de pièce au client"
            defaultValue={modele}
            required
            rows={6}
            maxLength={4000}
            className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-amber-800">
              Message modifiable — envoyé dans la messagerie du dossier et par
              e-mail au client.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Envoi…" : "Envoyer la demande"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
