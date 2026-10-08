"use client";

import { useActionState, useState } from "react";
import {
  ecarterSource,
  extrairePropositionAction,
  extrairePropositionsLot,
  promouvoirSource,
  relancerVeille,
  validerPropositionSource,
  type VeilleState,
} from "./actions";
import type { PropositionVeille } from "@/lib/veille-extraction";
import { LectureDrawer } from "./lecture-drawer";

export type SourceDto = {
  id: string;
  statut: string;
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
  proposition: PropositionVeille | null;
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

function dateCourteFr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

type ActionEtat = {
  action: (formData: FormData) => void;
  pending: boolean;
  state: VeilleState;
};
export type { ActionEtat };

/**
 * Proposition structurée extraite par IA (règle dégagée + conditions +
 * articles retenus), bornée aux verbatims du texte. L'extraction est ouverte
 * au juriste comme à l'admin ; la **validation** (→ faille ACTIVE immédiate)
 * est réservée à l'admin.
 */
function BlocProposition({
  s,
  role,
  extract,
  valider,
}: {
  s: SourceDto;
  role: string;
  extract: ActionEtat;
  valider: ActionEtat;
}) {
  const p = s.proposition;

  const messages = (
    <>
      {extract.state?.error && (
        <p className="mt-2 text-xs text-red-700">{extract.state.error}</p>
      )}
      {extract.state?.message && (
        <p className="mt-2 text-xs text-emerald-700">{extract.state.message}</p>
      )}
      {valider.state?.error && (
        <p className="mt-2 text-xs text-red-700">{valider.state.error}</p>
      )}
      {valider.state?.message && (
        <p className="mt-2 text-xs text-emerald-700">{valider.state.message}</p>
      )}
    </>
  );

  const boutonExtraire = s.statut === "NOUVEAU" && (
    <form action={extract.action}>
      <input type="hidden" name="id" value={s.id} />
      <button
        type="submit"
        disabled={extract.pending}
        data-testid="extraire-proposition"
        className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-white disabled:opacity-50"
      >
        {extract.pending
          ? "Extraction…"
          : p
            ? "Relancer l'extraction"
            : "Extraire la proposition"}
      </button>
    </form>
  );

  if (!p) {
    return (
      <div
        className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4"
        data-testid="proposition-encart"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-600">
            <strong className="text-zinc-800">
              Proposition IA (articles + règle dégagée) : non extraite.
            </strong>
            {s.score < SCORE_SEUIL_UI &&
              " L'extraction automatique cible les publications mieux notées : lancez-la manuellement."}
          </p>
          {boutonExtraire}
        </div>
        {messages}
      </div>
    );
  }

  if (p.etat === "echec") {
    return (
      <div
        className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"
        data-testid="proposition-encart"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-red-800">
            <strong>Extraction en échec</strong> — {p.motif}
          </p>
          {boutonExtraire}
        </div>
        {messages}
      </div>
    );
  }

  const complet = p.etat === "extrait";
  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        complet ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
      data-testid="proposition-encart"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            complet
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {complet
            ? `Proposition extraite (IA) — ${dateCourteFr(p.extraitLe)}`
            : "Proposition incomplète (IA)"}
        </span>
        <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
          {p.typeInfraction === "SUSPENSION" ? "Suspension" : "Amende"}
        </span>
        {p.articles.map((a) => (
          <span
            key={a}
            className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900"
          >
            {a}
          </span>
        ))}
      </div>

      {!complet && (
        <p className="mt-2 text-xs font-medium text-amber-800">{p.motif}</p>
      )}

      <p className="mt-3 text-xs font-semibold text-zinc-800">Règle dégagée</p>
      <p className="mt-0.5 text-sm text-zinc-700">{p.regle || "—"}</p>

      {p.resume && (
        <>
          <p className="mt-2 text-xs font-semibold text-zinc-800">
            Objet de la décision
          </p>
          <p className="mt-0.5 text-sm text-zinc-700">{p.resume}</p>
        </>
      )}

      {p.extraits.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-zinc-200 pl-3">
          {p.extraits.map((e, i) => (
            <li key={i} className="text-xs text-zinc-600">
              « {e} »
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {complet && s.statut === "NOUVEAU" && role === "ADMIN" && (
          <form action={valider.action}>
            <input type="hidden" name="id" value={s.id} />
            <button
              type="submit"
              disabled={valider.pending}
              data-testid="valider-proposition"
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {valider.pending
                ? "Validation…"
                : "Valider la proposition (→ faille ACTIVE)"}
            </button>
          </form>
        )}
        {complet && s.statut === "NOUVEAU" && role !== "ADMIN" && (
          <p className="text-[11px] text-zinc-600">
            En attente de validation par un administrateur.
          </p>
        )}
        {boutonExtraire}
      </div>
      {messages}
    </div>
  );
}

/** Score minimal partagé avec l'extraction automatique (`veille-extraction`). */
const SCORE_SEUIL_UI = 12;

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

function CarteSource({ s, role }: { s: SourceDto; role: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [stateEcart, actionEcart, pendingEcart] = useActionState<VeilleState, FormData>(
    ecarterSource,
    undefined,
  );
  const [stateExtract, actionExtract, pendingExtract] = useActionState<VeilleState, FormData>(
    extrairePropositionAction,
    undefined,
  );
  const [stateValider, actionValider, pendingValider] = useActionState<VeilleState, FormData>(
    validerPropositionSource,
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

      <BlocProposition
        s={s}
        role={role}
        extract={{
          action: actionExtract,
          pending: pendingExtract,
          state: stateExtract,
        }}
        valider={{
          action: actionValider,
          pending: pendingValider,
          state: stateValider,
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLecture(true)}
          data-testid="lire-decision"
          className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700"
        >
          Lire la décision
        </button>
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

      {lecture && (
        <LectureDrawer
          s={s}
          role={role}
          extract={{
            action: actionExtract,
            pending: pendingExtract,
            state: stateExtract,
          }}
          valider={{
            action: actionValider,
            pending: pendingValider,
            state: stateValider,
          }}
          ecart={{
            action: actionEcart,
            pending: pendingEcart,
            state: stateEcart,
          }}
          onClose={() => setLecture(false)}
        />
      )}
    </article>
  );
}

export function VeilleList({
  sources,
  role,
}: {
  sources: SourceDto[];
  role: string;
}) {
  const [state, action, pending] = useActionState<VeilleState, FormData>(
    relancerVeille,
    undefined,
  );
  const [stateLot, actionLot, pendingLot] = useActionState<VeilleState, FormData>(
    extrairePropositionsLot,
    undefined,
  );
  const candidatsExtraction = sources.filter(
    (s) =>
      s.statut === "NOUVEAU" &&
      (!s.proposition || s.proposition.etat === "echec"),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {sources.length} publication{sources.length > 1 ? "s" : ""} en attente
          de lecture
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {candidatsExtraction > 0 && (
            <form action={actionLot}>
              <button
                type="submit"
                disabled={pendingLot}
                data-testid="extraire-lot"
                className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {pendingLot
                  ? "Extraction en cours…"
                  : `Extraire les propositions (${candidatsExtraction})`}
              </button>
            </form>
          )}
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
      </div>

      {state?.message && <Bandeau state={state} />}
      {stateLot?.message && <Bandeau state={stateLot} />}
      {stateLot?.error && <Bandeau state={stateLot} />}

      {sources.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          Aucune publication en attente. Le cron relève chaque jour les
          publications officielles (jurisprudence administrative, Cour de
          cassation, Journal officiel) et n&apos;y dépose que celles qui
          touchent la contestation d&apos;amendes routières.
        </p>
      ) : (
        sources.map((s) => <CarteSource key={s.id} s={s} role={role} />)
      )}
    </div>
  );
}
