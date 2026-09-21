"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { envoyerMessageInterne } from "./actions";

export type MessageInterneDto = {
  id: string;
  contenu: string;
  createdAt: Date;
  lu: boolean;
  expediteurId: string;
};

/**
 * Fil de messagerie interne (admin ↔ juriste), hors dossier. Bidirectionnel :
 * chacun peut écrire et répondre dans le même fil.
 */
export function FilInterne({
  destinataireId,
  destinataireNom,
  messages,
  currentUserId,
}: {
  destinataireId: string;
  destinataireNom: string;
  messages: MessageInterneDto[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(
    envoyerMessageInterne,
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h2 className="text-lg font-semibold">
          Discussion avec {destinataireNom}
        </h2>
        <p className="mt-0.5 text-sm text-zinc-600">
          Échanges internes : coordination, questions sur un dossier, consignes.
        </p>
      </div>

      {state?.ok && (
        <p className="mx-6 mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Message envoyé.
        </p>
      )}
      {state?.error && (
        <p className="mx-6 mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div
        ref={scrollRef}
        className="mx-6 my-4 flex max-h-[26rem] flex-col gap-3 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 p-4"
      >
        {messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500">
            Aucun message pour le moment. Écrivez le premier message ci-dessous.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.expediteurId === currentUserId;
            return (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  mine
                    ? "self-end rounded-br-md bg-emerald-600 text-white"
                    : "self-start rounded-bl-md bg-white text-zinc-800"
                }`}
              >
                <p className="mt-0.5 whitespace-pre-wrap">{m.contenu}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-emerald-100" : "text-zinc-400"}`}>
                  {m.createdAt.toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form action={action} className="flex flex-col gap-3 px-6 pb-6">
        <input type="hidden" name="destinataireId" value={destinataireId} />
        <textarea
          name="contenu"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
          rows={3}
          maxLength={4000}
          placeholder={`Écrire à ${destinataireNom}…`}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {draft.length > 0
              ? `${draft.length}/4000 caractères`
              : "Réservé à l'équipe (admin & juristes)."}
          </p>
          <button
            type="submit"
            disabled={pending || draft.trim().length < 3}
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}