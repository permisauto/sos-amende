"use client";

import { useState } from "react";

const ACCES = [
  { role: "JURISTE", label: "Juriste", email: "e2e-juriste@test.local", desc: "File d'attente, validation, kit LRAR", href: "/dashboard/juriste?dev=1" },
  { role: "ADMIN", label: "Admin", email: "e2e-admin@test.local", desc: "Base juridique, radars", href: "/dashboard/admin/failles?dev=1" },
  { role: "CLIENT", label: "Client (test)", email: "e2e-client@test.local", desc: "Dépôt, scoring, paiement", href: "/dashboard?dev=1" },
] as const;

export function AccesProClient() {
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleAccess(email: string, dashboard: string) {
    setLoading(email);
    setMsg(null);
    try {
      // Pose le cookie dev_login via l'API (même si DB down, elle pose le cookie en fallback)
      await fetch(`/api/dev/login?email=${encodeURIComponent(email)}`, { headers: { Accept: "application/json" } });
      // Redirige avec ?dev=1 qui bypass l'auth côté proxy/dal même sans DB
      window.location.href = `${dashboard}?dev=1`;
    } catch {
      setMsg("Erreur — réessayez ou utilisez l'accès direct ci-dessous.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {ACCES.map((a) => (
        <button
          key={a.email}
          onClick={() => handleAccess(a.email, a.href.split("?")[0])}
          disabled={!!loading}
          className="rounded-2xl border border-zinc-200 bg-white p-5 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
        >
          <p className="font-semibold">{a.label} <span className="text-xs font-normal text-zinc-500">— {a.email}</span></p>
          <p className="mt-1 text-sm text-zinc-600">{a.desc}</p>
          <p className="mt-3 text-xs font-semibold text-emerald-700">{loading === a.email ? "Connexion…" : "→ Accéder"}</p>
        </button>
      ))}
      {msg && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{msg}</p>}
      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
        <p className="font-semibold">Accès direct sans email :</p>
        <ul className="mt-1 list-disc pl-4">
          <li><a href="/dashboard?dev=1" className="text-emerald-700 hover:underline">Client — /dashboard?dev=1</a></li>
          <li><a href="/dashboard/juriste?dev=1" className="text-emerald-700 hover:underline">Juriste — /dashboard/juriste?dev=1</a></li>
          <li><a href="/dashboard/admin/failles?dev=1" className="text-emerald-700 hover:underline">Admin — /dashboard/admin/failles?dev=1</a></li>
        </ul>
      </div>
    </div>
  );
}
