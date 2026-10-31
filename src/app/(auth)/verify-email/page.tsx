import { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyEmailToken } from "@/auth";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vérification d'email - SOS Amende",
};

interface Props {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token, email } = await searchParams;

  if (!token || !email) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-2xl font-bold text-red-600">Lien de vérification invalide</h1>
        <p className="mt-4 text-zinc-600">
          Ce lien de vérification est incomplet ou expiré.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  const isValid = await verifyEmailToken(email, token);

  if (!isValid) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-2xl font-bold text-red-600">Jeton invalide ou expiré</h1>
        <p className="mt-4 text-zinc-600">
          Ce lien de vérification a déjà été utilisé ou a expiré (valide 24h).
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  redirect("/login?verified=1");
}