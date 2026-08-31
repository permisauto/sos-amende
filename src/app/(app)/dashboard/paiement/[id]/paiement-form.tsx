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

  const [virementConfirme, setVirementConfirme] = useState(false);
  const RIB_IBAN = process.env.NEXT_PUBLIC_RIB_IBAN ?? "FR76 1234 5678 9012 3456 7890 123";
  const RIB_BIC = process.env.NEXT_PUBLIC_RIB_BIC ?? "ABCDFRPPXXX";
  const RIB_TITULAIRE = process.env.NEXT_PUBLIC_RIB_TITULAIRE ?? "SOS Amende";

  if (virementState?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h3 className="font-semibold text-emerald-900">Demande de virement enregistrée — voici le RIB à utiliser</h3>
        <p className="mt-2 text-sm text-emerald-800">
          Merci {prenom} — votre demande pour {type === "SUSPENSION" ? "59 €" : "39 €"} (réf. {dossierId.slice(0, 8).toUpperCase()}) est enregistrée. Copiez le RIB ci-dessous dans votre application bancaire :
        </p>
        <div className="mt-4 rounded-xl bg-white p-4 text-sm">
          <div className="flex items-center justify-between"><span className="font-semibold">IBAN</span><button type="button" onClick={() => navigator.clipboard.writeText(RIB_IBAN.replace(/\s/g, ""))} className="text-xs text-emerald-700 hover:underline">Copier</button></div>
          <p className="font-mono text-sm">{RIB_IBAN}</p>
          <div className="mt-2 flex items-center justify-between"><span className="font-semibold">BIC</span><button type="button" onClick={() => navigator.clipboard.writeText(RIB_BIC)} className="text-xs text-emerald-700 hover:underline">Copier</button></div>
          <p className="font-mono text-sm">{RIB_BIC}</p>
          <p className="mt-2"><span className="font-semibold">Titulaire :</span> {RIB_TITULAIRE}</p>
          <p className="mt-2"><span className="font-semibold">Montant :</span> {type === "SUSPENSION" ? "59,00 €" : "39,00 €"}</p>
          <p className="mt-2 font-mono text-sm bg-amber-50 px-2 py-1 rounded">Référence obligatoire : {dossierId.slice(0, 8).toUpperCase()} — {prenom} {nom}</p>
          <p className="mt-2 text-xs text-zinc-500">Vous recevrez le RIB définitif par email/WhatsApp si celui-ci change. Conservez la référence.</p>
        </div>
        {!virementConfirme ? (
          <button type="button" onClick={() => setVirementConfirme(true)} className="mt-4 w-full rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-black">
            J'ai effectué le virement
          </button>
        ) : (
          <div className="mt-4 rounded-xl bg-white p-4 text-sm text-emerald-800">
            <p className="font-semibold">✓ Merci — virement signalé</p>
            <p className="mt-1">Dès réception sur notre compte (sous 24h ouvrées), un juriste validera votre paiement, débloquera la lettre et vous notifiera par email/WhatsApp. Votre dossier passe en “En attente de validation virement”.</p>
          </div>
        )}
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
        <p className="mt-1 text-sm text-zinc-600">Seul mode proposé pour le moment — copiez le RIB ci-dessous dans votre banque.</p>
        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="font-semibold">IBAN</span><button type="button" onClick={() => navigator.clipboard.writeText(RIB_IBAN.replace(/\s/g, ""))} className="text-xs text-emerald-700 hover:underline">Copier</button></div>
          <p className="font-mono">{RIB_IBAN}</p>
          <p className="mt-1 flex items-center gap-2"><span className="font-semibold">BIC</span> {RIB_BIC} <button type="button" onClick={() => navigator.clipboard.writeText(RIB_BIC)} className="text-xs text-emerald-700 hover:underline">Copier</button></p>
          <p className="mt-1"><span className="font-semibold">Titulaire :</span> {RIB_TITULAIRE}</p>
          <p className="mt-1 font-mono bg-amber-50 px-1 rounded">Référence : {dossierId.slice(0, 8).toUpperCase()} — {prenom || "Prénom"} {nom || "Nom"}</p>
        </div>
        <p className="mt-3 text-2xl font-bold">{type === "SUSPENSION" ? "59 €" : "39 €"}</p>
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
