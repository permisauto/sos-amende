"use client";

import Link from "next/link";

/**
 * Erreur inattendue (500). Page française, retry + retour à l'accueil.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold text-zinc-900">
        Une erreur est survenue
      </h1>
      <p className="max-w-md text-sm text-zinc-600">
        Un problème inattendu s&apos;est produit. Vous pouvez réessayer, ou
        revenir à l&apos;accueil.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}