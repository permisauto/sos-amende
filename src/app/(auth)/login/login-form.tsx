"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import {
  loginWithEmail,
  recupererLienDev,
  type LoginState,
} from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginWithEmail,
    initialState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const emailRef = useRef("");

  useEffect(() => {
    // Après l'envoi du lien : en mode démo (sans AUTH_RESEND_KEY) on l'affiche
    // directement dans le navigateur ; sinon on confirme l'envoi par e-mail.
    if (!hasSubmitted || pending || state?.error || devUrl || devError || emailSent) {
      return;
    }

    let cancelled = false;
    (async () => {
      for (let i = 0; i < 5; i++) {
        const res = await recupererLienDev(emailRef.current);
        if (cancelled) return;
        if (!res.enDemo) {
          setEmailSent(true);
          return;
        }
        if (res.url) {
          setDevUrl(res.url);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) setDevError("Lien de connexion introuvable.");
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSubmitted, pending, state?.error, devUrl, devError, emailSent]);

  const showDevLink = hasSubmitted && !state?.error;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        emailRef.current = String(fd.get("email") ?? "");
        setHasSubmitted(true);
      }}
      className="mt-6 space-y-4"
    >
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@exemple.fr"
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Recevoir mon lien de connexion"}
      </button>

      {showDevLink && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm">
          {devUrl ? (
            <p className="text-emerald-800">
              Mode démo : aucun e-mail n&apos;est envoyé.{" "}
              <a
                href={devUrl}
                className="font-semibold text-emerald-700 underline"
              >
                Cliquez ici pour vous connecter
              </a>
              .
            </p>
          ) : emailSent ? (
            <p className="text-emerald-800">
              Un lien de connexion vous a été envoyé par e-mail. Vérifiez votre
              boîte mail.
            </p>
          ) : devError ? (
            <p className="text-red-700">{devError}</p>
          ) : (
            <p className="text-emerald-700">Génération du lien…</p>
          )}
        </div>
      )}

      <p className="text-center text-xs text-zinc-500">
        Un e-mail de connexion sécurisé vous sera envoyé. Aucun mot de passe à
        retenir.
      </p>
    </form>
  );
}