"use client";

import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#amendes", label: "Amendes" },
  { href: "/#permis", label: "Permis" },
  { href: "/pricing", label: "Tarifs" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold" aria-label="SOS Amende - Accueil">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white" aria-hidden>
            S
          </span>
          <span>SOS Amende</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 md:flex" aria-label="Navigation principale">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-1 py-1 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-medium text-zinc-700 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 md:inline">
            Connexion
          </Link>
          <Link href="/login" className="hidden rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 focus-visible:outline-offset-2 md:inline">
            Commencer
          </Link>
          <button
            type="button"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 md:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Navigation mobile" className="border-t border-zinc-200 bg-white px-6 py-4 md:hidden">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-2 border-t border-zinc-100 pt-3">
              <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                Connexion
              </Link>
              <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700">
                Commencer
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
