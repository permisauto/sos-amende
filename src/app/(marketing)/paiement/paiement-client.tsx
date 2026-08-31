"use client";

import { useState, useEffect } from "react";

export function PaiementPublicClient({ initialType }: { initialType: "AMENDE" | "SUSPENSION" }) {
  const [type, setType] = useState(initialType);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pending, setPending] = useState<"stripe" | "virement" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("deposer_data");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { type?: string };
        if (parsed.type === "SUSPENSION" || parsed.type === "AMENDE") setType(parsed.type);
      } catch {}
    }
  }, []);

  const RIB_IBAN = process.env.NEXT_PUBLIC_RIB_IBAN ?? "FR76 1234 5678 9012 3456 7890 123";
  const RIB_BIC = process.env.NEXT_PUBLIC_RIB_BIC ?? "ABCDFRPPXXX";
  const RIB_TITULAIRE = process.env.NEXT_PUBLIC_RIB_TITULAIRE ?? "SOS Amende";
  const [virementDone, setVirementDone] = useState(false);

  async function handleVirement() {
    if (!nom || !prenom || !email || !whatsapp) return setMessage("Nom, prénom, email et WhatsApp requis.");
    setPending("virement");
    setMessage(null);
    try {
      const res = await fetch("/api/paiement/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, nom, prenom, email, whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setMessage(`Virement enregistré — Réf ${data.ref ?? ""}. Copiez le RIB ci-dessous et effectuez le virement.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPending(null);
    }
  }

  async function handleStripe() {
    if (!nom || !prenom || !email || !whatsapp) return setMessage("Nom, prénom, email et WhatsApp requis.");
    setPending("stripe");
    setMessage(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, contact: { nom, prenom, email, whatsapp } }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Paiement indisponible");
      window.location.href = data.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
      setPending(null);
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
            <option value="AMENDE">Amende — 39 €</option>
            <option value="SUSPENSION">Suspension — 59 €</option>
          </select>
        </label>
      </div>

      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}

      <div className="rounded-2xl border-2 border-emerald-600 bg-white p-6">
        <p className="font-semibold text-emerald-700">Payer par virement bancaire</p>
        <p className="mt-1 text-sm text-zinc-600">Copiez le RIB ci-dessous dans votre banque — virement unique.</p>
        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="font-semibold">IBAN</span><button type="button" onClick={() => navigator.clipboard.writeText(RIB_IBAN.replace(/\s/g, ""))} className="text-xs text-emerald-700 hover:underline">Copier</button></div>
          <p className="font-mono">{RIB_IBAN}</p>
          <p className="mt-1 flex items-center gap-2"><span className="font-semibold">BIC</span> {RIB_BIC} <button type="button" onClick={() => navigator.clipboard.writeText(RIB_BIC)} className="text-xs text-emerald-700 hover:underline">Copier</button></p>
          <p className="mt-1"><span className="font-semibold">Titulaire :</span> {RIB_TITULAIRE}</p>
          <p className="mt-2 font-mono bg-amber-50 px-2 py-1 rounded text-xs">Référence : {prenom || "Prénom"} {nom || "Nom"} — {email || "email"}</p>
          <p className="mt-1 text-xs text-zinc-500">Montant : {type === "SUSPENSION" ? "59,00 €" : "39,00 €"}</p>
        </div>
        <p className="mt-3 text-2xl font-bold">{type === "SUSPENSION" ? "59 €" : "39 €"}</p>
        <button onClick={handleVirement} disabled={pending !== null} className="mt-4 w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending === "virement" ? "Enregistrement…" : "Valider et recevoir le RIB"}
        </button>
        {message && !virementDone && (
          <button type="button" onClick={() => setVirementDone(true)} className="mt-3 w-full rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-black">
            J'ai effectué le virement
          </button>
        )}
        {virementDone && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Merci — virement signalé. Dès réception (24h ouvrées), un juriste validera et débloquera votre dossier. Vous serez notifié par email/WhatsApp.</p>
        )}
        <p className="mt-3 text-center text-xs text-zinc-400">Paiement par carte (Stripe) — bientôt disponible.</p>
      </div>
    </div>
  );
}
