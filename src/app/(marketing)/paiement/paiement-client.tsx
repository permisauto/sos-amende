"use client";

import { useState } from "react";
import { PreuveVirementUpload } from "@/components/preuve-virement-upload";
import { libelleMontant, libelleMontantCentimes, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { RIB } from "@/lib/rib";

export function PaiementPublicClient({ initialType }: { initialType: "AMENDE" | "SUSPENSION" }) {
  const [type, setType] = useState<"AMENDE" | "SUSPENSION">(() => {
    try {
      const raw = sessionStorage.getItem("deposer_data");
      if (raw) {
        const parsed = JSON.parse(raw) as { type?: string };
        if (parsed.type === "SUSPENSION" || parsed.type === "AMENDE") return parsed.type;
      }
    } catch {}
    return initialType;
  });
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [optionLrar, setOptionLrar] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const RIB_IBAN = RIB.iban;
  const RIB_BIC = RIB.bic;
  const RIB_TITULAIRE = RIB.titulaire;
  const [virementDone, setVirementDone] = useState(false);

  async function handleVirement() {
    if (!nom || !prenom || !email || !whatsapp) return setMessage("Nom, prénom, email et WhatsApp requis.");
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/paiement/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, nom, prenom, email, whatsapp, optionLrar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setPaymentId(data.paymentId ?? null);
      setMessage(`Virement enregistré — Réf ${data.ref ?? ""}. Copiez le RIB ci-dessous et effectuez le virement.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Prénom *</span><input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Nom *</span><input value={nom} onChange={(e) => setNom(e.target.value)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Email *</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">WhatsApp *</span><input type="tel" placeholder="+33 6 12 34 56 78" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" /></label>
        </div>
        <label className="mt-4 flex flex-col gap-1"><span className="text-sm font-medium">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as never)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm">
            <option value="AMENDE">Amende — {libelleMontant("AMENDE", false)}</option>
            <option value="SUSPENSION">Suspension — {libelleMontant("SUSPENSION", false)}</option>
          </select>
        </label>
      </div>

      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}

      <div className="rounded-2xl border-2 border-emerald-600 bg-white p-6">
        <p className="font-semibold text-emerald-700">Payer par virement bancaire</p>
        <p className="mt-1 text-sm text-zinc-600">Copiez le RIB ci-dessous dans votre banque — virement unique.</p>
        {RIB.placeholder && (
          <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            RIB provisoire de démonstration — à remplacer par les coordonnées bancaires définitives avant mise en production.
          </p>
        )}
        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="font-semibold">IBAN</span><button type="button" onClick={() => navigator.clipboard.writeText(RIB_IBAN.replace(/\s/g, ""))} className="text-xs text-emerald-700 hover:underline">Copier</button></div>
          <p className="font-mono">{RIB_IBAN}</p>
          <p className="mt-1 flex items-center gap-2"><span className="font-semibold">BIC</span> {RIB_BIC} <button type="button" onClick={() => navigator.clipboard.writeText(RIB_BIC)} className="text-xs text-emerald-700 hover:underline">Copier</button></p>
          <p className="mt-1"><span className="font-semibold">Titulaire :</span> {RIB_TITULAIRE}</p>
          <p className="mt-2 font-mono bg-amber-50 px-2 py-1 rounded text-xs">Référence : {prenom || "Prénom"} {nom || "Nom"} — {email || "email"}</p>
          <p className="mt-1 text-xs text-zinc-500">Montant : {libelleMontantCentimes(type, optionLrar)}{optionLrar ? " — option lettre recommandée incluse" : ""}</p>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <input type="checkbox" checked={optionLrar} onChange={(e) => setOptionLrar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600" />
          <span className="text-sm">
            <span className="font-semibold text-emerald-800">Option « lettre recommandée » (+{PRIX_OPTION_LRAR} €)</span>
            <span className="mt-0.5 block text-xs text-emerald-700">SOS Amende envoie votre contestation en recommandé avec accusé de réception. Sans cette option, l'envoi se fait en ligne sur le portail officiel.</span>
          </span>
        </label>
        <p className="mt-3 text-2xl font-bold">{libelleMontant(type, optionLrar)}</p>
        <button onClick={handleVirement} disabled={pending} className="mt-4 w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? "Enregistrement…" : `Valider et recevoir le RIB (${libelleMontant(type, optionLrar)})`}
        </button>
        {message && !virementDone && (
          <button type="button" onClick={() => setVirementDone(true)} className="mt-3 w-full rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-black">
            J'ai effectué le virement
          </button>
        )}
        {virementDone && (
          <>
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Merci — virement signalé. Téléversez ci-dessous la preuve de votre virement. Dès réception, un juriste validera et débloquera votre dossier. Vous serez notifié par email.</p>
            {paymentId ? (
              <PreuveVirementUpload paymentId={paymentId} />
            ) : (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Preuve non disponible : retrouvez-la dans votre espace dès votre première connexion.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
