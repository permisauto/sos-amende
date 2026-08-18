import Link from "next/link";

export default function VerificationPage() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-bold">Vérifiez votre boîte mail</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Un lien de connexion vous a été envoyé. Il est valable 24 heures.
        Pensez à vérifier vos courriers indésirables.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        Renvoyer un lien
      </Link>
    </div>
  );
}
