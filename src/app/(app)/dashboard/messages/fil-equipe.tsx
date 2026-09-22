"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { envoyerMessageInterne } from "./actions";

export type MessageEquipeDto = {
  id: string;
  contenu: string;
  createdAt: Date;
  lu: boolean;
  expediteurId: string;
  expediteurNom: string;
  expediteurRole: "JURISTE" | "ADMIN";
};

/**
 * Fil d'équipe admin ↔ juristes, ancré sur un dossier. Chaque message est
 * visible et répondable par tout membre (JURISTE ou ADMIN), sans destinataire
 * précis ; le client ne voit jamais ces échanges.
 */
export function FilEquipe({
  dossierId,
  messages,
  currentUserId,
}: {
  dossierId: string;
  messages: MessageEquipeDto[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(
    envoyerMessageInterne,
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  const nouveaux = messages.filter(
    (m) => m.expediteurId !== currentUserId && !m.lu,
  ).length;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Échanges internes (équipe)</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Coordination entre l&apos;administration et les juristes sur ce
            dossier. Le client ne voit pas ces échanges.
          </p>
        </div>
        {nouveaux > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {nouveaux > 1 ? `${nouveaux} nouveaux` : "Nouveau"}
          </span>
        )}
      </div>

      {state?.ok && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Message envoyé à l&apos;équipe.
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
            Aucun échange interne pour le moment.
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
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    mine ? "text-emerald-100" : "text-zinc-500"
                  }`}
                >
                  {mine
                    ? "Vous"
                    : m.expediteurRole === "ADMIN"
                      ? "Administration"
                      : m.expediteurNom || "Juriste"}
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
          placeholder="Message à l'équipe…"
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
            {pending ? "Envoi…" : "Envoyer à l'équipe"}
          </button>
        </div>
      </form>
    </div>
  );
}