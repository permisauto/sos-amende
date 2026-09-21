import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";

const typeBadge: Record<string, string> = {
  AMENDE: "bg-emerald-100 text-emerald-800",
  SUSPENSION: "bg-indigo-100 text-indigo-800",
};

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Consultation (lecture seule) des lettres générées ET vérifiées par le
 * juriste (`valideLe` renseigné). Aucune action sur le dossier depuis cette
 * page : l'admin consulte, le juriste intervient.
 */
export default async function AdminLettresPage(props: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const ouvert = typeof searchParams.id === "string" ? searchParams.id : "";

  let dossiers: Array<{
    id: string;
    type: "AMENDE" | "SUSPENSION";
    statut: string;
    lettreGeneree: string | null;
    valideLe: Date | null;
    createdAt: Date;
    user: { name: string | null; email: string | null };
    failleJuridique: { titreFaille: string; articleLoi: string } | null;
  }> = [];

  try {
    dossiers = (await prisma.dossier.findMany({
      where: { lettreGeneree: { not: null }, valideLe: { not: null } },
      orderBy: { valideLe: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        failleJuridique: { select: { titreFaille: true, articleLoi: true } },
      },
    })) as typeof dossiers;
  } catch (e) {
    console.error("admin/lettres: DB indisponible", e);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lettres vérifiées</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Consultation seule des lettres générées et vérifiées par les
            juristes. Aucune modification possible ici : l&apos;intervention
            sur les dossiers reste le rôle des juristes.
          </p>
        </div>
      </div>

      {dossiers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">
            Aucune lettre vérifiée pour le moment.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Les lettres apparaissent ici une fois validées par un juriste.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Faille</th>
                <th className="px-4 py-3 font-medium">Validée le</th>
                <th className="px-4 py-3 font-medium">Statut du dossier</th>
                <th className="px-4 py-3 font-medium">Lettre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dossiers.map((item) => (
                <tr key={item.id} className="align-top hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.user.name ?? item.user.email}</p>
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
                    {item.failleJuridique?.articleLoi && (
                      <p className="text-xs text-zinc-400">
                        {item.failleJuridique.articleLoi}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.valideLe ? dateLongue.format(item.valideLe) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {item.statut}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/dashboard/admin/lettres?id=${item.id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {ouvert === item.id ? "Masquer" : "Consulter"}
                    </a>
                    {ouvert === item.id && item.lettreGeneree && (
                      <div className="mt-3 rounded-xl bg-zinc-50 p-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                          {item.lettreGeneree}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <a
                            href={`/api/dossier/${item.id}/lettre`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                          >
                            Télécharger la lettre (PDF)
                          </a>
                          <Link
                            href={`/dashboard/juriste/${item.id}`}
                            className="inline-block rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-zinc-50"
                          >
                            Dossier (lecture seule)
                          </Link>
                        </div>
                      </div>
                    )}
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