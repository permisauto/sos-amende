import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { signOutAction } from "./actions";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await getCurrentUser();

  // Comptes clients : la création d'un mot de passe est obligatoire après la
  // première connexion par lien. Tant que le compte n'a pas de mot de passe,
  // on ramène sur /login/mot-de-passe (ne concerne pas les juristes/admins,
  // provisionnés avec un mot de passe par l'admin).
  if (user) {
    const dbUser = user
      ? await prisma.user
          .findUnique({ where: { id: user.id }, select: { passwordHash: true } })
          .catch(() => null)
      : null;
    if (dbUser && !dbUser.passwordHash) {
      redirect("/login/mot-de-passe");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                S
              </span>
              <span>SOS Amende</span>
            </Link>
            <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-600 md:flex">
              <Link href="/dashboard" className="hover:text-zinc-900">
                Vue d'ensemble
              </Link>
              {user?.role === "CLIENT" && (
                <Link href="/dashboard/cases" className="hover:text-zinc-900">
                  Mes dossiers
                </Link>
              )}
              <Link href="/dashboard/parametres" className="hover:text-zinc-900">
                Paramètres
              </Link>
              {(user?.role === "JURISTE" || user?.role === "ADMIN") && (
                <>
                  <Link
                    href="/dashboard/juriste/failles"
                    className="hover:text-zinc-900"
                  >
                    Bibliothèque juridique
                  </Link>
                </>
              )}
              {user?.role === "ADMIN" && (
                <>
                  <Link
                    href="/dashboard/admin/dossiers"
                    className="hover:text-zinc-900"
                  >
                    Suivi des dossiers
                  </Link>
                  <Link
                    href="/dashboard/admin/lettres"
                    className="hover:text-zinc-900"
                  >
                    Lettres vérifiées
                  </Link>
                  <Link
                    href="/dashboard/admin/radars"
                    className="hover:text-zinc-900"
                  >
                    Radars
                  </Link>
                  <Link href="/dashboard/admin/paiements" className="hover:text-zinc-900">
                    Paiements
                  </Link>
                  <Link href="/dashboard/admin/comptes" className="hover:text-zinc-900">
                    Comptes
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-zinc-500 sm:block">
              {user?.name ?? user?.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
