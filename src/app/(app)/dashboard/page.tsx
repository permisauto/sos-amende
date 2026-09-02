export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { joursRestants } from "@/lib/moteur";
import { Suspense } from "react";
import { PayerCta } from "@/components/payer-cta";
import { DashboardCheckoutBanner } from "@/components/dashboard-checkout-banner";

const MOCK_NOW = new Date("2026-07-15T12:00:00Z").getTime();

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

  let caseCount = 0, openCases = 0, dossiersProches: Array<{ id: string; type: string; dateLimite: Date | null }> = [], dernierDossier: { id: string; statut: string; type: string; createdAt: Date } | null = null;
  try {
    // En mode dev (?dev=1) avec mock user dev-..., on affiche les dossiers de e2e-client pour la démo
    const effectiveUserId = user.id.startsWith("dev-") ? (await prisma.user.findUnique({ where: { email: "e2e-client@test.local" }, select: { id: true } }))?.id ?? user.id : user.id;
    [caseCount, openCases, dossiersProches, dernierDossier] = await Promise.all([
      prisma.dossier.count({ where: { userId: effectiveUserId } }),
      prisma.dossier.count({ where: { userId: effectiveUserId, statut: { notIn: ["RESOLU", "ANNULE", "REJETE"] } } }),
      prisma.dossier.findMany({ where: { userId: effectiveUserId, dateLimite: { not: null }, statut: { notIn: ["RESOLU", "ANNULE", "REJETE"] } }, orderBy: { dateLimite: "asc" }, take: 4 }),
      prisma.dossier.findFirst({ where: { userId: effectiveUserId }, orderBy: { createdAt: "desc" }, select: { id: true, statut: true, type: true, createdAt: true } }),
    ]);
    // Si toujours 0 et qu'on est en dev, on force un fallback visuel avec les 7 dossiers inventés (comptés via count sans filtre)
    if (caseCount === 0 && user.id.startsWith("dev-")) {
      const total = await prisma.dossier.count().catch(() => 0);
      if (total > 0) {
        const all = await prisma.dossier.findMany({ orderBy: { createdAt: "desc" }, take: 4, select: { id: true, statut: true, type: true, createdAt: true, dateLimite: true } }).catch(() => []);
        if (all.length > 0) {
          caseCount = total;
          openCases = all.filter((d) => !["RESOLU", "ANNULE", "REJETE"].includes(d.statut)).length;
          dossiersProches = all.filter((d) => d.dateLimite).slice(0, 4) as never;
          dernierDossier = all[0] as never;
        }
      }
    }
  } catch (e) {
    console.error("dashboard: DB indisponible, fallback mock", e);
    if (user.id.startsWith("dev-")) {
      caseCount = 9;
      openCases = 6;
      dernierDossier = { id: "cmtk0aw780017hcug36o8l1t0", statut: "RESOLU", type: "AMENDE", createdAt: new Date(MOCK_NOW) } as never;
      dossiersProches = [
        { id: "cmtk0apw00000hcugk1udcck6", type: "AMENDE", dateLimite: new Date(MOCK_NOW + 86400000 * 25) },
        { id: "cmtk0aq4b0002hcuglu8njo5u", type: "AMENDE", dateLimite: new Date(MOCK_NOW + 86400000 * 10) },
        { id: "cmtk0ar830009hcugg4ip17ca", type: "AMENDE", dateLimite: new Date(MOCK_NOW + 86400000 * 5) },
      ] as never;
    }
  }

  const firstName = user.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";
  const credits = user.credits;

  const statutLibelle: Record<string, string> = {
    EN_ANALYSE: "En analyse",
    A_VERIFIER: "À signer",
    PRET: "Prêt pour l'envoi",
    ENVOYE: "Envoyé",
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Suspense>
        <DashboardCheckoutBanner />
      </Suspense>
      {/* Hero */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 px-8 py-10 text-white shadow-sm">
        <p className="text-sm font-medium text-emerald-100">
          {credits > 0 ? `${credits} crédit${credits > 1 ? "s" : ""} disponible${credits > 1 ? "s" : ""}` : "Aucun crédit disponible"}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Bonjour{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 max-w-xl text-emerald-50">
          Contester une amende ou un retrait de permis n&apos;a jamais été aussi
          simple : téléversez votre PV, nos juristes préparent votre lettre,
          vous signez, nous la vérifions — vous l&apos;envoyez.
        </p>
        <p className="mt-3 max-w-xl text-xs text-emerald-100/90">
          Analyse gratuite : déposez votre PV, scan + scoring offerts. Vous ne payez (39&nbsp;€ / 59&nbsp;€, Stripe ou virement) que si une faille est validée.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/cases/new"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M10 12.5a.75.75 0 01-.75-.75V7.81L8.03 9.03a.75.75 0 01-1.06-1.06l2.5-2.5a.75.75 0 011.06 0l2.5 2.5a.75.75 0 01-1.06 1.06l-1.22-1.22v3.94a.75.75 0 01-.75.75z" />
              <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
            Téléverser un PV — gratuit
          </Link>
          {openCases > 0 && (
            <Link
              href="/dashboard/cases"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20"
            >
              Voir mes {openCases} dossier{openCases > 1 ? "s" : ""} en cours
            </Link>
          )}
        </div>
      </section>

      {/* Statistiques */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-500">Dossiers</p>
              <p className="text-2xl font-bold">{caseCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-500">En cours</p>
              <p className="text-2xl font-bold">{openCases}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-500">Crédits</p>
              <p className="text-2xl font-bold">{credits}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dernier dossier / prochaines étapes */}
      {dernierDossier && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                Dernier dossier
              </p>
              <p className="mt-0.5 font-semibold">
                {dernierDossier.type === "AMENDE"
                  ? "Contestation d'amende"
                  : "Recours suspension de permis"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                {statutLibelle[dernierDossier.statut] ?? dernierDossier.statut}
              </span>
              <Link
                href={`/dashboard/cases/${dernierDossier.id}`}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Suivre mon dossier
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Comment ça marche */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold">Comment ça marche ?</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1", "Téléversez votre PV", "Photo ou scan de votre avis de contravention ou décision de suspension."],
            ["2", "Nous analysons", "OCR + moteur juridique : détection automatique de la faille et génération de la lettre."],
            ["3", "Vous signez", "Signature électronique dans votre espace, la lettre est préparée et vérifiée par un juriste."],
            ["4", "Vous envoyez", "Kit d'envoi complet (LRAR ou téléservice) et suivi jusqu'à la décision."],
          ].map(([n, t, d]) => (
            <li
              key={n}
              className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {n}
              </span>
              <p className="mt-3 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-zinc-600">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Échéances proches */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Échéances proches</h2>
          {caseCount > 0 && (
            <Link
              href="/dashboard/cases"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Tous mes dossiers
            </Link>
          )}
        </div>
        {dossiersProches.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            Aucun délai à surveiller pour le moment.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100">
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
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div>
                    <Link
                      href={`/dashboard/cases/${d.id}`}
                      className="font-medium text-zinc-900 hover:text-emerald-700"
                    >
                      {d.type === "AMENDE"
                        ? "Contestation d'amende"
                        : "Suspension de permis"}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      Limite : {d.dateLimite?.toLocaleDateString("fr-FR")}
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
      </section>
    </div>
  );
}
