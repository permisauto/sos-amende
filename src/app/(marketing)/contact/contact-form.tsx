"use client";

import { useState } from "react";
import { SUJETS_CONTACT } from "@/lib/contact-form";

type ContactState =
  | { type: "idle" }
  | { type: "success" }
  | { type: "error"; message: string };

const inputCls =
  "rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ContactState>({ type: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setState({ type: "idle" });
    try {
      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.error) {
        setState({
          type: "error",
          message: data.error ?? "Une erreur est survenue. Réessayez.",
        });
      } else {
        setState({ type: "success" });
        (e.currentTarget as HTMLFormElement).reset();
      }
    } catch {
      setState({
        type: "error",
        message: "Une erreur est survenue. Veuillez réessayer.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {state.type === "success" && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Merci, votre message a bien été envoyé. Un accusé de réception vous a
          été envoyé par email.
        </p>
      )}
      {state.type === "error" && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom *</span>
            <input
              name="nom"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email *</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className={inputCls}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Sujet *</span>
          <select name="sujet" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Choisir un sujet…
            </option>
            {SUJETS_CONTACT.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Numéro de dossier (facultatif)</span>
          <input name="dossier" maxLength={40} className={inputCls} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Message *</span>
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={3000}
            rows={5}
            className={inputCls}
          />
        </label>

        {/* Piège anti-robot : invisible, non focalisable, sans autocomplétion */}
        <div className="hidden" aria-hidden="true">
          <input
            type="text"
            name="site"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Envoi…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
