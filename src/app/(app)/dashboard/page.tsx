import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { joursRestants } from "@/lib/moteur";
import { PayerCta } from "@/components/payer-cta";

export default async function DashboardPage() {
  const user = await requireUser();

  // Le paiement (amende/suspension) ne concerne que le client : les espaces
  // juriste et admin atterrissent directement sur leur propre tableau de bord.
  if (user.role !== "CLIENT") {
    redirect(
      user.role === "JURISTE"
        ? "/dashboard/juriste"
        : "/dashboard/admin/failles",
    );
  }

  const [caseCount, openCases, credits, dossiersProches] = await Promise.all([
    prisma.dossier.count({ where: { userId: user.id } }),
    prisma.dossier.count({
      where: {
        userId: user.id,
        statut: { notIn: ["RESOLU", "ANNULE", "REJETE"] },
      },
    }),
    Promise.resolve(user.credits),
    prisma.dossier.findMany({
      where: {
        userId: user.id,
        dateLimite: { not: null },
        statut: { notIn: ["RESOLU", "ANNULE", "REJETE"] },
      },
      orderBy: { dateLimite: "asc" },
      take: 5,
    }),
  ]);

  const firstName = user.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";

  return (
    <div>
      <h1 className="text-3xl font-bold">
        Bonjour{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-2 text-zinc-600">
        Gérez vos contestations d'amendes et la défense de votre permis.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 p-6">
          <p className="text-sm font-medium text-zinc-500">Dossiers</p>
          <p className="mt-2 text-3xl font-bold">{caseCount}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-6">
          <p className="text-sm font-medium text-zinc-500">Échéances à traiter</p>
          <p className="mt-2 text-3xl font-bold">{openCases}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-6">
          <p className="text-sm font-medium text-zinc-500">Crédits</p>
          <p className="mt-2 text-3xl font-bold">{credits}</p>
        </div>
      </div>

      {credits === 0 && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">
            Plus de crédit disponible
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Payez pour lancer un nouveau dossier de contestation d&apos;amende
            (39 €) ou un recours contre une suspension de permis (59 €). Le
            paiement est d&apos;abord, le dossier ensuite.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PayerCta label="Payer un dossier d'amende (39 €)" />
            <PayerCta
              type="SUSPENSION"
              label="Payer un recours suspension (59 €)"
            />
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard/cases"
          className="rounded-full bg-emerald-600 px-6 py-3 text-center font-semibold text-white hover:bg-emerald-700"
        >
          Voir mes dossiers
        </Link>
        <Link
          href="/dashboard/parametres"
          className="rounded-full border border-zinc-300 px-6 py-3 text-center font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Gérer mon compte
        </Link>
        {credits > 0 && (
          <Link
            href="/dashboard/cases/new"
            className="rounded-full bg-emerald-600 px-6 py-3 text-center font-semibold text-white hover:bg-emerald-700"
          >
            Nouveau dossier
          </Link>
        )}
      </div>

      <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold">Échéances proches</h2>
        {dossiersProches.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Aucun délai à surveiller pour le moment.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-zinc-100">
            {dossiersProches.map((d) => {
              const restants = joursRestants(d.dateLimite);
              const label =
                restants > 10
                  ? { text: `J-${restants}`, cls: "bg-emerald-100 text-emerald-800" }
                  : restants > 0
                    ? { text: `Urgent J-${restants}`, cls: "bg-amber-100 text-amber-800" }
                    : {
                        text: "Délai dépassé",
                        cls: "bg-red-100 text-red-800",
                      };
              return (
                <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <Link
                      href={`/dashboard/cases/${d.id}`}
                      className="font-medium text-zinc-900 hover:text-emerald-700"
                    >
                      {d.type === "AMENDE" ? "Contestation d'amende" : "Suspension de permis"}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      Limite :{" "}
                      {d.dateLimite?.toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${label.cls}`}
                  >
                    {label.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
