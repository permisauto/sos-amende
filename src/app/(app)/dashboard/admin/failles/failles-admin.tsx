"use client";

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import {
  activerToutesPropositions,
  basculerFaille,
  importerFaillesDepuisSources,
  modifierFaille,
  validerPropositionFaille,
} from "../actions";
import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";

export type FailleDto = {
  id: string;
  typeInfraction: string;
  titreFaille: string;
  articleLoi: string;
  regle: string | null;
  templateLettre: string;
  source: string | null;
  statut: string;
  reglesDetection: RegleDetection[] | null;
  jurisprudence: JurisprudenceRef[] | null;
};

const inputCls =
  "rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const reglesPlaceholder = `[
  { "type": "champAbsent", "champ": "numTelePaiement" },
  { "type": "datePrescrite" },
  { "type": "plaqueIncorrecte" },
  { "type": "etalonnageExpire" },
  { "type": "texteContient", "motif": "exces de vitesse" },
  { "type": "texteAbsent", "motif": "minorée" }
]`;

const jurisprudencePlaceholder = `[
  {
    "reference": "Cass. crim., 12 janvier 2026, n° 25-80.412",
    "juridiction": "Cour de cassation",
    "date": "2026-01-12",
    "url": "https://www.courdecassation.fr/...",
    "verifiee": false,
    "resume": "L'essentiel de la décision, contextualisé (ce qu'elle tranche)."
  }
]`;

const statusMeta: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
  INACTIVE: { label: "Inactive", cls: "bg-zinc-100 text-zinc-500" },
  PROPOSEE: {
    label: "Proposition (auto-alimentation)",
    cls: "bg-amber-100 text-amber-800",
  },
};

export function FaillesAdmin({
  failles,
  filter,
}: {
  failles: FailleDto[];
  filter: string;
}) {
  const [sourcesState, sourcesAction, sourcesPending] = useActionState(
    importerFaillesDepuisSources,
    undefined,
  );
  const [activerToutesState, activerToutesPropositionsAction, activerToutesPending] = useActionState(
    activerToutesPropositions,
    undefined,
  );

  const filters = [
    { value: "ALL", label: "Toutes" },
    { value: "ACTIVE", label: "Actives" },
    { value: "PROPOSEE", label: "Propositions" },
    { value: "INACTIVE", label: "Inactives" },
  ];
  const nbProposees = failles.filter((f) => f.statut === "PROPOSEE").length;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Auto-alimentation (propositions sourcées)
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              La base se synchronise automatiquement avec le catalogue de la
              recherche documentaire (articles de loi + jurisprudences, sources
              publiques). Chaque proposition indique la règle dégagée, les
              articles de loi et l&apos;essentiel de chaque jurisprudence pour
              une visibilité complète. Votre rôle : lire, vérifier, puis valider
              (Active) ou écarter (Inactive) — le moteur n&apos;utilise jamais
              une proposition tant qu&apos;elle n&apos;est pas Active.
            </p>
          </div>
          <form action={sourcesAction}>
            <button
              type="submit"
              disabled={sourcesPending}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {sourcesPending
                ? "Synchronisation…"
                : "Synchroniser maintenant"}
            </button>
          </form>
          {nbProposees > 0 && (
            <form action={activerToutesPropositionsAction}>
              <button
                type="submit"
                disabled={activerToutesPending}
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {activerToutesPending ? "Activation…" : `Activer les ${nbProposees} propositions`}
              </button>
            </form>
          )}
        </div>
        {sourcesState?.error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {sourcesState.error}
          </p>
        )}
        {sourcesState?.ok && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            {sourcesState.count ?? 0} proposition(s) en attente de validation.
          </p>
        )}
        {activerToutesState?.error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {activerToutesState.error}
          </p>
        )}
        {activerToutesState?.ok && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            Toutes les propositions ont été activées.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Failles existantes ({failles.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <Link
                key={item.value}
                href={`/dashboard/admin/failles${item.value === "ALL" ? "" : `?f=${item.value}`}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  filter === item.value
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {item.label}
                {item.value === "PROPOSEE" && nbProposees > 0
                  ? ` (${nbProposees})`
                  : ""}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {failles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              Aucune faille dans cette catégorie.
            </p>
          ) : (
            failles.map((faille) => (
              <FailleRow key={faille.id} faille={faille} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function FailleFields({ initial }: { initial?: FailleDto }) {
  const [template, setTemplate] = useState(initial?.templateLettre ?? "");
  const variables = [
    "{nom}",
    "{plaque}",
    "{num_pv}",
    "{date}",
    "{montant}",
    "{radarId}",
  ];
  const exemple: Record<string, string> = {
    "{nom}": "Jean Dupont",
    "{plaque}": "AB-123-CD",
    "{num_pv}": "P123456789",
    "{date}": "2026-08-01",
    "{montant}": "135 €",
    "{radarId}": "R-2026-0042",
  };

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Type d'infraction
        </span>
        <select
          name="typeInfraction"
          defaultValue={initial?.typeInfraction ?? "AMENDE"}
          className={inputCls}
        >
          <option value="AMENDE">AMENDE</option>
          <option value="SUSPENSION">SUSPENSION</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Titre</span>
        <input
          name="titreFaille"
          required
          defaultValue={initial?.titreFaille}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Article de loi</span>
        <input
          name="articleLoi"
          required
          defaultValue={initial?.articleLoi}
          className={inputCls}
        />
      </label>
      <label className="col-span-full flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Règle dégagée (ce que l&apos;article + la jurisprudence imposent)
        </span>
        <textarea
          name="regle"
          rows={3}
          defaultValue={initial?.regle ?? ""}
          className={inputCls}
          placeholder="Ex. : l'amende majorée n'est recouvrable que si l'avis initial a été régulièrement notifié…"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Source</span>
        <input
          name="source"
          defaultValue={initial?.source ?? ""}
          className={inputCls}
        />
      </label>
      <label className="col-span-full flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Template de lettre (rédaction guidée)
        </span>
        <div className="flex flex-wrap gap-2">
          {variables.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() =>
                setTemplate((t) => {
                  const ta = document.querySelector<HTMLTextAreaElement>(
                    'textarea[name="templateLettre"]',
                  );
                  const cur = ta?.value ?? t;
                  const next = cur ? `${cur}\n${v}` : v;
                  if (ta) ta.value = next;
                  return next;
                })
              }
              className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 font-mono text-xs text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-700"
            >
              {v}
            </button>
          ))}
        </div>
        <textarea
          name="templateLettre"
          required
          rows={6}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className={`${inputCls} font-mono text-xs`}
          placeholder="Je soussigné {nom}… conteste le PV {num_pv}…"
        />
      </label>
      {template.trim() && (
        <div className="col-span-full rounded-xl bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Aperçu (avec des valeurs d'exemple)
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-emerald-900">
            {template.replace(/\{(\w+)\}/g, (m) => exemple[m] ?? m)}
          </p>
        </div>
      )}
      <label className="col-span-full flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Règles de détection (JSON, une règle suffit à détecter la faille)
        </span>
        <textarea
          name="reglesDetection"
          rows={4}
          defaultValue={
            initial?.reglesDetection
              ? JSON.stringify(initial.reglesDetection, null, 2)
              : ""
          }
          className={`${inputCls} font-mono text-xs`}
          placeholder={reglesPlaceholder}
        />
      </label>
      <label className="col-span-full flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Jurisprudence (JSON — références sourcées)
        </span>
        <textarea
          name="jurisprudence"
          rows={4}
          defaultValue={
            initial?.jurisprudence
              ? JSON.stringify(initial.jurisprudence, null, 2)
              : ""
          }
          className={`${inputCls} font-mono text-xs`}
          placeholder={jurisprudencePlaceholder}
        />
      </label>
    </>
  );
}

