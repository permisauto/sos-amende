"use client";

import { useActionState } from "react";
import {
  confirmerDepotClient,
  type DepotAssisteState,
} from "../actions";
import type { InfractionType } from "@/lib/envoi";

const PORTAL_URL: Record<string, string> = {
  ANTAI: "https://usagers.antai.gouv.fr/demarches/saisienumero",
  TELERECOURS: "https://citoyens.telerecours.fr",
};

/**
 * Bloc dépôt assisté (espace client) : le client authentifié dépose
 * lui-même sa contestation sur le portail officiel (ANTAI/Télérecours), puis
 * marque le dossier avec le bouton « J'ai déposé » — le passage ENVOYE est
 * atomique (delta commun avec la page /recours/finaliser).
 */
export function DepotAssiste({
  dossierId,
  canal,
  type,
  numRef,
  plaque,
  dateLimite,
}: {
  dossierId: string;
  canal: string;
  type: InfractionType;
  numRef: string | null;
  plaque: string | null;
  dateLimite?: Date | null;
}) {
  const [state, action, pending] = useActionState<DepotAssisteState, FormData>(
    confirmerDepotClient,
    undefined,
  );
  const web = type === "SUSPENSION" ? "Télérecours" : "ANTAI";

  if (state?.ok) {
    return (
      <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-900">
          Dépôt enregistré
        </h2>
        <p className="mt-2 text-sm text-green-800">
          Merci ! Votre contestation est marquée comme déposée auprès du
          service compétent. Vous recevrez un e-mail avec le suivi de la
          décision.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-emerald-900">
          Contestation validée — à déposer sur le portail officiel
        </h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Prête pour le dépôt
        </span>
      </div>
      <p className="mt-2 text-sm text-emerald-800">
        Votre lettre de contestation a été vérifiée et validée par un juriste.
        Déposez-la sur le portail officiel {web} puis marquez le dossier&nbsp;:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-emerald-800">
        <li>
          Cliquez sur le bouton ci-dessous pour ouvrir le portail {web}
          {numRef ? (
            <>
              {" "}
              et saisissez le numéro{" "}
              <strong>{type === "SUSPENSION" ? "de la décision" : "de l'avis de contravention"}</strong>{" "}
              {numRef}
            </>
          ) : null}
          {plaque ? (
            <>
              {" "}
              (plaque <strong>{plaque}</strong>)
            </>
          ) : null}
          .
        </li>
        <li>
          Déposez votre lettre et les pièces jointes. Pour une infraction
          relevée par radar, vérifiez si une consignation est exigée avant de
          déposer.
        </li>
        <li>
          Revenez ici et cliquez sur « J&apos;ai déposé ma contestation » : nous
          enregistrons la transmission et suivons la décision pour vous.
        </li>
        {dateLimite && (
          <li>
            Délai de contestation : à respecter avant le{" "}
            <strong>{dateLimite.toLocaleDateString("fr-FR")}</strong>.
          </li>
        )}
      </ol>
      <div className="mt-4 flex flex-col gap-3">
        <a
          href={PORTAL_URL[canal] ?? PORTAL_URL.ANTAI}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Ouvrir le portail officiel ({web})
        </a>
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="dossierId" value={dossierId} />
          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "Confirmation…" : "J’ai déposé ma contestation"}
          </button>
        </form>
      </div>
    </div>
  );
}