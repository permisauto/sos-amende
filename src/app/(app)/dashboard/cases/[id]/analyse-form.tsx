"use client";

import { useActionState } from "react";
import { analyserDossier } from "../actions";
import { questionsPour } from "@/lib/questions";
import { libellePreuve } from "@/lib/preuve-labels";
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
  adresseIncorrecte?: boolean;
  travaux_présents?: boolean;
  conditions_meteo?: string;
  stationnementPanneau?: boolean;
  stationnementGene?: boolean;
  stationnementTicket?: boolean;
  stationnementLieu?: boolean;
  suspNotifIrreguliere?: boolean;
  suspDelaiNotification?: boolean;
  suspMotifsAbsents?: boolean;
  suspObservations?: boolean;
  suspEthylometreCarnet?: boolean;
  suspSecondSouffle?: boolean;
  suspRefereEngage?: boolean;
};

export function AnalyseForm({
  dossierId,
  prefill,
  type,
  pvTexte,
}: {
  dossierId: string;
  prefill?: AnalysePrefill | null;
  type: InfractionType;
  pvTexte?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    analyserDossier,
    undefined,
  );
  const hasPrefill = !!prefill && Object.keys(prefill).length > 0;
  // Questions conditionnées à la nature du document scanné (et aux champs
  // saisis : motif, lieu) — jamais aux règles des failles (groupe vide
  // impossible).
  const groupes = questionsPour({
    type,
    texte: [pvTexte, prefill?.motif, prefill?.lieu]
      .filter(Boolean)
      .join("\n"),
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="dossierId" value={dossierId} />

      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
        {hasPrefill ? (
          <>
            Les champs ont été <strong>pré-remplis par lecture automatique
            </strong> {titreAnalyse(type)}. Vérifiez-les avant de
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
          Questions sur votre situation
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Les groupes affichés dépendent du contenu {titreAnalyse(type)} scanné
          : ils apportent un contexte que le juriste vérifie. Aucune case
          cochée ne fabrique un motif de contestation automatique.
        </p>
        {groupes.map((groupe) => (
          <div key={groupe.groupe} className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {groupe.groupe}
            </p>
            <div className="mt-2 flex flex-col gap-2.5">
              {groupe.questions.map((q) => (
                <div key={q.cle}>
                  <label className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name={q.cle}
                      defaultChecked={Boolean(prefill?.[q.champ])}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {q.libelle}
                  </label>
                  {q.preuveClient && (
                    <p className="ml-6 mt-1 text-xs text-amber-700">
                      Cette réponse appelle un document :{" "}
                      <strong>{libellePreuve(q.preuveClient)}</strong> — vous
                      pourrez le joindre juste après l&apos;analyse, sur la
                      fiche de votre dossier (facultatif : le dossier n&apos;est
                      pas bloqué sans lui).
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
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