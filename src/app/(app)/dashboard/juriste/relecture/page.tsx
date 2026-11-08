import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { RelueButton } from "./relue-button";

const TYPE_LABEL: Record<string, string> = {
  AMENDE: "Amende",
  SUSPENSION: "Suspension",
};

/**
 * Console juriste unifiée — onglet « Contenu juridique ».
 *
 * File de relecture du contenu que le juriste doit valider **en temps réel** :
 *  - les failles ACTIVE qui n'ont pas encore été relues (`reluLe` nul) — le
 *    contenu (article + règle dégagée + template) attend sa relecture avant
 *    lancement public (risque n°4 du PLAN) ;
 *  - les jurisprudences non vérifiées (`verifiee: false`) portées par ces
 *    failles — à confirmer sur Légifrance/Judilibre, sinon à retirer.
 *
 * Aucune décision n'est automatisée : « Marquer comme relue » trace seulement
 * la relecture humaine (qui, quand). L'activation/désactivation reste dans la
 * bibliothèque juridique.
 */
export default async function RelecturePage() {
  await requireJuriste();

  const [aRelire, relues] = await Promise.all([
    prisma.failleJuridique.findMany({
      where: { statut: "ACTIVE", reluLe: null },
      orderBy: [{ typeInfraction: "asc" }, { createdAt: "asc" }],
    }),
    prisma.failleJuridique.count({
      where: { statut: "ACTIVE", reluLe: { not: null } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Console juriste — Contenu juridique</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Relisez le contenu des failles actives (article, règle dégagée, modèle de
        lettre) avant diffusion. Votre relecture est horodatée et tracée.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-amber-100 px-3.5 py-1.5 font-semibold text-amber-800">
          À relire ({aRelire.length})
        </span>
        <span className="rounded-full border border-zinc-300 px-3.5 py-1.5 font-semibold text-zinc-600">
          Relues ({relues})
        </span>
      </div>

      {aRelire.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-12 text-center">
          <p className="text-emerald-800">
            Tout le contenu juridique actif a été relu. ✅
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {aRelire.map((f) => {
            const jurisprudence = (Array.isArray(f.jurisprudence)
              ? f.jurisprudence
              : []) as Array<{ verifiee?: boolean; reference?: string }>;
            const nonVerifiees = jurisprudence.filter((j) => j.verifiee !== true);
            return (
              <article
                key={f.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                        {TYPE_LABEL[f.typeInfraction] ?? f.typeInfraction}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        à relire
                      </span>
                      {nonVerifiees.length > 0 && (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                          {nonVerifiees.length} jurisprudenc
                          {nonVerifiees.length > 1 ? "es" : "e"} à vérifier
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 font-semibold text-zinc-900">
                      {f.titreFaille}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">{f.articleLoi}</p>
                  </div>
                  <RelueButton failleId={f.id} />
                </div>

                <p className="mt-3 text-xs font-semibold text-zinc-800">
                  Règle dégagée
                </p>
                <p className="mt-0.5 text-sm text-zinc-700">
                  {f.regle || "—"}
                </p>

                {nonVerifiees.length > 0 && (
                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3">
                    <p className="text-xs font-semibold text-red-800">
                      Jurisprudences non vérifiées (à confirmer sur
                      Légifrance/Judilibre) :
                    </p>
                    <ul className="mt-1 space-y-1 text-xs text-red-700">
                      {nonVerifiees.map((j, i) => (
                        <li key={i}>{j.reference ?? "référence manquante"}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}