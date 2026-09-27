import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { MotDePasseForm } from "./mot-de-passe-form";

export const metadata: Metadata = { title: "Créer mon mot de passe — SOS Amende" };

export default async function MotDePassePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  // Compte déjà associé à un mot de passe : rien à faire ici.
  // Le principal mode est la création obligatoire (1ʳᵉ connexion). Le mode
  // « redefinir » arrive par le lien « Mot de passe oublié ? » (magic-link)
  // et autorise la réinitialisation d'un mot de passe existant.
  if (dbUser?.passwordHash && sp.mode !== "redefinir") {
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">
        {dbUser?.passwordHash ? "Réinitialiser mon mot de passe" : "Créez votre mot de passe"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        {dbUser?.passwordHash
          ? "Choisissez un nouveau mot de passe pour vous connecter à votre espace."
          : "Votre compte est maintenant actif. Choisissez un mot de passe pour vous reconnecter à tout moment, sans recevoir de nouveau lien par e-mail."}
      </p>
      <MotDePasseForm mode={sp.mode === "redefinir" ? "redefinir" : "creer"} />
    </div>
  );
}