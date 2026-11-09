import { requireAdmin } from "@/lib/dal";
import {
  chargerDeriveFiltre,
  chargerEfficaciteFailles,
  chargerFunnel,
} from "@/lib/pilotage";

export const metadata = { title: "Pilotage — SOS Amende" };

/**
 * Cockpit de pilotage (Pilier 5) — lecture seule, réservée à l'ADMIN :
 *  - le funnel des dossiers (détection → validation → envoi → décision) ;
 *  - l'efficacité des failles (résultats OMP réels) ;
 *  - la dérive du filtre de veille (publications écartées à la main).
 *
 * Aucune action ici : c'est un tableau de bord d'observation.
 */
export default async function PilotagePage() {
  await requireAdmin();

  const [funnel, efficacite, derive] = await Promise.all([
    chargerFunnel(),
    chargerEfficaciteFailles(),
    chargerDeriveFiltre(),
  ]);

  const etapes = [
    { label: "En analyse", valeur: funnel.enAnalyse },
    { label: "Payés", valeur: funnel.payes },
    { label: "À valider", valeur: funnel.aValider },
    { label: "En attente signature", valeur: funnel.enAttenteSignature },
    { label: "Envoyés", valeur: funnel.envoyes },
    { label: "Résolus", valeur: funnel.resolus },
  ];
  const maxEtape = Math.max(1, ...etapes.map((e) => e.valeur));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Pilotage</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Indicateurs de santé du produit (lecture seule), actualisés à chaque
        consultation.
      </p>

      {/* Funnel des dossiers */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Funnel des dossiers
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {funnel.total} dossier{funnel.total > 1 ? "s" : ""} au total ·{" "}
          {funnel.rejetes} rejeté{funnel.rejetes > 1 ? "s" : ""} · {funnel.clôtures} clôturé
          {funnel.clôtures > 1 ? "s" : ""}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {etapes.map((e) => (
            <div key={e.label} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-sm text-zinc-600">{e.label}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round((e.valeur / maxEtape) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold text-zinc-800">
                {e.valeur}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Efficacité des failles */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Efficacité des failles (résultats OMP observés)
        </h2>
        {efficacite.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Aucune faille active n&apos;a encore de dossier tranché.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 font-medium">Faille</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 text-right font-medium">Gagnés</th>
                <th className="py-2 text-right font-medium">Perdus</th>
                <th className="py-2 text-right font-medium">Taux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {efficacite.map((f) => (
                <tr key={f.failleId}>
                  <td className="py-2 text-zinc-800">{f.titre}</td>
                  <td className="py-2 text-zinc-500">
                    {f.typeInfraction === "SUSPENSION" ? "Suspension" : "Amende"}
                  </td>
                  <td className="py-2 text-right text-emerald-700">{f.gagnes}</td>
                  <td className="py-2 text-right text-red-700">{f.perdus}</td>
                  <td className="py-2 text-right text-zinc-700">
                    {f.taux === null
                      ? "—"
                      : `${Math.round(f.taux * 100)} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Dérive du filtre de veille */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Dérive du filtre de veille
        </h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700">
            Écartées à la main : {derive.ecartees}
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
            Promues : {derive.promues}
          </span>
          <span className="rounded-full border border-zinc-300 px-3 py-1 font-semibold text-zinc-600">
            Non lues : {derive.nouvelles}
          </span>
        </div>
        {derive.tauxEcart !== null && derive.tauxEcart > 0.75 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Alerte :</strong> {Math.round(derive.tauxEcart * 100)} % des
            publications relues sont écartées à la main — le filtre de pertinence
            laisse probablement passer trop de hors-sujet. Recalibrez{" "}
            <code className="font-semibold">MOTS_CLES_EXCLUS</code> / les poids
            dans <code className="font-semibold">veille-perteinence.ts</code>.
          </p>
        )}
      </section>
    </div>
  );
}