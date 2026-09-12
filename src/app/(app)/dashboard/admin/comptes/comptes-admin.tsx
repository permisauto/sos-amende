"use client";

import { useActionState } from "react";
import { creerCompteJuriste } from "./actions";

type Compte = { id: string; email: string; name: string | null; role: string; createdAt: Date };

export function ComptesAdmin({ comptes }: { comptes: Compte[] }) {
  const [state, action, pending] = useActionState(creerCompteJuriste, undefined);

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold">Créer un compte juriste</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Le juriste recevra un e-mail de bienvenue avec le lien de connexion sécurisé
          (magic-link). Aucun mot de passe à transmettre.
        </p>
        <form action={action} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom du juriste *</span>
            <input name="nom" required placeholder="Ex. Marie Dupont" className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail *</span>
            <input name="email" type="email" required placeholder="juriste@domaine.fr" className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
          <button disabled={pending} className="self-end rounded-full bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? "Création…" : "Créer le compte"}
          </button>
        </form>
        {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="mt-3 text-sm text-emerald-700">Compte juriste créé — e-mail de bienvenue envoyé.</p>}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold">Comptes juristes et administrateurs</h2>
        {comptes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Aucun compte interne pour le moment.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {comptes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{c.name ?? c.email}</p>
                  <p className="text-sm text-zinc-500">{c.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.role === "ADMIN" ? "bg-zinc-900 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                    {c.role === "ADMIN" ? "Admin" : "Juriste"}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(c.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}