"use client";

import { useActionState } from "react";
import { analyserDossier } from "../actions";
import {
  dateRefLibelle,
  numeroRefLibelle,
  titreAnalyse,
  type InfractionType,
} from "@/lib/envoi";

export type AnalysePrefill = {
  nom?: string;
  plaque?: string;
  num_pv?: string;
  date?: string;
  heure?: string;
  montant?: string;
  numTelePaiement?: string;
  cle?: string;
  typeRadar?: string;
  radarId?: string;
  adresse?: string;
  lieu?: string;
  prefecture?: string;
  duree?: string;
  motif?: string;
  plaqueIncorrecte?: boolean;
  paiementDejaFait?: boolean;
  vehiculeCede?: boolean;
  vehiculeVole?: boolean;
  conducteurDifferent?: boolean;
};

export function AnalyseForm({
  dossierId,
  prefill,
  type,
}: {
  dossierId: string;
  prefill?: AnalysePrefill | null;
  type: InfractionType;
}) {
  const [state, formAction, pending] = useActionState(
    analyserDossier,
    undefined,
  );
  const hasPrefill = !!prefill && Object.keys(prefill).length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="dossierId" value={dossierId} />

      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
        {hasPrefill ? (
          <>
            Les champs ont été <strong>pré-remplis par lecture automatique
            (OCR)</strong> {titreAnalyse(type)}. Vérifiez-les avant de
            valider : ils sont ensuite relus par un juriste (vérification
            humaine obligatoire).
          </>
        ) : (
          <>
            Aucun pré-remplissage automatique n&apos;a été détecté (qualité du scan ou champ manquant) — saisissez les informations lues {titreAnalyse(type)} : elles seront vérifiées avant toute génération de lettre (vérification humaine obligatoire).
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Nom</span>
          <input
            name="nom"
            required
            defaultValue={prefill?.nom}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Adresse {type === "SUSPENSION" ? "(titulaire / préfecture)" : "(titulaire)"} — vérifiable</span>
          <input
            name="adresse"
            placeholder="12 rue de Paris, 75001 Paris"
            defaultValue={prefill?.adresse}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Lieu {type === "SUSPENSION" ? "de la rétention" : "de l'infraction"}</span>
          <input
            name="lieu"
            placeholder={type === "SUSPENSION" ? "Route D123, Préfecture de ..." : "Avenue, ville, département"}
            defaultValue={prefill?.lieu}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Plaque {type === "SUSPENSION" ? "(si mentionnée)" : ""}</span>
          <input
            name="plaque"
            required={type === "AMENDE"}
            defaultValue={prefill?.plaque}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            {numeroRefLibelle(type)}
          </span>
          <input
            name="num_pv"
            required
            defaultValue={prefill?.num_pv}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            {dateRefLibelle(type)}
          </span>
          <input
            type="date"
            name="date"
            required
            defaultValue={prefill?.date}
            className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        {type === "AMENDE" ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Heure</span>
              <input
                name="heure"
                placeholder="14h32"
                defaultValue={prefill?.heure}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Montant</span>
              <input
                name="montant"
                placeholder="135,00 €"
                defaultValue={prefill?.montant}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Type de radar
              </span>
              <input
                name="typeRadar"
                placeholder="Radar fixe / mobile"
                defaultValue={prefill?.typeRadar}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                N° du radar
              </span>
              <input
                name="radarId"
                placeholder="Réf. du radar (si visible)"
                defaultValue={prefill?.radarId}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                N° de télépaiement
              </span>
              <input
                name="numTelePaiement"
                defaultValue={prefill?.numTelePaiement}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Clé</span>
              <input
                name="cle"
                defaultValue={prefill?.cle}
                className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Préfecture émettrice</span>
              <input name="prefecture" placeholder="Préfecture de…" defaultValue={prefill?.prefecture} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Durée de suspension</span>
              <input name="duree" placeholder="6 mois" defaultValue={prefill?.duree} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Motif</span>
              <input name="motif" placeholder="alcool / stupéfiants / vitesse" defaultValue={prefill?.motif} className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
          </>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="plaqueIncorrecte"
          defaultChecked={prefill?.plaqueIncorrecte}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
        />
        La plaque indiquée sur le PV n'est pas la mienne
      </label>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <p className="text-sm font-semibold text-zinc-700">
          Contexte (questionnaire ciblé)
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Ces informations aident le juriste à vérifier le bien-fondé du
          recours. Elles sont transmises avec le dossier.
        </p>
        {type === "AMENDE" ? (
          <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="paiementDejaFait"
              defaultChecked={prefill?.paiementDejaFait}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            J'ai déjà payé cette amende
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="vehiculeCede"
              defaultChecked={prefill?.vehiculeCede}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Mon véhicule a été cédé avant la date de l'infraction
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="vehiculeVole"
              defaultChecked={prefill?.vehiculeVole}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Mon véhicule était volé ou sa plaque usurpée à cette date
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="conducteurDifferent"
              defaultChecked={prefill?.conducteurDifferent}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            Un autre conducteur était au volant
          </label>
        </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-600">
            Le questionnaire ciblé (paiement, cession, vol, conducteur)
            s&apos;applique aux amendes. Pour une suspension de permis, le
            juriste examinera les motifs de la décision à partir des
            informations saisies.
          </p>
        )}
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Analyse en cours…" : "Analyser et générer la lettre"}
      </button>
    </form>
  );
}