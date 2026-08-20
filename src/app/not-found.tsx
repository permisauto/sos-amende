import Link from "next/link";

/**
 * Page 404 (not-found). Retour à l'accueil.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
        Erreur 404
      </p>
      <h1 className="text-3xl font-bold text-zinc-900">
        Page introuvable
      </h1>
      <p className="max-w-md text-sm text-zinc-600">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}