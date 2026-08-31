"use client";

import { useActionState, useState } from "react";
import { payerParVirement } from "./actions";

export function PaiementForm({
  dossierId,
  type,
  defaultEmail,
  defaultName,
}: {
  dossierId: string;
  type: "AMENDE" | "SUSPENSION";
  defaultEmail: string;
  defaultName: string;
}) {
  const [virementState, virementAction, virementPending] = useActionState(payerParVirement, undefined);
  const [stripePending, setStripePending] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const [nom, setNom] = useState(defaultName.split(" ").slice(1).join(" ") || "");
  const [prenom, setPrenom] = useState(defaultName.split(" ")[0] || "");
  const [email, setEmail] = useState(defaultEmail);
  const [whatsapp, setWhatsapp] = useState("");

  async function handleStripe() {
    if (!nom || !prenom || !email || !whatsapp) {
      setStripeError("Renseigne nom, prénom, email et WhatsApp avant de payer.");
      return;
    }
    setStripePending(true);
    setStripeError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, dossierId, contact: { nom, prenom, email, whatsapp } }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Paiement indisponible");
      window.location.href = data.url;
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : "Erreur");
      setStripePending(false);
    }
  }

  if (virementState?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h3 className="font-semibold text-emerald-900">Demande de virement enregistrée</h3>
        <p className="mt-2 text-sm text-emerald-800">
          Merci {prenom} — nous avons bien reçu votre demande pour {type === "SUSPENSION" ? "59 €" : "39 €"} (réf. {dossierId.slice(0, 8).toUpperCase()}).
        </p>
        <div className="mt-4 rounded-xl bg-white p-4 text-sm">
          <p className="font-semibold">RIB à venir — vous recevrez le RIB définitif par email/WhatsApp sous 24h.</p>
          <p className="mt-2 font-mono text-sm">Référence à indiquer : {dossierId.slice(0, 8).toUpperCase()} — {prenom} {nom}</p>
          <p className="mt-2 text-xs text-zinc-500">En attendant votre RIB définitif, votre dossier reste en attente. Dès réception du virement, un juriste débloquera la lettre et vous serez notifié.</p>
        </div>
        <p className="mt-3 text-xs text-emerald-700">Un juriste validera votre paiement et débloquera la lettre (sous 24h ouvrées). Vous serez notifié par email/WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="font-semibold">Vos coordonnées</h3>
        <p className="mt-1 text-xs text-zinc-500">Requises pour la facture et le suivi WhatsApp.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prénom *</span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom *</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} required className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">WhatsApp *</span>
            <input type="tel" placeholder="+33 6 12 34 56 78" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-emerald-600 bg-white p-6">
        <h4 className="font-semibold text-emerald-700">Payer par virement bancaire</h4>
        <p className="mt-1 text-sm text-zinc-600">Seul mode proposé pour le moment — RIB définitif à venir (vous le recevrez par email/WhatsApp). Validation sous 24h ouvrées.</p>
        <p className="mt-3 text-2xl font-bold">{type === "SUSPENSION" ? "59 €" : "39 €"}</p>
        <p className="mt-2 text-xs text-zinc-500">Vous recevrez le RIB définitif dès que vous aurez fourni votre RIB — en attendant, votre demande est enregistrée.</p>
        <form action={virementAction} className="mt-4">
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="nom" value={nom} />
          <input type="hidden" name="prenom" value={prenom} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="whatsapp" value={whatsapp} />
          <button disabled={virementPending} className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {virementPending ? "Enregistrement…" : "Valider et recevoir le RIB"}
          </button>
          {virementState?.error && <p className="mt-2 text-xs text-red-600">{virementState.error}</p>}
        </form>
        <p className="mt-3 text-center text-xs text-zinc-400">Paiement par carte (Stripe) — bientôt disponible.</p>
      </div>
    </div>
  );
}
