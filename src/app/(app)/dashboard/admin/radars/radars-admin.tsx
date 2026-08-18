"use client";

import { useActionState } from "react";
import { creerRadar, supprimerRadar } from "../actions";

export type RadarDto = {
  id: string;
  radarId: string;
  dateExpiration: string;
  preuveUrl: string;
};

const inputCls =
  "rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export function RadarsAdmin({ radars }: { radars: RadarDto[] }) {
  const [createState, createAction, createPending] = useActionState(
    creerRadar,
    undefined,
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">
          Enregistrer un certificat d'étalonnage
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Un radar dont le certificat était expiré le jour de l'infraction
          rend l'amende contestable (faille « certificat d'étalonnage »).
        </p>
        <form action={createAction} className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Référence radar
              </span>
              <input name="radarId" required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Date d'expiration du certificat
              </span>
              <input name="dateExpiration" type="date" required className={inputCls} />
            </label>
            <label className="col-span-full flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                URL de la preuve (certificat PDF)
              </span>
              <input name="preuveUrl" className={inputCls} />
            </label>
          </div>
          <button
            type="submit"
            disabled={createPending}
            className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {createPending ? "Enregistrement…" : "Enregistrer"}
          </button>
          {createState?.error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {createState.error}
            </p>
          )}
          {createState?.ok && (
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              Certificat enregistré.
            </p>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">
          Certificats enregistrés ({radars.length})
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Radar</th>
                <th className="px-4 py-3 font-medium">Expiration</th>
                <th className="px-4 py-3 font-medium">Preuve</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {radars.map((r) => (
                <RadarRow key={r.id} radar={r} />
              ))}
            </tbody>
          </table>
          {radars.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              Aucun certificat enregistré.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function RadarRow({ radar }: { radar: RadarDto }) {
  const [state, action, pending] = useActionState(supprimerRadar, undefined);

  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-4 py-3 font-medium">{radar.radarId}</td>
      <td className="px-4 py-3 text-zinc-600">
        {new Date(radar.dateExpiration).toLocaleDateString("fr-FR")}
      </td>
      <td className="px-4 py-3">
        {radar.preuveUrl ? (
          <a
            href={radar.preuveUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-emerald-700 hover:underline"
          >
            Voir
          </a>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-2">
          <form action={action}>
            <input type="hidden" name="id" value={radar.id} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Supprimer
            </button>
          </form>
          {state?.error && (
            <p className="text-xs text-red-600">{state.error}</p>
          )}
        </div>
      </td>
    </tr>
  );
}