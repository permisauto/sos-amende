import Link from "next/link";
import { requireJuriste } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { VeilleList, type SourceDto } from "./veille-list";

/**
 * Veille juridique : publications officielles DILA remontées par le cron et
 * retenues pour leur pertinence avec la contestation d'amendes routières.
 *
 * Ces publications sont des **sources**, pas des failles. Le juriste les lit,
 * les écarte, ou promeut l'une d'elles en proposition de faille à compléter.
 * Aucune décision juridique n'est prise automatiquement.
 */
export default async function VeillePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string | string[] }>;
}) {
  const user = await requireJuriste();
  const { s } = await searchParams;
  const filtre = typeof s === "string" ? s.toUpperCase() : "NOUVEAU";
  const compteurs: Record<"NOUVEAU" | "PROMU" | "ECARTE", number> = {
    NOUVEAU: 0,
    PROMU: 0,
    ECARTE: 0,
  };
  let sources: SourceDto[] = [];
  let dbOk = true;
  try {
    // Compteurs par statut : après une promotion ou un écart, la publication
    // quitte la file « À lire » — sans ce compteur, l'action passerait
    // totalement inaperçue (la carte et son message disparaissent ensemble).
    const [rows, groupes] = await Promise.all([
      prisma.sourceJuridique.findMany({
        where:
          filtre === "TOUTES"
            ? {}
            : filtre === "PROMU" || filtre === "ECARTE"
              ? { statut: filtre }
              : { statut: "NOUVEAU" },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.sourceJuridique.groupBy({ by: ["statut"], _count: true }),
    ]);
    compteurs.NOUVEAU = groupes.find((g) => g.statut === "NOUVEAU")?._count ?? 0;
    compteurs.PROMU = groupes.find((g) => g.statut === "PROMU")?._count ?? 0;
    compteurs.ECARTE = groupes.find((g) => g.statut === "ECARTE")?._count ?? 0;
    sources = rows.map((r) => ({
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
    }));
  } catch (e) {
    console.error("veille: lecture des sources impossible", e);
    dbOk = false;
  }

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
        rédaction du template et activation humaines.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ["NOUVEAU", "À lire", compteurs.NOUVEAU],
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
    </div>
  );
}
