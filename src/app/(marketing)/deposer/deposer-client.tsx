"use client";

import { useState } from "react";
import Link from "next/link";

type Resultat = { titreFaille: string | null; articleLoi: string | null; score: number; proposition: boolean };
type Reponse = { scoreGlobal?: number; resultats?: Resultat[]; data?: Record<string, unknown>; texte?: string; erreur?: string };

export function DeposerClient({ initialType }: { initialType: "AMENDE" | "SUSPENSION" }) {
  const [type, setType] = useState<"AMENDE" | "SUSPENSION">(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [infos, setInfos] = useState({ plaque: "", num_pv: "", date: "", montant: "", heure: "" });
  const [loading, setLoading] = useState(false);
  const [reponse, setReponse] = useState<Reponse | null>(null);

  async function handleScan() {
    setLoading(true);
    setReponse(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      if (file) fd.set("pv", file);
      Object.entries(infos).forEach(([k, v]) => v && fd.set(k, v));
      // Réutilise l'API démo (scan réel si fichier fourni, sans stockage)
      const res = await fetch("/api/demo/analyse", { method: "POST", body: fd });
      const body = (await res.json()) as Reponse;
      setReponse(body);
      if (body.data) {
        // Sauvegarde temporaire pour la page paiement (sans email)
        sessionStorage.setItem("deposer_data", JSON.stringify({ type, data: body.data, scoreGlobal: body.scoreGlobal, resultats: body.resultats }));
      }
    } catch {
      setReponse({ erreur: "Erreur lors du scan." });
    } finally {
      setLoading(false);
    }
  }

  const hasResult = reponse && (reponse.scoreGlobal !== undefined || reponse.resultats);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as never)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm">
            <option value="AMENDE">Amende</option>
            <option value="SUSPENSION">Suspension de permis</option>
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléverser PV / lettre (JPEG, PNG, PDF, 8 Mo max)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Plaque</span><input value={infos.plaque} onChange={(e) => setInfos({ ...infos, plaque: e.target.value })} placeholder="AB-123-CD" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">N° PV / décision</span><input value={infos.num_pv} onChange={(e) => setInfos({ ...infos, num_pv: e.target.value })} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Date</span><input type="date" value={infos.date} onChange={(e) => setInfos({ ...infos, date: e.target.value })} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Montant / Heure</span><input value={infos.montant} onChange={(e) => setInfos({ ...infos, montant: e.target.value })} placeholder="135 € ou 14h32" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm" /></label>
        </div>

        <button onClick={handleScan} disabled={loading} className="mt-6 w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "Scan en cours…" : "Lancer le scan et le scoring"}
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">Aucun email demandé — analyse gratuite, rien n'est stocké avant paiement.</p>
      </div>

      {hasResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h3 className="font-semibold text-emerald-900">Résultat du scoring</h3>
          {typeof reponse?.scoreGlobal === "number" && (
            <p className="mt-2 text-3xl font-bold text-emerald-700">{reponse.scoreGlobal}% de succès estimé</p>
          )}
          {reponse?.resultats && reponse.resultats.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {reponse.resultats.map((r, i) => (
                <li key={i} className="rounded-xl bg-white px-4 py-3 text-sm">
                  <span className="font-medium">{r.titreFaille}</span> <span className="text-zinc-500">({r.articleLoi})</span> — <span className={`font-bold ${r.score >= 50 ? "text-emerald-600" : "text-amber-600"}`}>{r.score}%</span>
                  {r.proposition && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs">Proposition à valider</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">Aucune faille automatique détectée — un juriste examinerait tout de même.</p>
          )}
          <Link href={`/paiement?type=${type}`} className="mt-6 inline-block w-full rounded-full bg-zinc-900 px-6 py-3 text-center font-semibold text-white hover:bg-black">
            Continuer vers le paiement
          </Link>
          <p className="mt-2 text-center text-xs text-zinc-500">Vous y renseignerez nom, prénom, email, téléphone et choisirez virement ou carte.</p>
        </div>
      )}
      {reponse?.erreur && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{reponse.erreur}</p>}
    </div>
  );
}
