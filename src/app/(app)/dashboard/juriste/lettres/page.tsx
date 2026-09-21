import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";

const typeBadge: Record<string, string> = {
  AMENDE: "bg-emerald-100 text-emerald-800",
  SUSPENSION: "bg-indigo-100 text-indigo-800",
};

export default async function LettresBibliothequePage() {
  await requireJuriste();

  let dossiers: Array<{
    id: string;
    type: "AMENDE" | "SUSPENSION";
    statut: string;
    lettreGeneree: string | null;
    createdAt: Date;
    valideLe: Date | null;
    user: { name: string | null; email: string | null };
    failleJuridique: { titreFaille: string } | null;
  }> = [];
  try {
    dossiers = await prisma.dossier.findMany({
      where: { lettreGeneree: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        failleJuridique: { select: { titreFaille: true } },
      },
    });
  } catch (e) {
    console.error("juriste/lettres: DB indisponible", e);
  }

  const dateLongue = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/juriste"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Retour à la vue d&apos;ensemble
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        Bibliothèque des lettres générées
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Toutes les lettres de contestation générées par le moteur (base
        auto-alimentée par les dossiers). Ouvrez un dossier pour relire,
        corriger ou valider une lettre.
      </p>

      {dossiers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">Aucune lettre générée pour le moment.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Faille</th>
                <th className="px-4 py-3 font-medium">Validation</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dossiers.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/juriste/${item.id}`}
                      className="font-medium hover:text-emerald-700"
                    >
                      {item.user.name ?? item.user.email}
                    </Link>
                    <p className="text-xs text-zinc-500">{item.user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        typeBadge[item.type] ?? "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {item.type === "AMENDE" ? "Amende" : "Suspension"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.failleJuridique?.titreFaille ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {item.valideLe ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        Validée
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        À valider
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {dateLongue.format(item.createdAt)}
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