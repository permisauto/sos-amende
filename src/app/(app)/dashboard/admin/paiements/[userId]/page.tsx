import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storageUrl } from "@/lib/storage";
import {
  BADGES_PAIEMENT,
  statusLabels,
  statutBadge,
} from "@/lib/admin-statuts";
import { Avancement } from "@/components/avancement";
import { estOffreSuspension, PRIX_OPTION_LRAR } from "@/lib/tarifs";

export const dynamic = "force-dynamic";

const vide = (v: string | null | undefined) => (v && v.trim() ? v : "—");

function fr(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString("fr-FR");
}

function jour(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR");
}

export default async function FicheClientPaiementPage(props: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await props.params;

  const client = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      telephone: true,
      credits: true,
      role: true,
      createdAt: true,
    },
  });
  if (!client) notFound();

  const [paiements, dossiers] = await Promise.all([
    prisma.payment.findMany({
      where: { userId: client.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.dossier.findMany({
      where: { userId: client.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { failleJuridique: { select: { titreFaille: true } } },
    }),
  ]);
  const historique = await Promise.all(
    paiements.map(async (p) => ({
      ...p,
      preuveUrl: await storageUrl(p.preuveUrl),
    })),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/admin/paiements"
        className="text-sm font-medium text-zinc-500 hover:text-emerald-700"
      >
        ← Paiements
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {client.name ?? client.email}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Fiche client — identité, suivi de sa contestation et historique de
            ses virements. Consultation seule : la validation et le refus des
            virements restent dans le tableau des paiements.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {client.role === "CLIENT" ? "Client" : client.role}
        </span>
      </div>

      {/* Identité */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Identité
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">Email</dt>
            <dd className="mt-0.5 break-all font-medium">{client.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Téléphone</dt>
            <dd className="mt-0.5 font-medium">{vide(client.telephone)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Crédits</dt>
            <dd className="mt-0.5 font-medium">
              {client.credits} crédit{client.credits > 1 ? "s" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Membre depuis</dt>
            <dd className="mt-0.5 font-medium">{jour(client.createdAt)}</dd>
          </div>
        </dl>
      </section>

      {/* Suivi de la contestation (synthèse — le détail reste sur la fiche dossier) */}
      <section className="mt-6">
        <h2 className="text-lg font-bold">Suivi des dossiers</h2>
        <p className="mt-1 text-sm text-zinc-600">
          État de ses contestations. Pour le détail complet (lettre, preuves,
          timeline), ouvrez le dossier.
        </p>
        {dossiers.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-600">Aucun dossier pour le moment.</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {dossiers.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {d.type === "AMENDE" ? "Amende" : "Suspension"}
                      <span className="ml-2 text-xs text-zinc-500">
                        déposé le {jour(d.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      Faille retenue : {d.failleJuridique?.titreFaille ?? "—"}
                    </p>
                    {jour(d.dateLimite) && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Date limite de contestation : {jour(d.dateLimite)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        statutBadge[d.statut] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {statusLabels[d.statut] ?? d.statut}
                    </span>
                    <Link
                      href={`/dashboard/juriste/${d.id}`}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Ouvrir le dossier →
                    </Link>
                  </div>
                </div>
                <div className="mt-3">
                  <Avancement statut={d.statut} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historique des paiements (lecture seule) */}
      <section className="mt-8">
        <h2 className="text-lg font-bold">Historique des paiements</h2>
        {historique.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-600">Aucun virement enregistré.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Preuve</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Décision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {historique.map((p) => {
                  const badge = BADGES_PAIEMENT[p.status] ?? {
                    label: p.status,
                    classe: "bg-zinc-100 text-zinc-700",
                  };
                  const montant = Number(p.amount);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 align-top font-medium">
                        {montant}&nbsp;€
                        <p className="text-xs font-normal text-zinc-500">
                          {fr(p.createdAt)}
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
                        {p.status === "PENDING_VIREMENT" && (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
