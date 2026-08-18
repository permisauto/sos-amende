"use client";

import { useActionState, useState } from "react";
import { ajouterPreuve, supprimerPreuve } from "@/app/(app)/dashboard/preuves/actions";

export type PreuveDto = {
  id: string;
  nom: string;
  type: string;
  url: string;
  createdAt: Date;
  userId: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  CARTE_GRISE: "Carte grise",
  PLAINTE: "Récépissé de plainte",
  PHOTO: "Photo du véhicule",
  CERTIFICAT: "Certificat",
  AUTRE: "Autre pièce",
};

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
}: {
  dossierId: string;
  preuves: PreuveDto[];
  currentUserId: string | null;
}) {
  const [state, action, pending] = useActionState(ajouterPreuve, undefined);
  const [delState, delAction, delPending] = useActionState(
    supprimerPreuve,
    undefined,
  );
  const [opened, setOpened] = useState(false);

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
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Ouvrir
                </a>
                {currentUserId && p.userId === currentUserId && (
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
              <select name="type" defaultValue="AUTRE" className={inputCls}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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