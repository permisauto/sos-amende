"use client";

import { useActionState } from "react";
import { envoyerDossier } from "../actions";
import {
  delaiLibelle,
  destinataireLrar,
  pieceAJoindre,
  portailEnLigne,
  type InfractionType,
} from "@/lib/envoi";

/**
 * Kit d'envoi (Option A v1 + guide en ligne) : la lettre validée par le
 * juriste est transmise par le client, soit en ligne via le portail officiel
 * (ANTAI pour les amendes, Télérecours pour les suspensions), soit par
 * recommandé avec accusé de réception. Le contenu de la lettre n'est révélé
 * au client qu'après l'envoi effectif de la contestation.
 */
export function LrKit({
  dossierId,
  dateLimite,
  type,
  numPv,
}: {
  dossierId: string;
  dateLimite?: Date | null;
  type: InfractionType;
  numPv?: string | null;
}) {
  const [state, formAction, pending] = useActionState(envoyerDossier, undefined);
  const portail = portailEnLigne(type);

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Kit d'envoi — lettre validée</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Prêt pour l'envoi
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Votre contestation a été vérifiée et validée par un juriste. Transmettez
        votre lettre — la plus simple est de la déposer en ligne :
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          Ouvrez le portail officiel :{" "}
          <a
            href={portail.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-700 hover:underline"
          >
            {portail.label}
          </a>
          .
        </li>
        <li>
          Saisissez le numéro
          {numPv ? (
            <>
              {" "}
              <strong>{numPv}</strong>
            </>
          ) : (
            ""
          )}{" "}
          et vos informations, puis choisissez « contester ».
        </li>
        <li>
          Reprenez les motifs de contestation préparés par nos juristes et
          joignez les pièces justificatives ({" "}
          {pieceAJoindre(type)} et tout justificatif : certificat de cession,
          dépôt de plainte, etc.).
        </li>
        <li>
          Vous pouvez aussi transmettre en <strong>recommandé avec accusé de
          réception</strong> (LRAR) {destinataireLrar(type)}.
        </li>
        {dateLimite && (
          <li>
            Votre envoi doit être effectué avant le{" "}
            <strong>{dateLimite.toLocaleDateString("fr-FR")}</strong> (
            {delaiLibelle(type)}).
          </li>
        )}
        <li>Conservez l'accusé : il fait foi de la date d'envoi.</li>
      </ol>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="dossierId" value={dossierId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "J'ai envoyé ma contestation"}
        </button>
        <p className="mt-2 text-xs text-zinc-500">
          Confirmez uniquement une fois la contestation réellement transmise.
          La lettre vous sera alors révélée dans votre espace.
        </p>
        {state?.error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}