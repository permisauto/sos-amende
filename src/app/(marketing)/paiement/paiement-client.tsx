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
      setMessage(`Virement enregistré — RIB : FR76 1234 5678 9012 3456 7890 123 / Réf ${data.ref ?? ""}. Validation sous 24h.`);
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

      <div className="grid gap-4 md:grid-cols-2">
        <button onClick={handleStripe} disabled={pending !== null} className="rounded-2xl border-2 border-emerald-600 bg-white p-6 text-left hover:bg-emerald-50 disabled:opacity-50">
          <p className="font-semibold text-emerald-700">Payer par carte (Stripe)</p>
          <p className="mt-1 text-sm text-zinc-600">Sécurisé, instantané.</p>
          <p className="mt-3 text-2xl font-bold">{type === "SUSPENSION" ? "59 €" : "39 €"}</p>
          <span className="mt-4 inline-block rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white">{pending === "stripe" ? "Redirection…" : "Payer par carte"}</span>
        </button>
        <button onClick={handleVirement} disabled={pending !== null} className="rounded-2xl border-2 border-zinc-300 bg-white p-6 text-left hover:bg-zinc-50 disabled:opacity-50">
          <p className="font-semibold">Payer par virement</p>
          <p className="mt-1 text-sm text-zinc-600">RIB affiché après, validation 24h.</p>
          <p className="mt-3 text-2xl font-bold">{type === "SUSPENSION" ? "59 €" : "39 €"}</p>
          <span className="mt-4 inline-block rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-700">{pending === "virement" ? "Enregistrement…" : "Choisir virement"}</span>
        </button>
      </div>
    </div>
  );
}
