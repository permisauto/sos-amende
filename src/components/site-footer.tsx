import Link from "next/link";

const legal = [
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: "/cgv", label: "CGV" },
  { href: "/remboursement", label: "Politique de remboursement" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité (RGPD)" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 md:flex-row">
        <div className="flex flex-col items-center gap-1 md:items-start">
          <p>© {new Date().getFullYear()} SOS Amende. Tous droits réservés.</p>
          <p className="text-xs">
            <a href="mailto:contact@recours-permis-pv.com" className="hover:text-zinc-900">
              contact@recours-permis-pv.com
            </a>{" "}
            · WhatsApp{" "}
            <a href="https://wa.me/34613885573" className="hover:text-zinc-900">
              +34 613 88 55 73
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-6">
          {legal.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/login"
          aria-label="Espace juriste / administrateur — connexion"
          title="Espace juriste / administrateur"
          className="text-zinc-300 hover:text-zinc-500 md:ml-auto"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </Link>
      </div>
    </footer>
  );
}
