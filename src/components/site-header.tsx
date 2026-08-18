import Link from "next/link";

const nav = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#amendes", label: "Amendes" },
  { href: "/#permis", label: "Permis" },
  { href: "/pricing", label: "Tarifs" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
            S
          </span>
          <span>SOS Amende</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
          >
            Connexion
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Commencer
          </Link>
        </div>
      </div>
    </header>
  );
}
