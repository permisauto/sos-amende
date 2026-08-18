"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Resultat = {
  id: string;
  titreFaille: string | null;
  articleLoi: string | null;
  source: string | null;
  jurisprudence: { reference: string; url?: string | null }[];
  score: number;
  reglesMatchées: number;
  reglesTotal: number;
  statut: string | null;
  proposition: boolean;
  motifsTexte: string[];
};

type LettreFaille = {
  titre: string;
  articleLoi: string;
  statut: string;
};

type Reponse = {
  simulation?: boolean;
  message?: string;
  scoreGlobal?: number;
  texte?: string;
  data?: Record<string, unknown>;
  simule?: boolean;
  lettre?: string | null;
  lettreFaille?: LettreFaille | null;
  resultats?: Resultat[];
  erreur?: string;
};

type Phase = "idle" | "scanning" | "resultats" | "lettre";

type ValidationLettre = "floutee" | "verification" | "validee";

const SCAN_STEPS_AMENDE = [
  "Téléversement simulé de l'avis de contravention…",
  "Lecture automatique (OCR) du document…",
  "Extraction des données (plaque, date, montant)…",
  "Identification des failles juridiques…",
];

const SCAN_STEPS_SUSPENSION = [
  "Téléversement simulé de la décision de suspension…",
  "Lecture automatique (OCR) du document…",
  "Extraction des données (plaque, date, décision)…",
  "Identification des failles juridiques…",
];

const LIBELLES: Record<"AMENDE" | "SUSPENSION", string> = {
  AMENDE: "un avis de contravention",
  SUSPENSION: "une décision de suspension",
};

const DUREE_ETAPE = 650;

