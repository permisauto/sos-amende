"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import {
  loginWithPassword,
  loginWithEmail,
  recupererLienDev,
  type LoginState,
  type LoginPasswordState,
} from "./actions";

const initialState: LoginState = {};
const passwordInitialState: LoginPasswordState = {};

export function LoginForm() {
  // Deux modes de connexion sur la même page :
  //  - « Se connecter » → credentials (juristes/administrateurs, mot de passe) ;
  //  - « Recevoir mon lien de connexion » → magic-link (clients).
  const [passwordState, passwordFormAction, passwordPending] = useActionState(
    loginWithPassword,
    passwordInitialState,
  );
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
    // Après l'envoi du magic-link : en mode démo (sans AUTH_RESEND_KEY) on
    // l'affiche directement dans le navigateur ; sinon on confirme l'envoi.
    // On ne déclenche ce polling QUE pour le magic-link (jamais pour le mot
    // de passe, qui redirige côté serveur en cas de succès).
    if (
      !hasSubmitted ||
      pending ||
      state?.error ||
      devUrl ||
      devError ||
      emailSent
    ) {
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
        const submitter = (e.nativeEvent as SubmitEvent).submitter as
          | HTMLButtonElement
          | HTMLInputElement
          | null;
        const isPassword = submitter?.name === "password";
        // Le polling du magic-link ne s'active que pour le bouton dédié.
        if (!isPassword) {
          setHasSubmitted(true);
        }
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

      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Votre mot de passe"
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        {passwordState?.error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {passwordState.error}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-zinc-500">
        Comptes internes (juristes &amp; administrateurs) : connectez-vous avec
        votre e-mail et votre mot de passe. Les clients reçoivent un lien
        sécurisé par e-mail.
      </p>

      <button
        type="submit"
        name="password"
        formAction={passwordFormAction}
        disabled={passwordPending}
        className="w-full rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {passwordPending ? "Connexion…" : "Se connecter"}
      </button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-zinc-400">ou</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Recevoir mon lien de connexion"}
      </button>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

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
    </form>
  );
}
