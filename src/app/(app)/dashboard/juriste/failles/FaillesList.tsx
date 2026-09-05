"use client";

import Link from "next/link";
import { useState } from "react";

import type { JurisprudenceRef } from "@/lib/catalogue-sources";

const statusMeta: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
  INACTIVE: { label: "Inactive", cls: "bg-zinc-100 text-zinc-500" },
  PROPOSEE: {
    label: "Proposition à valider",
    cls: "bg-amber-100 text-amber-800",
  },
};

interface FailleDto {
  id: string;
  typeInfraction: "AMENDE" | "SUSPENSION";
  titreFaille: string;
  articleLoi: string;
  regle: string | null;
  templateLettre: string;
  source: string | null;
  statut: "ACTIVE" | "INACTIVE" | "PROPOSEE";
  reglesDetection: Array<{ type: string; motif?: string; champ?: string }> | null;
  jurisprudence: JurisprudenceRef[] | null;
  createdAt: Date;
}

interface FaillesListProps {
  failles: FailleDto[];
  filter: string;
}

export function FaillesList({ failles, filter }: FaillesListProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/juriste"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour à la file d'attente
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        Bibliothèque des failles juridiques
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Référentiel des failles avec articles de loi et jurisprudences sourcées
        (base auto-alimentée). Les propositions (PROPOSEE) arrivent de
        l&apos;auto-alimentation ; l&apos;admin valide leur activation.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { value: "ALL", label: "Toutes" },
          { value: "ACTIVE", label: "Actives" },
          { value: "PROPOSEE", label: "Propositions" },
          { value: "INACTIVE", label: "Inactives" },
        ].map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/juriste/failles${item.value === "ALL" ? "" : `?f=${item.value}`}`}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === item.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {failles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            Aucune faille dans cette catégorie.
          </p>
        ) : (
          failles.map((faille) => {
            const [detail, setDetail] = useState(false);
            const meta = statusMeta[faille.statut] ?? {
              label: faille.statut,
              cls: "bg-zinc-100 text-zinc-500",
            };
            const jurisprudence = faille.jurisprudence ?? [];

            return (
              <article
                key={faille.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{faille.titreFaille}</h2>
                    <p className="mt-0.5 text-sm text-zinc-600">{faille.articleLoi}</p>
                    {faille.regle && (
                      <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-700">
                        <span className="font-semibold text-zinc-800">Règle dégagée : </span>
                        {faille.regle}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <span className={`rounded-full px-2.5 py-0.5 font-medium ${meta.cls}`}>
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
                          {jurisprudence.filter((j) => !j.verifiee).length > 0
                            ? ` — ${jurisprudence.filter((j) => !j.verifiee).length} non vérifiée(s)`
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
                    {faille.statut === "PROPOSEE" && jurisprudence.filter((j) => !j.verifiee).length > 0 && (
                      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Attention : {jurisprudence.filter((j) => !j.verifiee).length} référence(s) de jurisprudence{" "}
                        {jurisprudence.filter((j) => !j.verifiee).length > 1 ? "restent" : "reste"} à confirmer sur une
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
                  </div>
                </div>

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
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}