export function DemoScan() {
  const [type, setType] = useState<"AMENDE" | "SUSPENSION">("AMENDE");
  const [phase, setPhase] = useState<Phase>("idle");
  const [validationLettre, setValidationLettre] =
    useState<ValidationLettre>("floutee");
  const [step, setStep] = useState(0);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scanSteps =
    type === "SUSPENSION" ? SCAN_STEPS_SUSPENSION : SCAN_STEPS_AMENDE;

  function clearTimers() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  }

  function startScan() {
    clearTimers();
    setReponse(null);
    setPhase("scanning");
    setValidationLettre("floutee");
    setStep(0);
    scanSteps.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStep(i), i * DUREE_ETAPE));
    });
    const finScan = scanSteps.length * DUREE_ETAPE;
    timers.current.push(
      setTimeout(() => setPhase("resultats"), finScan + 300),
    );
    timers.current.push(
      setTimeout(() => {
        setPhase("lettre");
        setValidationLettre("floutee");
      }, finScan + 3200),
    );
    // Lettre floutée → vérification juriste → validation.
    timers.current.push(
      setTimeout(() => setValidationLettre("verification"), finScan + 5200),
    );
    timers.current.push(
      setTimeout(() => setValidationLettre("validee"), finScan + 7200),
    );
  }

  async function lancerDemo() {
    startScan();

    const form = new FormData();
    form.set("type", type);

    const res = await fetch("/api/demo/analyse", { method: "POST", body: form });
    const body: Reponse = await res.json().catch(() => ({}));
    setReponse(body);
  }

  // Surligne les motifs détectés dans le document scanné.
  function documentSurligne() {
    const texte = reponse?.texte ?? "";
    const motifs = (reponse?.resultats ?? []).flatMap((r) => r.motifsTexte);
    if (motifs.length === 0) return texte;
    const motifsTries = [...motifs].sort((a, b) => b.length - a.length);
    const re = new RegExp(`(${motifsTries.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const parts = texte.split(re);
    return parts.map((p, i) =>
      motifsTries.some(
        (m) => m.toLowerCase() === p.toLowerCase(),
      ) ? (
        <mark
          key={i}
          className="rounded bg-emerald-200 px-0.5 text-emerald-900"
        >
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }

  const donneesExtraites = (reponse?.data ?? {}) as Record<string, unknown>;
  const champsExtraits = [
    { cle: "plaque", label: "Plaque" },
    { cle: "num_pv", label: "N° PV" },
    { cle: "date", label: "Date" },
    { cle: "montant", label: "Montant" },
  ].filter((c) => donneesExtraites[c.cle]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Analyse démo
        </p>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-600">
          Simulation de démonstration
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        La démo simule le téléversement de {LIBELLES[type]}, le scan (OCR),
        l&apos;identification des failles, le score de réussite estimé puis la
        génération de la lettre de recours — rien n&apos;est stocké, aucun
        fichier n&apos;est requis.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">
            Document simulé
          </span>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "AMENDE" | "SUSPENSION")
            }
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="AMENDE">Avis de contravention (amende)</option>
            <option value="SUSPENSION">Décision de suspension</option>
          </select>
        </label>
        <button
          type="button"
          onClick={lancerDemo}
          disabled={phase === "scanning"}
          className="mt-5 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {phase === "scanning" ? "Scan en cours…" : "Lancer la démo"}
        </button>
      </div>

      {phase === "idle" && (
        <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
          Cliquez sur « Lancer la démo » : la simulation se déroule seule, sans
          téléversement ni saisie.
        </div>
      )}

      {phase === "scanning" && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-amber-50 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {type === "SUSPENSION"
                ? "Décision de suspension"
                : "Avis de contravention"}{" "}
              — téléversé et scanné
            </p>
            <div className="mt-2 font-mono text-xs leading-relaxed text-zinc-700">
              {reponse?.texte ? (
                documentSurligne()
              ) : (
                <span className="text-zinc-400">
                  Lecture du document en cours…
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-emerald-200/70 to-transparent motion-safe:animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-50 px-6 py-5 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="text-sm font-medium text-zinc-700">
              {scanSteps[Math.min(step, scanSteps.length - 1)]}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{
                  width: `${((Math.min(step, scanSteps.length - 1) + 1) / scanSteps.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {phase === "resultats" && (
        <div className="mt-4 flex flex-col gap-4">
          {reponse?.message && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              ⚠️ {reponse.message}
            </div>
          )}

          {reponse?.texte && (
            <div className="rounded-xl border border-zinc-200 bg-amber-50 px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Document scanné — mots détectés surlignés
              </p>
              <div className="mt-2 font-mono text-xs leading-relaxed text-zinc-700">
                {documentSurligne()}
              </div>
            </div>
          )}

          {champsExtraits.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-zinc-500">
                Données extraites :
              </p>
              {champsExtraits.map((c) => (
                <span
                  key={c.cle}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                >
                  {c.label} :{" "}
                  {String(donneesExtraites[c.cle] ?? "").toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {typeof reponse?.scoreGlobal === "number" && (
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                reponse.scoreGlobal >= 50
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-zinc-800">
                  Score de réussite estimé
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {reponse.scoreGlobal >= 50
                    ? "Des motifs solides semblent présents — à confirmer par un juriste."
                    : "Peu de motifs détectés pour cette démo — un juriste examinerait tout de même le dossier."}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-4 py-1.5 text-lg font-bold ${
                  reponse.scoreGlobal >= 50
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-500 text-white"
                }`}
              >
                {reponse.scoreGlobal}%
              </span>
            </div>
          )}

          {reponse?.resultats && reponse.resultats.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-zinc-800">
                {reponse.resultats.length} faille
                {reponse.resultats.length > 1 ? "s" : ""} identifiée
                {reponse.resultats.length > 1 ? "s" : ""} :
              </p>
              {reponse.resultats.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-emerald-900">
                          {r.titreFaille}
                        </p>
                        {r.proposition && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Proposition à valider
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-emerald-800">
                        {r.articleLoi}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                        r.score >= 50
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {r.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-zinc-700">
                Aucune faille automatique détectée pour cette démo.
              </p>
            </div>
          )}
        </div>
      )}

      {phase === "lettre" && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {validationLettre === "validee" ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            ) : (
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            )}
            <p className="text-sm font-semibold text-zinc-800">
              {validationLettre === "floutee" && "Lettre de recours générée"}
              {validationLettre === "verification" &&
                "Un juriste vérifie la lettre…"}
              {validationLettre === "validee" &&
                "Lettre validée par le juriste"}
            </p>
          </div>

          {reponse?.lettre ? (
            <>
              {reponse.lettreFaille && (
                <p className="text-xs text-zinc-500">
                  Rédigée depuis la faille « {reponse.lettreFaille.titre} »
                  ({reponse.lettreFaille.articleLoi}) — template validé par
                  l&apos;admin.
                </p>
              )}

              <div className="relative">
                <pre
                  className={`max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 font-sans text-sm leading-relaxed text-zinc-800 transition-all duration-700 ${
                    validationLettre !== "validee" ? "blur-[6px] select-none" : ""
                  }`}
                >
                  {reponse.lettre}
                </pre>

                {validationLettre === "floutee" && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40">
                    <span className="rounded-full bg-zinc-900/80 px-4 py-1.5 text-xs font-semibold text-white">
                      En attente de validation par un juriste
                    </span>
                  </div>
                )}
                {validationLettre === "verification" && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40">
                    <span className="flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Vérification du fondement juridique…
                    </span>
                  </div>
                )}
                {validationLettre === "validee" && (
                  <div className="absolute right-3 top-3">
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                      Validée par un juriste
                    </span>
                  </div>
                )}
              </div>

              {validationLettre === "validee" && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  ✓ La lettre est prête : dans la procédure réelle, le client
                  la signe électroniquement puis l&apos;envoie en recommandé
                  avec accusé de réception.
                </p>
              )}
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                ⚠️ Lettre de démonstration : elle n&apos;a pas été envoyée et
                ne constitue pas un avis juridique.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
              Aucune lettre générée : la démo n&apos;a pas retenu de faille
              principale.
            </div>
          )}
        </div>
      )}

      <Link
        href="/pricing"
        className="mt-5 block rounded-full bg-emerald-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-emerald-700"
      >
        Lancer la procédure complète
      </Link>
    </div>
  );
}