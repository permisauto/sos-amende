import Link from "next/link";

/**
 * Champ de recherche de la bibliothèque juridique (admin + juriste).
 * Formulaire GET : le mot vit dans l'URL (`?q=`), comme le filtre `?f=`
 * existant — partageable, survit au rechargement, aucun JavaScript requis.
 */
export function RechercheFailles({
  q,
  filter,
  nb,
  nbTotal,
}: {
  q: string;
  filter: string;
  nb: number;
  nbTotal: number;
}) {
  const effacerHref = buildFaillesHref(filter, "");
  return (
    <div className="flex flex-col gap-2">
      <form
        method="get"
        action="/dashboard/juriste/failles"
        className="flex flex-wrap gap-2"
        role="search"
      >
        {filter !== "ALL" && <input type="hidden" name="f" value={filter} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher : titre, article, règle, jurisprudence…"
          aria-label="Rechercher dans la bibliothèque"
          className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="submit"
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Rechercher
        </button>
        {q && (
          <Link
            href={effacerHref}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
          >
            Effacer
          </Link>
        )}
      </form>
      {q && (
        <p className="text-sm text-zinc-600">
          <strong>{nb}</strong> faille{nb === 1 ? "" : "s"} pour
          «&nbsp;{q}&nbsp;»
          {nbTotal !== nb ? ` (sur ${nbTotal})` : ""}
        </p>
      )}
    </div>
  );
}

/** Construit l'URL de la bibliothèque en conservant `f` et/ou `q`. */
export function buildFaillesHref(filter: string, q: string): string {
  const params = new URLSearchParams();
  if (filter && filter !== "ALL") params.set("f", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return `/dashboard/juriste/failles${qs ? `?${qs}` : ""}`;
}
