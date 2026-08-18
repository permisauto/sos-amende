import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { CompteSupprimeBanner } from "./compte-supprime-banner";

export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Connexion</h1>
      <Suspense fallback={null}>
        <CompteSupprimeBanner />
      </Suspense>
      <p className="mt-2 text-sm text-zinc-600">
        Accédez à votre espace pour contester vos amendes et suivre vos
        dossiers.
      </p>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/pricing" className="hover:text-zinc-900">
          Voir les tarifs
        </Link>{" "}
        ·{" "}
        <Link href="/" className="hover:text-zinc-900">
          Retour à l'accueil
        </Link>
      </p>
    </div>
  );
}
