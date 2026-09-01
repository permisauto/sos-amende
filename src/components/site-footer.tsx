import Link from "next/link";

const legal = [
  { href: "/cgv", label: "CGV" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité (RGPD)" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 md:flex-row">
        <p>© {new Date().getFullYear()} SOS Amende. Tous droits réservés.</p>
        <nav className="flex flex-wrap items-center justify-center gap-6">
          {legal.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/login" aria-label="Accès juriste et administrateur — réservé" className="text-[10px] tracking-widest text-zinc-300 hover:text-zinc-500 md:ml-auto">
          Accès juriste / admin ·
        </Link>
      </div>
    </footer>
  );
}
