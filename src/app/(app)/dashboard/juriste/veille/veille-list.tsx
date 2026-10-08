"use client";

import { useActionState, useState } from "react";
import {
  ecarterSource,
  promouvoirSource,
  relancerVeille,
  type VeilleState,
} from "./actions";

export type SourceDto = {
  id: string;
  source: string;
  nature: string;
  titre: string;
  juridiction: string | null;
  dateSource: string | null;
  reference: string | null;
  ecli: string | null;
  url: string | null;
  citations: string[];
  matchsCore: string[];
  matchsAppui: string[];
  score: number;
  brouillonRegle: string | null;
  archive: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  JADE: "Jurisprudence administrative",
  CASS: "Cour de cassation",
  JORF: "Journal officiel",
  TA: "Tribunaux administratifs",
};

function dateFr(iso: string | null): string {
  if (!iso) return "date inconnue";
  const [a, m, j] = iso.split("-");
  return a && m && j ? `${j}/${m}/${a}` : iso;
}

function Bandeau({ state }: { state: VeilleState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Formulaire de promotion : crée une proposition de faille à compléter. */
function Promotion({ s }: { s: SourceDto }) {
  const [state, action, pending] = useActionState<VeilleState, FormData>(
    promouvoirSource,
    undefined,
  );
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
      >
        Proposer une faille à partir de cette publication
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs text-zinc-600">
        Seuls la référence de la source et son résumé seront repris. La règle
        dégagée et le template de lettre resteront <strong>vides</strong> : à
        rédiger, puis à faire valider.
      </p>
      <label className="block text-xs font-medium text-zinc-700">
        Type d&apos;infraction
        <select
          name="typeInfraction"
          defaultValue="AMENDE"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="AMENDE">AMENDE</option>
          <option value="SUSPENSION">SUSPENSION</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Titre de la faille
        <input
          name="titreFaille"
          required
          minLength={5}
          defaultValue={s.titre.slice(0, 120)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700">
        Article de référence
        <input
          name="articleLoi"
          required
          placeholder="ex. C. route, art. L. 224-16"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <input type="hidden" name="id" value={s.id} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer la proposition"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700"
        >
          Annuler
        </button>
      </div>
      <Bandeau state={state} />
    </form>
  );
}

function CarteSource({ s }: { s: SourceDto }) {
  const [ouvert, setOuvert] = useState(false);
  const [stateEcart, actionEcart, pendingEcart] = useActionState<VeilleState, FormData>(
    ecarterSource,
    undefined,
  );

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
              {SOURCE_LABEL[s.source] ?? s.source}
            </span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
              score {s.score}
            </span>
            {s.matchsCore.slice(0, 3).map((m) => (
              <span
                key={m}
                className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
              >
                {m}
              </span>
            ))}
          </div>
          <h3 className="mt-2 font-semibold text-zinc-900">{s.titre}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {[s.juridiction, dateFr(s.dateSource), s.ecli ?? s.reference]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {s.url && (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Source primaire
          </a>
        )}
      </div>

      {s.citations.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-zinc-200 pl-3">
          {s.citations.map((c, i) => (
            <li key={i} className="text-sm text-zinc-700">
              « {c} »
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          {ouvert ? "Masquer le brouillon" : "Voir le brouillon de règle"}
        </button>
        <form action={actionEcart}>
          <input type="hidden" name="id" value={s.id} />
          <button
            type="submit"
            disabled={pendingEcart}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {pendingEcart ? "…" : "Écarter"}
          </button>
        </form>
        <Promotion s={s} />
      </div>

      {stateEcart?.message && (
        <p className="mt-2 text-xs text-zinc-500">{stateEcart.message}</p>
      )}

      {ouvert && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-900">
            Brouillon généré par extraction — l&apos;articulation reste à écrire
          </p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-amber-950">
            {s.brouillonRegle ?? "Brouillon indisponible."}
          </pre>
          {s.archive && (
            <p className="mt-2 text-[11px] text-amber-800">
              Archive d&apos;origine : {s.archive}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function VeilleList({ sources }: { sources: SourceDto[] }) {
  const [state, action, pending] = useActionState<VeilleState, FormData>(
    relancerVeille,
    undefined,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {sources.length} publication{sources.length > 1 ? "s" : ""} en attente
          de lecture
        </p>
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending ? "Interrogation en cours…" : "Relancer la veille maintenant"}
          </button>
        </form>
      </div>

      {state?.message && <Bandeau state={state} />}

      {sources.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          Aucune publication en attente. Le cron relève chaque jour les
          publications officielles (jurisprudence administrative, Cour de
          cassation, Journal officiel) et n&apos;y dépose que celles qui
          touchent la contestation d&apos;amendes routières.
        </p>
      ) : (
        sources.map((s) => <CarteSource key={s.id} s={s} />)
      )}
    </div>
  );
}
