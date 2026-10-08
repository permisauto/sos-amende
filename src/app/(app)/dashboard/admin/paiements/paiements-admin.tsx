"use client";

import Link from "next/link";
import { useActionState } from "react";
import { validerVirement, refuserVirement } from "../actions";
import { estOffreSuspension, PRIX_OPTION_LRAR } from "@/lib/tarifs";
import { BADGES_PAIEMENT } from "@/lib/admin-statuts";
import { AvancementPaiement } from "@/components/avancement";

type Paiement = {
  id: string;
  userId: string;
  amount: unknown;
  status: string;
  kind: string;
  optionLrar: boolean;
  createdAt: Date;
  valideLe: Date | null;
  refuseLe: Date | null;
  refusMotif: string | null;
  preuveUrl?: string | null;
  preuveNom?: string | null;
  preuveUploadedAt?: Date | null;
  user: { email: string; name: string | null; telephone: string | null };
};

const vide = (v: string | null | undefined) => v && v.trim() ? v : "—";

function fr(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString("fr-FR");
}

export function PaiementsAdmin({
  paiements,
  filtre,
  q,
}: {
  paiements: Paiement[];
  filtre?: string;
  q?: string;
}) {
  const [valState, valAction, valPending] = useActionState(
    validerVirement,
    undefined,
  );
  const [refState, refAction, refPending] = useActionState(
    refuserVirement,
    undefined,
  );

  const messages = (
    <>
      {(valState?.error || refState?.error) && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {valState?.error ?? refState?.error}
        </p>
      )}
      {(valState?.ok || refState?.ok) && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Action effectuée.
        </p>
      )}
    </>
  );

  if (paiements.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {messages}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">
            {q
              ? `Aucun paiement pour « ${q} » dans ce filtre.`
              : filtre === "REFUSES"
                ? "Aucun virement refusé."
                : filtre === "VALIDES"
                  ? "Aucun virement validé."
                  : "Aucun virement en attente. Les demandes de virement apparaissent ici après « Valider et recevoir le RIB »."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages}
      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Preuve</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Décision</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {paiements.map((p) => {
              const badge = BADGES_PAIEMENT[p.status] ?? {
                label: p.status,
                classe: "bg-zinc-100 text-zinc-700",
              };
              const enAttente = p.status === "PENDING_VIREMENT";
              const montant = Number(p.amount);
              return (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/dashboard/admin/paiements/${p.userId}`}
                      className="font-medium hover:text-emerald-700"
                    >
                      {p.user.name ?? p.user.email}
                    </Link>
                    <p className="text-xs text-zinc-600">{p.user.email}</p>
                    <p className="text-xs text-zinc-500">
                      {vide(p.user.telephone)}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p>{p.kind === "AMENDE" ? "Amende" : "Suspension"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {estOffreSuspension(p.kind, montant) && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                          Offre Suspension &amp; Invalidation
                        </span>
                      )}
                      {p.optionLrar && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                          LRAR +{PRIX_OPTION_LRAR}&nbsp;€
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top font-medium">
                    {montant}&nbsp;€
                    <p className="text-xs font-normal text-zinc-500">
                      {fr(p.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.preuveUrl ? (
                      <a
                        href={p.preuveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-emerald-700 underline"
                      >
                        {p.preuveNom ?? "Voir la preuve"}
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400">Aucune</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <AvancementPaiement status={p.status} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classe}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-zinc-600">
                    {p.status === "PAID" && (
                      <span>
                        Validé
                        {fr(p.valideLe) ? ` le ${fr(p.valideLe)}` : ""}
                      </span>
                    )}
                    {p.status === "REFUSED" && (
                      <span>
                        Refusé
                        {fr(p.refuseLe) ? ` le ${fr(p.refuseLe)}` : ""}
                        <span className="mt-0.5 block text-red-700">
                          {p.refusMotif ?? ""}
                        </span>
                      </span>
                    )}
                    {enAttente && <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {enAttente ? (
                      <div className="flex flex-col items-end gap-2">
                        <form action={valAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            disabled={valPending || refPending}
                            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {valPending ? "..." : "Valider → +1 crédit"}
                          </button>
                        </form>
                        <form
                          action={refAction}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            name="motif"
                            required
                            minLength={3}
                            maxLength={200}
                            aria-label="Motif du refus"
                            placeholder="Motif du refus"
                            className="w-40 rounded-full border border-red-200 px-3 py-1.5 text-xs focus:border-red-400 focus:outline-none"
                          />
                          <button
                            disabled={valPending || refPending}
                            className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            Refuser
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
