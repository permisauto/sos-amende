"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { envoyerMessage } from "@/app/(app)/dashboard/messages/actions";

export type MessageDto = {
  id: string;
  contenu: string;
  createdAt: Date;
  lu: boolean;
  auteurId: string;
  auteurNom: string;
  auteurRole: "CLIENT" | "JURISTE" | "ADMIN";
};

/**
 * Fil de messagerie juriste ↔ client sur un dossier (demande de complément
 * d'information ou de preuve, réponses du client). Le statut du dossier reste
 * inchangé ; chaque envoi notifie le destinataire (badge in-app + email).
 */
export function FilMessages({
  dossierId,
  messages,
  currentUserId,
  currentRole,
}: {
  dossierId: string;
  messages: MessageDto[];
  currentUserId: string;
  currentRole: "CLIENT" | "JURISTE" | "ADMIN";
}) {
  const [state, action, pending] = useActionState(envoyerMessage, undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  const lastName = messages[messages.length - 1]?.auteurId;
  const iAmLastAuthor = lastName === currentUserId;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  const isJuriste = currentRole === "JURISTE" || currentRole === "ADMIN";
  const interlocuteur = isJuriste ? "client" : "juriste";
  const label =
    currentRole === "ADMIN"
      ? `${interlocuteur} du dossier`
      : isJuriste
        ? "au client"
        : "au juriste";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Messages avec le {interlocuteur}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Pour demander ou fournir un complément d&apos;information / une
            preuve. Le dossier n&apos;est pas bloqué par cet échange.
          </p>
        </div>
        {messages.some((m) => m.auteurId !== currentUserId && !m.lu) && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Nouveau(x) message(s)
          </span>
        )}
      </div>

      {state?.ok && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Message envoyé — le {interlocuteur} a été notifié.
        </p>
      )}
      {state?.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div
        ref={scrollRef}
        className="mt-4 flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 p-4"
      >
        {messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500">
            Aucun message pour le moment. <br />
            {currentRole === "CLIENT"
              ? "Un juriste pourra vous demander des compléments ici."
              : "Envoyez au client votre demande de complément si nécessaire."}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.auteurId === currentUserId;
            return (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  mine
                    ? "self-end rounded-br-md bg-emerald-600 text-white"
                    : "self-start rounded-bl-md bg-white text-zinc-800"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    mine ? "text-emerald-100" : "text-zinc-500"
                  }`}
                >
                  {mine ? "Vous" : m.auteurRole === "JURISTE" ? "Juriste" : m.auteurRole === "ADMIN" ? "Administration" : m.auteurNom || "Client"}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{m.contenu}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    mine ? "text-emerald-100" : "text-zinc-400"
                  }`}
                >
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

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="dossierId" value={dossierId} />
        <textarea
          name="contenu"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
          rows={3}
          maxLength={4000}
          placeholder={`Écrire un message ${label}…`}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {draft.length > 0
              ? `${draft.length}/4000 caractères`
              : "Le destinataire est notifié par e-mail et dans son espace."}
          </p>
          <button
            type="submit"
            disabled={pending || draft.trim().length < 3}
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Envoi…" : `Envoyer au ${interlocuteur}`}
          </button>
        </div>
      </form>

      {!iAmLastAuthor && messages.length > 0 && (
        <p className="mt-3 rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
          {interlocuteur === "client"
            ? "Le client vous a répondu — relancez l'échange si besoin."
            : "Un juriste vous a écrit — vous pouvez répondre ci-dessous."}
        </p>
      )}
    </div>
  );
}