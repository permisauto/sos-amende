import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { signOutAction } from "./actions";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await getCurrentUser();

  // Badge « messages non lus » pour les échanges internes admin ↔ juriste.
  let messagesNonLus = 0;
  if (user && (user.role === "JURISTE" || user.role === "ADMIN")) {
    try {
      messagesNonLus = await prisma.messageInterne.count({
        where: { destinataireId: user.id, lu: false },
      });
    } catch (e) {
      console.error("messages: DB indisponible", e);
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
                    href="/dashboard/messages"
                    className="flex items-center gap-1.5 hover:text-zinc-900"
                  >
                    Messages
                    {messagesNonLus > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        {messagesNonLus}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/dashboard/juriste/lettres"
                    className="hover:text-zinc-900"
                  >
                    Bibliothèque des lettres générées
                  </Link>
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
