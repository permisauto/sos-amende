import Link from "next/link";
import { requireJuriste } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { estPropositionLocale } from "@/lib/veille-ingestion";
import {
  articlesCouvertsParFaillesActives,
  sourcePreparable,
} from "@/lib/veille-ingestion";
import { prioritePrefiltre } from "@/lib/veille-prefiltre";
import { VeilleList, type SourceDto } from "./veille-list";

/**
 * Veille juridique : publications officielles DILA remontées par le cron et
 * retenues pour leur pertinence avec la contestation d'amendes routières.
 *
 * Ces publications sont des **sources**, pas des failles. Le juriste les lit,
 * les écarte, ou promeut l'une d'elles en proposition de faille à compléter.
 * Aucune décision juridique n'est prise automatiquement.
 */

/** Publications affichées par page (la file « À lire » peut compter des centaines d'entrées). */
const TAILLE_PAGE = 50;

export default async function VeillePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string | string[]; page?: string | string[] }>;
}) {
  const user = await requireJuriste();
  const { s, page: pageBrute } = await searchParams;
  const filtre = typeof s === "string" ? s.toUpperCase() : "NOUVEAU";
  const page = Math.max(
    1,
    Number.parseInt(typeof pageBrute === "string" ? pageBrute : "", 10) || 1,
  );
  const compteurs: Record<"NOUVEAU" | "A_VALIDER" | "PROMU" | "ECARTE", number> = {
    NOUVEAU: 0,
    A_VALIDER: 0,
    PROMU: 0,
    ECARTE: 0,
  };
  let sources: SourceDto[] = [];
  let total = 0;
  let dbOk = true;
  try {
    // Compteurs par statut : après une promotion ou un écart, la publication
    // quitte la file « À lire » — sans ce compteur, l'action passerait
    // totalement inaperçue (la carte et son message disparaissent ensemble).
    // `A_VALIDER` = propositions extraites et complètes, prêtes pour l'admin —
    // **hors secours local** (`methode: "locale"`, sans IA : aucune règle
    // dégagée, simple citation de tête souvent paraphrasant un rejet). Ces
    // propositions restent une matière à **lire manuellement** (`?s=NOUVEAU` /
    // `?s=TOUTES`) et ne doivent jamais peupler la file de validation.
    //
    // Filtre JSON : on part de la définition SQL `etat = "extrait"` et on
    // **retire** les `methode = "locale"` — la négation `not` de Prisma sur un
    // chemin JSON n'est **pas null-safe** (une proposition IA ancienne a
    // `methode` **absent** : `not "locale"` l'exclurait à tort). On soustrait
    // donc les deux comptes (égalité = fiable) et on filtre la page en
    // mémoire (`estPropositionLocale`).
    const propositionExtraite = { path: ["etat"], equals: "extrait" } as const;
    const propositionLocale = { path: ["methode"], equals: "locale" } as const;
    const where = (
      filtre === "TOUTES"
        ? {}
        : filtre === "PROMU" || filtre === "ECARTE"
          ? { statut: filtre }
          : filtre === "A_VALIDER"
            ? { statut: "NOUVEAU", proposition: propositionExtraite }
            : { statut: "NOUVEAU" }
    ) as Prisma.SourceJuridiqueWhereInput;

    const localeCount =
      filtre === "A_VALIDER"
        ? prisma.sourceJuridique.count({
            where: {
              statut: "NOUVEAU",
              AND: [
                { proposition: propositionExtraite },
                { proposition: propositionLocale },
              ],
            },
          })
        : Promise.resolve(0);

    const [rows, totalFiltre, groupes, aValider, locales] = await Promise.all([
      prisma.sourceJuridique.findMany({
        where,
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * TAILLE_PAGE,
        take: TAILLE_PAGE,
      }),
      prisma.sourceJuridique.count({ where }),
      prisma.sourceJuridique.groupBy({ by: ["statut"], _count: true }),
      prisma.sourceJuridique.count({
        where: { statut: "NOUVEAU", proposition: propositionExtraite },
      }),
      localeCount,
    ]);
    compteurs.NOUVEAU = groupes.find((g) => g.statut === "NOUVEAU")?._count ?? 0;
    // File de validation : extraits **hors secours local** (cf. commentaire
    // ci-dessus — on soustrait les `methode = "locale"`).
    compteurs.A_VALIDER = aValider - locales;
    compteurs.PROMU = groupes.find((g) => g.statut === "PROMU")?._count ?? 0;
    compteurs.ECARTE = groupes.find((g) => g.statut === "ECARTE")?._count ?? 0;
    const lignes =
      filtre === "A_VALIDER"
        ? rows.filter((r) => !estPropositionLocale(r.proposition as SourceDto["proposition"]))
        : rows;
    total = filtre === "A_VALIDER" ? totalFiltre - locales : totalFiltre;
    // Pré-filtre déterministe (Lot 1) : chaque publication affichée reçoit un
    // score de triage **mécanique** (termes du domaine, article de code cité,
    // doublon, dispositif extractible, familles, fraîcheur) — jamais une
    // conclusion juridique. C'est ce tri qui détermine l'ordre d'extraction
    // par IA (budget quotidien strict) : le juriste voit donc d'où viennent
    // les publications qui passent en premier.
    const articlesCouverts = await articlesCouvertsParFaillesActives();
    sources = lignes.map((r) => {
      const p = prioritePrefiltre(sourcePreparable(r), articlesCouverts);
      return {
        id: r.id,
        statut: r.statut,
        source: r.source,
        nature: r.nature,
        titre: r.titre,
        juridiction: r.juridiction,
        dateSource: r.dateSource ? r.dateSource.toISOString().slice(0, 10) : null,
        reference: r.reference,
        ecli: r.ecli,
        url: r.url,
        citations: Array.isArray(r.citations) ? (r.citations as string[]) : [],
        matchsCore: Array.isArray(r.matchsCore) ? (r.matchsCore as string[]) : [],
        matchsAppui: Array.isArray(r.matchsAppui) ? (r.matchsAppui as string[]) : [],
        score: r.score,
        brouillonRegle: r.brouillonRegle,
        proposition: (r.proposition as SourceDto["proposition"]) ?? null,
        archive: r.archive,
        failleId: r.failleId,
        priorite: { score: p.score, explication: p.explication },
      };
    });
  } catch (e) {
    console.error("veille: lecture des sources impossible", e);
    dbOk = false;
  }

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const lien = (n: number) =>
    `/dashboard/juriste/veille?s=${encodeURIComponent(filtre)}&page=${n}`;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Veille juridique</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Relevé automatique des publications officielles (DILA et opendata de la
        justice administrative) : tribunaux administratifs, jurisprudence
        administrative, Cour de cassation, Journal officiel. Seules les
        publications touchant la contestation d&apos;amendes routières ou la
        suspension de permis sont remontées, avec leurs passages cités.
      </p>

      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Gardez-vous de l&apos;avis juridique.</strong> Une publication
        retenue l&apos;est parce qu&apos;elle contient un terme de votre domaine,
        pas parce qu&apos;elle constitue une faille. L&apos;extraction IA propose
        les articles retenus par la juridiction et une règle dégagée,{" "}
        <strong>bornées aux verbatims du texte</strong> : un administrateur
        valide (→ proposition de faille) ou écarte. Jamais de faille active sans
        rédaction du template et activation humaines. Pour examiner chaque
        publication en détail, cliquez sur <strong>« Lire la décision »</strong>{" "}
        (bouton sur chaque carte).
      </p>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <strong>Accès restreint :</strong> Cette page n'est accessible qu'aux
        juristes (rôle <code className="font-semibold">JURISTE</code> ou
        <code className="font-semibold">ADMIN</code>). Si vous voyez ceci et
        n'êtes pas juriste, veuillez contacter l'administrateur du système.
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ["NOUVEAU", "À lire", compteurs.NOUVEAU],
          ["A_VALIDER", "À valider", compteurs.A_VALIDER],
          ["PROMU", "Promues", compteurs.PROMU],
          ["ECARTE", "Écartées", compteurs.ECARTE],
          ["TOUTES", "Toutes", null],
        ].map(([v, label, n]) => (
          <Link
            key={String(v)}
            href={`/dashboard/juriste/veille?s=${String(v)}`}
            className={`rounded-full px-3.5 py-1.5 font-semibold transition ${
              filtre === v
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {String(label)}
            {typeof n === "number" ? ` (${n})` : ""}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {dbOk ? (
          <VeilleList sources={sources} role={user.role} />
        ) : (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            Base indisponible : impossible de charger la veille.
          </p>
        )}
      </div>

      {dbOk && pages > 1 ? (
        <nav
          data-testid="pagination-veille"
          className="mt-6 flex items-center justify-between gap-3 text-xs"
        >
          {page > 1 ? (
            <Link
              href={lien(page - 1)}
              className="rounded-full border border-zinc-300 px-3.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Page {page} / {pages} — {total} publication(s)
          </span>
          {page < pages ? (
            <Link
              href={lien(page + 1)}
              className="rounded-full border border-zinc-300 px-3.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