function FailleRow({ faille }: { faille: FailleDto }) {
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState(false);
  const [toggleState, toggleAction, togglePending] = useActionState(
    basculerFaille,
    undefined,
  );
  const [editState, editAction, editPending] = useActionState(
    modifierFaille,
    undefined,
  );
  const [propState, propAction, propPending] = useActionState(
    validerPropositionFaille,
    undefined,
  );

  // Client-side validated state (persists across page reloads in demo mode)
  const [localValidated, setLocalValidated] = useState<Record<string, "ACTIVE" | "INACTIVE">>({});
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sos-amende-validated-failles");
      if (stored) setLocalValidated(JSON.parse(stored));
    } catch {}
  }, []);

  const effectiveStatut = (localValidated[faille.id] ?? faille.statut) as "ACTIVE" | "INACTIVE" | "PROPOSEE";
  const meta = statusMeta[effectiveStatut] ?? {
    label: effectiveStatut,
    cls: "bg-zinc-100 text-zinc-500",
  };
  const jurisprudence = faille.jurisprudence ?? [];
  const nbNonVerifiees = jurisprudence.filter((j) => !j.verifiee).length;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{faille.titreFaille}</h3>
          <p className="mt-0.5 text-sm text-zinc-600">{faille.articleLoi}</p>
          {faille.regle && (
            <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-700">
              <span className="font-semibold text-zinc-800">Règle dégagée : </span>
              {faille.regle}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span
              className={`rounded-full px-2.5 py-0.5 font-medium ${meta.cls}`}
            >
              {meta.label}
            </span>
            <span>{faille.typeInfraction}</span>
            {faille.source && <span>Source : {faille.source}</span>}
            <span>
              {faille.reglesDetection?.length
                ? `${faille.reglesDetection.length} règle(s) de détection`
                : "Détection : prédicats par défaut"}
            </span>
            {jurisprudence.length > 0 && (
              <span>
                {jurisprudence.length} jurisprudence
                {jurisprudence.length > 1 ? "s" : ""}
                {nbNonVerifiees > 0
                  ? ` — ${nbNonVerifiees} non vérifiée(s)`
                  : " — vérifiée(s)"}
              </span>
            )}
          </div>
          {jurisprudence.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {jurisprudence.map((j, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      j.verifiee
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {j.verifiee ? "Vérifiée" : "À vérifier"}
                  </span>
                  <span className="text-zinc-700">{j.reference}</span>
                  {j.url && (
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      Source
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {faille.statut === "PROPOSEE" && nbNonVerifiees > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Attention : {nbNonVerifiees} référence(s) de jurisprudence{" "}
              {nbNonVerifiees > 1 ? "restent" : "reste"} à confirmer sur une
              source primaire (Judilibre / Legifrance) avant activation.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDetail((v) => !v)}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {detail ? "Masquer le détail" : "Lire en détail"}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {editing ? "Fermer" : "Modifier"}
          </button>
          {effectiveStatut === "PROPOSEE" ? (
            <form action={propAction}>
              <input type="hidden" name="id" value={faille.id} />
              <input type="hidden" name="action" value="ACTIVE" />
              <button
                type="submit"
                disabled={propPending}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Valider (Active)
              </button>
            </form>
          ) : (
            <form action={toggleAction}>
              <input type="hidden" name="id" value={faille.id} />
              <button
                type="submit"
                disabled={togglePending}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {effectiveStatut === "ACTIVE" ? "Désactiver" : "Activer"}
              </button>
            </form>
          )}
        </div>
      </div>
      {effectiveStatut === "PROPOSEE" && (
        <form action={propAction} className="mt-3">
          <input type="hidden" name="id" value={faille.id} />
          <input type="hidden" name="action" value="INACTIVE" />
          <button
            type="submit"
            disabled={propPending}
            className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Écarter (Inactive)
          </button>
        </form>
      )}
      {toggleState?.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {toggleState.error}
        </p>
      )}
      {toggleState?.ok && (
        <>
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Statut mis à jour.
          </p>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    const stored = localStorage.getItem("sos-amende-validated-failles");
                    const data = stored ? JSON.parse(stored) : {};
                    const newStatut = "${faille.statut}" === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                    data["${faille.id}"] = newStatut;
                    localStorage.setItem("sos-amende-validated-failles", JSON.stringify(data));
                    window.location.reload();
                  } catch(e) { console.error(e); }
                })();
              `,
            }}
          />
        </>
      )}
      {propState?.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {propState.error}
        </p>
      )}
      {propState?.ok && (
        <>
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Faille mise à jour.
          </p>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    const stored = localStorage.getItem("sos-amende-validated-failles");
                    const data = stored ? JSON.parse(stored) : {};
                    data["${faille.id}"] = "${faille.statut === "PROPOSEE" ? "ACTIVE" : "INACTIVE"}";
                    localStorage.setItem("sos-amende-validated-failles", JSON.stringify(data));
                    window.location.reload();
                  } catch(e) { console.error(e); }
                })();
              `,
            }}
          />
        </>
      )}

      {detail && (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Article / base légale
            </h4>
            <p className="mt-1 text-sm text-zinc-800">{faille.articleLoi}</p>
          </div>
          {faille.regle && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Règle dégagée (rappel)
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-zinc-800">
                {faille.regle}
              </p>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Source
            </h4>
            <p className="mt-1 text-sm text-zinc-800">
              {faille.source ?? "—"}
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Template de lettre
            </h4>
            <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-white p-4 font-mono text-xs leading-relaxed text-zinc-700">
              {faille.templateLettre}
            </pre>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Règles de détection
            </h4>
            {faille.reglesDetection?.length ? (
              <ul className="mt-1 flex flex-col gap-1">
                {faille.reglesDetection.map((r, i) => (
                  <li key={i} className="text-sm text-zinc-700">
                    {r.type}
                    {"motif" in r && r.motif ? ` — ${r.motif}` : ""}
                    {"champ" in r && r.champ ? ` — champ ${r.champ}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">
                Prédicats par défaut (failles historiques).
              </p>
            )}
          </div>
          {jurisprudence.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Jurisprudence
              </h4>
              <ul className="mt-1 flex flex-col gap-2">
                {jurisprudence.map((j, i) => (
                  <li key={i} className="rounded-xl bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          j.verifiee
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {j.verifiee ? "Vérifiée" : "À vérifier"}
                      </span>
                      <span className="font-medium text-zinc-800">
                        {j.reference}
                      </span>
                    </div>
                    {j.date && (
                      <p className="mt-1 text-xs text-zinc-500">{j.date}</p>
                    )}
                    {j.juridiction && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {j.juridiction}
                      </p>
                    )}
                    {j.url && (
                      <a
                        href={j.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Ouvrir la source
                      </a>
                    )}
                    {"resume" in j && j.resume && (
                      <p className="mt-2 text-xs leading-relaxed text-zinc-700">
                        <span className="font-semibold text-zinc-800">
                          Résumé :{" "}
                        </span>
                        {j.resume}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editing && (
        <form action={editAction} className="mt-5 flex flex-col gap-4 border-t border-zinc-100 pt-5">
          <input type="hidden" name="id" value={faille.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FailleFields initial={faille} />
          </div>
          <button
            type="submit"
            disabled={editPending}
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {editPending ? "Enregistrement…" : "Enregistrer"}
          </button>
          {editState?.error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {editState.error}
            </p>
          )}
          {editState?.ok && (
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              Faille mise à jour.
            </p>
          )}
        </form>
      )}
    </div>
  );
}