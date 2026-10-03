"use client";

import { useActionState, useState } from "react";
import { ajouterPreuve, supprimerPreuve } from "@/app/(app)/dashboard/preuves/actions";
import type { PreuveSuggestionClient } from "@/lib/questions";

export type PreuveDto = {
  id: string;
  nom: string;
  type: string;
  url: string;
  createdAt: Date;
  userId: string | null;
  contexte?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  CARTE_GRISE: "Carte grise",
  PLAINTE: "Récépissé de plainte",
  PHOTO: "Photo du véhicule",
  CERTIFICAT: "Certificat",
  RELEVE_PAIEMENT: "Relevé de paiement",
  ATTESTATION_CESSION: "Attestation de cession",
  ATTESTATION_VOL: "Attestation de vol",
  AUTRE: "Autre pièce",
  METEO: "Météo (source externe)",
  RADAR: "Fiche radar (donnée officielle)",
  TRAVAUX: "Travaux (source OpenData)",
};

/** Types toujours proposés dans le sélecteur. Les pièces suggérées par le
 * questionnaire (relevé de paiement, cession, vol) n'y figurent que si une
 * réponse les appelle — le sélecteur reste court. */
const TYPES_TELEVERSABLES = ["CARTE_GRISE", "PLAINTE", "PHOTO", "CERTIFICAT", "AUTRE"];

const inputCls =
  "rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

/**
 * Pièces justificatives (preuves) d'un dossier : téléversement par le client
 * ou le juriste + liste des pièces existantes. Le bouton de suppression
 * (RGPD) n'apparaît que pour l'auteur de la pièce.
 */
export function Preuves({
  dossierId,
  preuves,
  currentUserId,
  canDeleteAll = false,
  suggestions = [],
}: {
  dossierId: string;
  preuves: PreuveDto[];
  currentUserId: string | null;
  canDeleteAll?: boolean;
  /** Pièces attendues d'après les réponses du questionnaire (capteur de fait). */
  suggestions?: PreuveSuggestionClient[];
}) {
  const [state, action, pending] = useActionState(ajouterPreuve, undefined);
  const [delState, delAction, delPending] = useActionState(
    supprimerPreuve,
    undefined,
  );
  const [opened, setOpened] = useState(false);
  const [typeChoisi, setTypeChoisi] = useState<string>("AUTRE");
  const optionsTypes = Array.from(
    new Set([...TYPES_TELEVERSABLES, ...suggestions.map((s) => s.type)]),
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Pièces justificatives (preuves)</h2>
        <button
          type="button"
          onClick={() => setOpened((v) => !v)}
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          {opened ? "Fermer" : "Ajouter une pièce"}
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Carte grise, récépissé de plainte, photos du véhicule, certificat… Les
        pièces jointes étayent la contestation.
      </p>

      {suggestions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {suggestions.map((s) => (
            <li
              key={s.type}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Pièce utile à joindre : {TYPE_LABELS[s.type] ?? s.type}
                </p>
                <p className="text-xs text-emerald-800">
                  Réponse cochée : « {s.raison} »
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTypeChoisi(s.type);
                  setOpened(true);
                }}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Ajouter cette pièce
              </button>
            </li>
          ))}
        </ul>
      )}

      {preuves.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Aucune pièce jointe.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {preuves.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
            >
              <div>
                <p className="font-medium">{p.nom}</p>
                <p className="text-xs text-zinc-500">
                  {TYPE_LABELS[p.type] ?? p.type} ·{" "}
                  {p.createdAt.toLocaleDateString("fr-FR")}
                </p>
                {p.contexte && (
                  <p className="mt-1 text-xs text-emerald-700">
                    {p.contexte}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Ouvrir
                  </a>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                    Récupérée
                  </span>
                )}
                {(canDeleteAll || (currentUserId && p.userId === currentUserId)) && (
                  <form action={delAction}>
                    <input type="hidden" name="preuveId" value={p.id} />
                    <button
                      type="submit"
                      disabled={delPending}
                      className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {delState?.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {delState.error}
        </p>
      )}

      {opened && (
        <form action={action} className="mt-5 flex flex-col gap-4 border-t border-zinc-100 pt-5">
          <input type="hidden" name="dossierId" value={dossierId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Type de pièce</span>
              <select
                name="type"
                value={typeChoisi}
                onChange={(e) => setTypeChoisi(e.target.value)}
                className={inputCls}
              >
                {optionsTypes.map((value) => (
                  <option key={value} value={value}>
                    {TYPE_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Nom de la pièce (optionnel)
              </span>
              <input
                name="nom"
                placeholder="Carte grise recto-verso"
                className={inputCls}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Fichier</span>
            <input
              type="file"
              name="fichier"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Ajouter la pièce"}
          </button>
          {state?.error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              Pièce ajoutée.
            </p>
          )}
        </form>
      )}
    </div>
  );
}