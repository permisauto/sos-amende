import Link from "next/link";
import { requireJuriste } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { synchroniserCatalogue, listerMisesAJourCatalogue } from "@/lib/auto-alimentation";
import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { getMockFailles, getMockStats, getSuspensionActiveCount } from "@/lib/mock-failles";
import { rechercherFailles } from "@/lib/failles-recherche";
import { FaillesAdmin, type FailleDto } from "../../admin/failles/failles-admin";
import { MisesAJourCatalogue } from "../../admin/failles/mises-a-jour-catalogue";
import { FaillesList } from "./FaillesList";

/** Libellé lisible d'une campagne d'auto-alimentation (`veille-dila:JADE`…). */
function libelleCampagne(campagne: string): string {
  if (campagne.startsWith("veille-dila:")) return `Veille DILA — ${campagne.slice(12)}`;
  const labels: Record<string, string> = {
    catalogue: "Catalogue des failles",
    "veille-jorf": "Veille JORF (éditions)",
    "auto-enrichissement": "Auto-enrichissement IA (post-OCR)",
  };
  return labels[campagne] ?? campagne;
}

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function BibliothequeFaillesPage(
  props: PageProps<"/dashboard/juriste/failles">,
) {
  const user = await requireJuriste();
  await synchroniserCatalogue().catch((e) => {
    console.error("bibliothèque: synchroniserCatalogue fail (DB down)", e);
  });
  const { f, q } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "ALL";
  const filter = ["ACTIVE", "INACTIVE", "PROPOSEE", "ALL"].includes(raw)
    ? raw
    : "ALL";
  const recherche = (typeof q === "string" ? q : "").trim().slice(0, 100);

  let failles: Awaited<ReturnType<typeof getMockFailles>>;
  let stats: Array<{ statut: string; _count: number }>;
  let aSuspensionActive = false;

  try {
    const [rows, grouped] = await Promise.all([
      prisma.failleJuridique.findMany({
        orderBy: [{ statut: "asc" }, { createdAt: "desc" }],
      }),
      prisma.failleJuridique.groupBy({
        by: ["statut"],
        _count: { _all: true },
      }),
    ]);
    failles = rows.map((r) => ({
      id: r.id,
      typeInfraction: r.typeInfraction as "AMENDE" | "SUSPENSION",
      titreFaille: r.titreFaille,
      articleLoi: r.articleLoi,
      regle: r.regle,
      templateLettre: r.templateLettre,
      source: r.source,
      statut: r.statut,
      reglesDetection: r.reglesDetection as RegleDetection[] | null,
      jurisprudence: r.jurisprudence as JurisprudenceRef[] | null,
      createdAt: r.createdAt,
    }));
    stats = ["ACTIVE", "PROPOSEE", "INACTIVE"].map((s) => ({
      statut: s,
      _count:
        grouped.find((g) => g.statut === s)?._count._all ?? 0,
    }));
    aSuspensionActive = rows.some(
      (r) => r.typeInfraction === "SUSPENSION" && r.statut === "ACTIVE",
    );
  } catch (e) {
    console.error("bibliothèque: DB indisponible, fallback mock", e);
    failles = getMockFailles("ALL");
    stats = getMockStats();
    aSuspensionActive = getSuspensionActiveCount() > 0;
  }

  // Transparence de l'auto-alimentation : publications en attente de relecture
  // + dernières campagnes (cron ou manuelles). Masqués si la DB est en rade —
  // la bibliothèque reste consultable.
  let nbSourcesNouvelles = 0;
  let campagnes: Array<{
    id: string;
    campagne: string;
    statut: string;
    traitees: number;
    nouvelles: number;
    detail: string | null;
    createdAt: Date;
  }> = [];
  try {
    const [n, traces] = await Promise.all([
      prisma.sourceJuridique.count({ where: { statut: "NOUVEAU" } }),
      prisma.autoAlimentationTrace.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    nbSourcesNouvelles = n;
    campagnes = traces;
  } catch {
    // Rien à afficher : le bandeau et l'encart disparaissent.
  }

  if (filter !== "ALL") {
    failles = failles.filter((f) => f.statut === filter);
  }
  const nbTotalRecherche = failles.length;
  if (recherche) {
    failles = rechercherFailles(failles, recherche);
  }

  const nbActives = stats.find((x) => x.statut === "ACTIVE")?._count ?? 0;
  const nbProposees = stats.find((x) => x.statut === "PROPOSEE")?._count ?? 0;
  const isAdmin = user.role === "ADMIN";
  // Option B : écarts entre le catalogue sourcé et les failles déjà en base
  // (vide si rien n'a changé ou si la DB est indisponible).
  const ecartsCatalogue = isAdmin ? await listerMisesAJourCatalogue() : [];

  const dto: FailleDto[] = failles.map((f) => ({
    id: f.id,
    typeInfraction: f.typeInfraction,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi,
    regle: f.regle,
    templateLettre: f.templateLettre,
    source: f.source,
    statut: f.statut,
    reglesDetection: f.reglesDetection as RegleDetection[] | null,
    jurisprudence: f.jurisprudence as JurisprudenceRef[] | null,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      {nbSourcesNouvelles > 0 && (
        <div
          data-testid="bandeau-veille"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"
        >
          <div>
            <p className="text-sm font-semibold text-sky-900">
              Veille : {nbSourcesNouvelles} nouvelle
              {nbSourcesNouvelles > 1 ? "s" : ""} source
              {nbSourcesNouvelles > 1 ? "s" : ""} à examiner
            </p>
            <p className="mt-0.5 text-xs text-sky-700">
              Publications retenues par la veille quotidienne, en attente de
              votre relecture.
            </p>
          </div>
          <Link
            href="/dashboard/juriste/veille"
            className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Ouvrir la veille
          </Link>
        </div>
      )}

      {campagnes.length > 0 && (
        <section
          data-testid="campagnes-veille"
          className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">
              Dernières campagnes d&apos;auto-alimentation
            </h2>
            <span className="text-xs text-zinc-500">
              Cron quotidiennes et actions manuelles
            </span>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100">
            {campagnes.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-zinc-800">
                    {libelleCampagne(c.campagne)}
                  </span>
                  <span
                    className={
                      c.statut === "OK"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                        : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                    }
                  >
                    {c.statut === "OK" ? "OK" : "Échec"}
                  </span>
                  <span className="text-zinc-600">
                    {c.traitees} traitée{c.traitees > 1 ? "s" : ""} →{" "}
                    {c.nouvelles} retenue{c.nouvelles > 1 ? "s" : ""}
                  </span>
                  <span className="ml-auto text-xs text-zinc-400">
                    {dateCourte.format(c.createdAt)}
                  </span>
                </div>
                {c.detail && (
                  <p className="mt-0.5 truncate text-xs text-zinc-500" title={c.detail}>
                    {c.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin ? (
        <div>
          <h1 className="text-2xl font-bold">Bibliothèque juridique</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Base unifiée des failles juridiques (base juridique + bibliothèque).
            La base s&apos;auto-alimente par synchronisation : les propositions
            (PROPOSEE) doivent être validées avant toute utilisation par le
            moteur.
          </p>

          {/* Statistiques */}
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-medium text-emerald-700">Actives</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">
                {nbActives}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Utilisées par le moteur de détection
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm font-medium text-amber-700">
                Propositions à valider
              </p>
              <p className="mt-1 text-3xl font-bold text-amber-900">
                {nbProposees}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                À lire en détail avant activation
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-medium text-zinc-500">Inactives</p>
              <p className="mt-1 text-3xl font-bold">{stats.find((s) => s.statut === "INACTIVE")?._count ?? 0}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Écartées ou désactivées
              </p>
            </div>
          </section>

          {nbProposees > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {nbProposees} proposition{nbProposees > 1 ? "s" : ""} en attente
                    de validation
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    Ouvrez « Lire en détail » pour examiner la base légale, le
                    template de lettre et les références de jurisprudence avant de
                    valider ou d&apos;écarter.
                  </p>
                </div>
                <Link
                  href="/dashboard/juriste/failles?f=PROPOSEE"
                  className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Voir les propositions
                </Link>
              </div>
            </div>
          )}
          {!aSuspensionActive && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm font-semibold text-amber-900">
                Flux « Suspension de permis » : base juridique à compléter
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Le parcours suspension est fonctionnel côté produit, mais aucun
                fondement juridique n&apos;est encore validé pour ce type. Faites
                saisir les motifs par un juriste (typeInfraction : SUSPENSION)
                avant de l&apos;activer — garde-fou : aucun article ne doit être
                inventé.
              </p>
            </div>
          )}
          <MisesAJourCatalogue ecarts={ecartsCatalogue} />
          <div className="mt-6">
            <FaillesAdmin
              failles={dto}
              filter={filter}
              q={recherche}
              nbTotal={nbTotalRecherche}
            />
          </div>
        </div>
      ) : (
        <FaillesList
          failles={failles}
          filter={filter}
          q={recherche}
          nbTotal={nbTotalRecherche}
        />
      )}
    </div>
  );
}