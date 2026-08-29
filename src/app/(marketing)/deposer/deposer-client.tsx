"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Resultat = { titreFaille: string | null; articleLoi: string | null; score: number; proposition: boolean };
type Reponse = { scoreGlobal?: number; resultats?: Resultat[]; data?: Record<string, unknown>; texte?: string; erreur?: string };

export function DeposerClient({ initialType }: { initialType: "AMENDE" | "SUSPENSION" }) {
  const [type, setType] = useState<"AMENDE" | "SUSPENSION">(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [infos, setInfos] = useState({ plaque: "", num_pv: "", date: "", montant: "", heure: "" });
  const [loading, setLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    if (f?.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setReponse({ erreur: "Fichier trop volumineux (8 Mo max). Réduisez la qualité photo dans les réglages de l'appareil." });
      return;
    }
    setAutoFilling(true);
    setReponse(null);
    try {
      // Upload -> OCR extrait les données ET lance directement le scan/scoring (une seule requête)
      const fd = new FormData();
      fd.set("type", type);
      fd.set("pv", f);
      const res = await fetch("/api/demo/analyse", { method: "POST", body: fd });
      const body = (await res.json()) as Reponse & { data?: Record<string, string> };
      if (body.data) {
        setInfos((prev) => ({
          plaque: (body.data?.plaque as string) || prev.plaque,
          num_pv: (body.data?.num_pv as string) || prev.num_pv,
          date: (body.data?.date as string) || prev.date,
          montant: (body.data?.montant as string) || prev.montant,
          heure: (body.data?.heure as string) || prev.heure,
        }));
      }
      // L'OCR a extrait -> on affiche directement le scoring (l'utilisateur vérifie ensuite)
      if (body.scoreGlobal !== undefined || body.resultats) {
        setReponse(body);
        if (body.data) sessionStorage.setItem("deposer_data", JSON.stringify({ type, data: body.data, scoreGlobal: body.scoreGlobal, resultats: body.resultats }));
      }
    } catch {}
    finally { setAutoFilling(false); }
  }

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

        <div className="mt-4">
          <p className="text-sm font-medium">Téléverser avec votre smartphone — scan auto</p>
          <p className="text-xs text-zinc-500">Cadrez bien le PV, lumière uniforme, évitez le flou. Le formulaire se pré-remplit seul.</p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            className={`mt-3 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition ${autoFilling ? "border-emerald-400 bg-emerald-50" : "border-zinc-300 bg-zinc-50 hover:border-emerald-400"}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Aperçu PV" className="max-h-48 rounded-xl object-contain shadow" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white" aria-hidden>📷</span>
            )}
            {file ? (
              <>
                <p className="text-sm font-medium text-zinc-800">{file.name} — {(file.size / 1024).toFixed(0)} Ko</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleFileChange(null); }} className="text-xs font-medium text-emerald-700 hover:underline">Changer de photo</button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-700">Appuyez pour scanner avec votre smartphone</p>
                <p className="text-xs text-zinc-500">Photo ou PDF — JPEG/PNG/WebP/PDF, 8 Mo max. L'OCR capte les infos dès l'upload.</p>
              </>
            )}
            {autoFilling && (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> OCR en cours — pré-remplissage…
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          L'OCR extrait les données dès le téléversement et lance le scan. Vérifiez les champs pré-remplis ci-dessous, corrigez si besoin, puis validez.
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Plaque {infos.plaque && <span className="text-emerald-600">✓ pré-rempli</span>}</span><input value={infos.plaque} onChange={(e) => setInfos({ ...infos, plaque: e.target.value })} placeholder="AB-123-CD" className={`rounded-xl border px-3 py-2 text-sm ${infos.plaque ? "border-emerald-300 bg-emerald-50" : "border-zinc-300"}`} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">N° PV / décision {infos.num_pv && <span className="text-emerald-600">✓ pré-rempli</span>}</span><input value={infos.num_pv} onChange={(e) => setInfos({ ...infos, num_pv: e.target.value })} className={`rounded-xl border px-3 py-2 text-sm ${infos.num_pv ? "border-emerald-300 bg-emerald-50" : "border-zinc-300"}`} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Date {infos.date && <span className="text-emerald-600">✓ pré-rempli</span>}</span><input type="date" value={infos.date} onChange={(e) => setInfos({ ...infos, date: e.target.value })} className={`rounded-xl border px-3 py-2 text-sm ${infos.date ? "border-emerald-300 bg-emerald-50" : "border-zinc-300"}`} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium">Montant / Heure {infos.montant && <span className="text-emerald-600">✓ pré-rempli</span>}</span><input value={infos.montant} onChange={(e) => setInfos({ ...infos, montant: e.target.value })} placeholder="135 € ou 14h32" className={`rounded-xl border px-3 py-2 text-sm ${infos.montant ? "border-emerald-300 bg-emerald-50" : "border-zinc-300"}`} /></label>
        </div>

        <button onClick={handleScan} disabled={loading || autoFilling} className="mt-6 w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "Scan en cours…" : autoFilling ? "OCR en cours…" : hasResult ? "Re-vérifier et relancer le scoring" : "Vérifier et valider — relancer le scoring"}
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">Le scan s'est lancé automatiquement à l'upload. Corrigez les champs si besoin et re-validez. Aucun email demandé — analyse gratuite.</p>
      </div>

      {hasResult && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
              Scoring vérifié — failles & preuves
            </h3>
            {typeof reponse?.scoreGlobal === "number" && (
              <p className="mt-2 text-3xl font-bold text-emerald-700">{reponse.scoreGlobal}% de succès estimé</p>
            )}
            <p className="mt-1 text-xs text-emerald-700">Vérification automatique par règles juridiques (moteur) + contrôle des preuves jointes.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Failles juridiques vérifiées</p>
                {reponse?.resultats && reponse.resultats.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {reponse.resultats.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${r.score >= 50 ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>✓</span>
                        <span><span className="font-medium">{r.titreFaille}</span> <span className="text-zinc-500">({r.articleLoi})</span> — <span className="font-bold">{r.score}%</span>{r.proposition && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px]">proposition</span>}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">Aucune faille auto détectée — relecture juriste prévue.</p>
                )}
              </div>
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preuves vérifiées</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li className="flex items-center gap-2">{file ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">○</span>} <span className={file ? "text-zinc-800" : "text-zinc-400"}>PV/lettre téléversé{file ? ` — ${file.name}` : ""}</span></li>
                  <li className="flex items-center gap-2">{infos.plaque ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">!</span>} Plaque {infos.plaque || "manquante"}</li>
                  <li className="flex items-center gap-2">{infos.num_pv ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">!</span>} N° PV/décision {infos.num_pv || "manquant"}</li>
                  <li className="flex items-center gap-2">{infos.date ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">!</span>} Date {infos.date || "manquante"}</li>
                  <li className="flex items-center gap-2">{infos.montant || infos.heure ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">○</span>} Montant/heure {infos.montant || infos.heure || "—"}</li>
                  <li className="flex items-center gap-2">{reponse?.texte ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">○</span>} Texte OCR {reponse?.texte ? "capté" : "—"}</li>
                </ul>
                <p className="mt-3 text-[11px] text-zinc-500">Les preuves (certificat étalonnage, météo, travaux) seront ajoutées à l'étape juriste si pertinentes.</p>
              </div>
            </div>
          </div>
          <Link href={`/paiement?type=${type}`} className="inline-block w-full rounded-full bg-zinc-900 px-6 py-3 text-center font-semibold text-white hover:bg-black">
            Continuer vers le paiement
          </Link>
          <p className="text-center text-xs text-zinc-500">Vous y renseignerez nom, prénom, email, téléphone et choisirez virement ou carte.</p>
        </div>
      )}
      {reponse?.erreur && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{reponse.erreur}</p>}
    </div>
  );
}
