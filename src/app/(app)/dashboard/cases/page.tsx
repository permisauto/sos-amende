import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { PayerCta } from "@/components/payer-cta";

const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_ANALYSE: "En analyse",
  A_VERIFIER: "À vérifier",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  REJETE: "Rejeté",
  ERREUR_TECHNIQUE: "Erreur technique",
  RESOLU: "Résolu",
  ANNULE: "Annulé",
};

export default async function CasesPage() {
  const user = await requireUser();
  const isClient = user.role === "CLIENT";

  let dossiers: Awaited<ReturnType<typeof prisma.dossier.findMany>> = [];
  try {
    const effectiveUserId = user.id.startsWith("dev-")
      ? ((await prisma.user.findUnique({ where: { email: "e2e-client@test.local" }, select: { id: true } }))?.id ?? user.id)
      : user.id;
    dossiers = await prisma.dossier.findMany({
      where: { userId: effectiveUserId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Fallback mock si 0 et dev
    if (dossiers.length === 0 && user.id.startsWith("dev-")) {
      const total = await prisma.dossier.count().catch(() => 0);
      if (total > 0) {
        dossiers = (await prisma.dossier.findMany({ orderBy: { createdAt: "desc" }, take: 50 }).catch(() => [])) as never;
      }
    }
  } catch (e) {
    console.error("cases: DB indisponible, fallback mock", e);
    if (user.id.startsWith("dev-")) {
      dossiers = [
        { id: "cmtk0apw00000hcugk1udcck6", type: "AMENDE", statut: "EN_ANALYSE", createdAt: new Date(Date.now() - 86400000 * 6), prix: 39 },
        { id: "cmtk0aq4b0002hcuglu8njo5u", type: "AMENDE", statut: "A_VERIFIER", createdAt: new Date(Date.now() - 86400000 * 5), prix: 39 },
        { id: "cmtk0ar830009hcugg4ip17ca", type: "AMENDE", statut: "PRET", createdAt: new Date(Date.now() - 86400000 * 4), prix: 39 },
        { id: "cmtk0aub2000uhcuglwnrhfxz", type: "SUSPENSION", statut: "EN_ANALYSE", createdAt: new Date(Date.now() - 86400000 * 3), prix: 59 },
        { id: "cmtk0aunj000whcugh58j35e7", type: "SUSPENSION", statut: "A_VERIFIER", createdAt: new Date(Date.now() - 86400000 * 3), prix: 59 },
        { id: "cmtk0askl000jhcugj7gkzkbs", type: "AMENDE", statut: "ENVOYE", createdAt: new Date(Date.now() - 86400000 * 2), prix: 39 },
        { id: "cmtk0avnu0013hcugdkrpk2hi", type: "AMENDE", statut: "REJETE", createdAt: new Date(Date.now() - 86400000 * 7), prix: 39 },
        { id: "cmtk0aw780017hcug36o8l1t0", type: "AMENDE", statut: "RESOLU", createdAt: new Date(Date.now() - 86400000 * 8), prix: 39 },
        { id: "cmtk0axuz001ihcug4zp7yw12", type: "AMENDE", statut: "A_VERIFIER", createdAt: new Date(Date.now() - 86400000 * 1), prix: 39 },
      ] as unknown as typeof dossiers;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mes dossiers</h1>
        {isClient && user.credits > 0 ? (
          <Link
            href="/dashboard/cases/new"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Nouveau dossier
          </Link>
        ) : isClient ? (
          <PayerCta label="Payer un dossier (39 €)" />
        ) : null}
      </div>

      {isClient && user.credits < 1 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">
            Vous n&apos;avez plus de crédit : payez pour lancer un nouveau
            dossier de contestation.
          </p>
        </div>
      )}

      {dossiers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">
            {isClient ? (
              <>
                Vous n&apos;avez pas encore de dossier.{" "}
                {user.credits > 0 ? (
                  <Link href="/dashboard/cases/new" className="text-emerald-700 hover:underline">
                    Lancez votre première contestation
                  </Link>
                ) : (
                  "Payez pour lancer votre première contestation."
                )}
              </>
            ) : (
              "Aucun dossier de votre espace pour le moment."
            )}
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dossier</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dossiers.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/cases/${item.id}`} className="hover:text-emerald-700">
                      {item.type === "AMENDE" ? "Contestation d'amende" : "Suspension de permis"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.type === "AMENDE" ? "Amende" : "Suspension"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                      {statusLabels[item.statut] ?? item.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {item.createdAt.toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
