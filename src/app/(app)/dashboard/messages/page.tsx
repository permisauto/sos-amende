import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { FilInterne, type MessageInterneDto } from "./fil-interne";
import { marquerInternesLus } from "./actions";

const roleLabel: Record<string, string> = {
  ADMIN: "Administration",
  JURISTE: "Juriste",
};

/**
 * Messagerie interne admin ↔ juriste (hors dossier). Chaque fil est
 * pair-à-pair : l'admin écrit à un juriste, le juriste répond dans le même fil.
 */
export default async function MessagesInternesPage(props: {
  searchParams: Promise<{ avec?: string }>;
}) {
  const user = await requireJuriste();
  const searchParams = await props.searchParams;
  const avecRaw =
    typeof searchParams.avec === "string" ? searchParams.avec : "";

  let partenaires: Array<{ id: string; name: string | null; email: string; role: string }> = [];
  let derniersLus = new Map<string, number>();
  let messagesParPartenaire = new Map<string, MessageInterneDto[]>();
  let fil: MessageInterneDto[] = [];
  let avec: string | null = null;

  try {
    partenaires = await prisma.user.findMany({
      where: { role: { in: ["JURISTE", "ADMIN"] }, id: { not: user.id } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    if (avecRaw) {
      const valide = partenaires.some((p) => p.id === avecRaw);
      avec = valide ? avecRaw : null;
    }

    const recents = await prisma.messageInterne.findMany({
      where: {
        OR: [{ expediteurId: user.id }, { destinataireId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const nonLus = await prisma.messageInterne.groupBy({
      by: ["expediteurId"],
      where: { destinataireId: user.id, lu: false },
      _count: { _all: true },
    });
    derniersLus = new Map(nonLus.map((g) => [g.expediteurId, g._count._all]));

    // Groupe les derniers messages par interlocuteur (expéditeur ou
    // destinataire selon le sens).
    const group = new Map<string, MessageInterneDto[]>();
    for (const m of recents) {
      const autre = m.expediteurId === user.id ? m.destinataireId : m.expediteurId;
      const arr = group.get(autre) ?? [];
      arr.push({
        id: m.id,
        contenu: m.contenu,
        createdAt: m.createdAt,
        lu: m.lu,
        expediteurId: m.expediteurId,
      });
      group.set(autre, arr);
    }
    messagesParPartenaire = group;

    if (avec) {
      const list = await prisma.messageInterne.findMany({
        where: {
          OR: [
            { expediteurId: user.id, destinataireId: avec },
            { expediteurId: avec, destinataireId: user.id },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
      fil = list.map((m) => ({
        id: m.id,
        contenu: m.contenu,
        createdAt: m.createdAt,
        lu: m.lu,
        expediteurId: m.expediteurId,
      }));
      // Marque comme lus les messages reçus dès l'ouverture du fil.
      await marquerInternesLus(avec);
    }
  } catch (e) {
    console.error("messages internes: DB indisponible", e);
  }

  const dateCourte = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "numeric",
  }).format;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Messages</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Messagerie interne entre l&apos;administration et les juristes.
        {user.role === "ADMIN"
          ? " Écrivez à un juriste pour coordonner le traitement des dossiers."
          : " Répondez aux messages de l'administration."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Liste des conversations */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="font-semibold">
              {user.role === "ADMIN" ? "Juristes" : "Administration"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {partenaires.length} fil
              {partenaires.length > 1 ? "s" : ""}
            </p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {partenaires.map((p) => {
              const msgs = messagesParPartenaire.get(p.id) ?? [];
              const dernier = msgs[0];
              const nonLus = derniersLus.get(p.id) ?? 0;
              const actif = avec === p.id;
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/messages?avec=${p.id}`}
                    className={`flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50 ${
                      actif ? "bg-emerald-50" : ""
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
                      {(p.name ?? p.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-zinc-900">
                          {p.name ?? p.email}
                        </span>
                        {nonLus > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            {nonLus}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="truncate">
                          {dernier
                            ? `${dernier.expediteurId === user.id ? "Vous : " : ""}${dernier.contenu}`
                            : "Aucun message"}
                        </span>
                        {dernier && (
                          <span className="shrink-0">
                            {dateCourte(dernier.createdAt)}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Fil actif */}
        <div className="lg:col-span-2">
          {avec ? (
            (() => {
              const partenaire = partenaires.find((p) => p.id === avec)!;
              return (
                <FilInterne
                  destinataireId={partenaire.id}
                  destinataireNom={partenaire.name ?? partenaire.email}
                  messages={fil}
                  currentUserId={user.id}
                />
              );
            })()
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-16 text-center">
              <p className="text-zinc-600">
                Sélectionnez un interlocuteur pour ouvrir la conversation.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {roleLabel[user.role] ?? "Équipe"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}