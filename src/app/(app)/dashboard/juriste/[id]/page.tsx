import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { storageUrl } from "@/lib/storage";
import { JuristeActions, DecisionOmpForm } from "./juriste-actions";
import { AvocatTraitement } from "./avocat-traitement";
import { FaillesCandidates } from "./failles-candidates";
import { Preuves, type PreuveDto } from "@/components/preuves";
import { DossierTimeline } from "@/components/dossier-timeline";

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

export default async function JuristeCasePage(
  props: PageProps<"/dashboard/juriste/[id]">,
) {
  await requireJuriste();
  const params = await props.params;
  const searchParams = await props.searchParams;

  const item = await prisma.dossier.findUnique({
    where: { id: params.id },
    include: {
      courriers: true,
      failleJuridique: true,
      faillesRetenues: { include: { faille: true }, orderBy: { createdAt: "asc" } },
      lawyerMatch: true,
      preuves: { orderBy: { createdAt: "asc" } },
      evenements: { orderBy: { createdAt: "asc" } },
      user: { select: { name: true, email: true } },
    },
  });

  if (!item) notFound();

  const preuves = await Promise.all(
    item.preuves.map(async (p) => ({
      ...p,
      url: (await storageUrl(p.url)) ?? p.url,
    })),
  );
  const preuvesDto: PreuveDto[] = preuves.map((p) => ({
    id: p.id,
    nom: p.nom,
    type: p.type,
    url: p.url,
    createdAt: p.createdAt,
    userId: p.userId,
  }));

  const candidats = item.faillesRetenues.map((df) => ({
    failleId: df.failleId,
    statut: df.statut,
    titre: df.faille.titreFaille,
    articleLoi: df.faille.articleLoi,
    principale: item.failleJuridiqueId === df.failleId,
  }));

  const data = item.extractedData as Record<string, unknown> | null;
  const questionnaire = data
    ? [
        { cle: "paiementDejaFait", lib: "Amende déjà payée" },
        { cle: "vehiculeCede", lib: "Véhicule cédé avant l'infraction" },
        { cle: "vehiculeVole", lib: "Véhicule volé / plaque usurpée" },
        { cle: "conducteurDifferent", lib: "Un autre conducteur était au volant" },
        { cle: "plaqueIncorrecte", lib: "Plaque du PV différente de la mienne" },
      ]
        .filter((item) => data[item.cle] === true)
        .map((item) => item.lib)
    : [];
  const courrier = item.courriers[item.courriers.length - 1];
  const pvUrl = await storageUrl(item.pvUrl);
  const isImage = pvUrl?.match(/\.(jpe?g|png|webp)(\?.*)?$/i);
  const pdfUrl = await storageUrl(courrier?.pdfUrl ?? null);
  const evenements = await Promise.all(
    item.evenements.map(async (e) => ({
      ...e,
      detailUrl: e.detail ? await storageUrl(e.detail) : null,
    })),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/juriste"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour à la file d'attente
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {item.user.name ?? item.user.email}
        </h1>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          {statusLabels[item.statut] ?? item.statut}
        </span>
      </div>
      <p className="text-sm text-zinc-500">{item.user.email}</p>

      {(searchParams.valide === "ok" ||
        searchParams.retourne === "ok" ||
        searchParams.rejete === "ok" ||
        searchParams.decision === "ok") && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {searchParams.valide === "ok"
            ? "Lettre validée, le client peut maintenant l'envoyer (LRAR)."
            : searchParams.retourne === "ok"
              ? "Dossier retourné pour nouvelle analyse."
              : searchParams.rejete === "ok"
                ? "Dossier rejeté, le client est informé du motif."
                : "Décision OMP enregistrée, dossier résolu."}
        </div>
      )}

      {item.type === "SUSPENSION" &&
        item.statut !== "REJETE" &&
        item.statut !== "RESOLU" &&
        item.statut !== "ANNULE" && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-semibold text-amber-900">
              Suspension de permis : délais de recours très courts
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Les recours en matière de rétention de permis sont soumis à des
              délais stricts. Vérifiez les échéances et recommandez au client
              d&apos;agir rapidement (assistance d&apos;un avocat en cas de
              doute).
            </p>
          </div>
        )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Avis de contravention
          </h2>
          {item.pvUrl &&
            pvUrl &&
            (isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pvUrl}
                alt="Avis de contravention"
                className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 object-contain"
              />
            ) : (
              <a
                href={pvUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-zinc-50"
              >
                Ouvrir le PV (PDF)
              </a>
            ))}

          {courrier?.pdfUrl && pdfUrl && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Lettre signée
              </h2>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Télécharger la lettre signée (PDF)
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Données extraites
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              {data ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Numéro PV</dt>
                    <dd className="font-medium">{String(data.num_pv ?? "—")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Plaque</dt>
                    <dd className="font-medium">{String(data.plaque ?? "—")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Date</dt>
                    <dd className="font-medium">{String(data.date ?? "—")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Type</dt>
                    <dd className="font-medium">
                      {item.type === "AMENDE" ? "Amende" : "Suspension"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Prix</dt>
                    <dd className="font-medium">{item.prix.toString()} €</dd>
                  </div>
                </>
              ) : (
                <p className="text-zinc-500">Aucune donnée extraite.</p>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Contexte (questionnaire)
            </h2>
            {questionnaire.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-zinc-700">
                {questionnaire.map((lib) => (
                  <li key={lib} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    {lib}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                Aucun signalement particulier.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Failles détectées
            </h2>
            {item.failleJuridique && candidats.length === 0 ? (
              <div className="mt-3">
                <p className="font-medium">
                  {item.failleJuridique.titreFaille}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {item.failleJuridique.articleLoi}
                </p>
              </div>
            ) : (
              <FaillesCandidates dossierId={item.id} candidats={candidats} />
            )}
          </div>
        </div>
      </div>

      {item.evenements.length > 0 && (
        <div className="mt-8">
          <DossierTimeline events={evenements} />
        </div>
      )}

      <div className="mt-8">
        <Preuves
          dossierId={item.id}
          preuves={preuvesDto}
          currentUserId={null}
        />
      </div>

      <div className="mt-8">
        <AvocatTraitement
          matchId={item.lawyerMatch?.id ?? ""}
          match={
            item.lawyerMatch
              ? {
                  statut: item.lawyerMatch.statut,
                  motif: item.lawyerMatch.motif,
                  partnerName: item.lawyerMatch.partnerName,
                  partnerBarreau: item.lawyerMatch.partnerBarreau,
                  partnerEmail: item.lawyerMatch.partnerEmail,
                  note: item.lawyerMatch.note,
                }
              : null
          }
        />
      </div>

      {item.lettreGeneree && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Lettre générée</h2>
          <div className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 p-6 text-sm leading-relaxed text-zinc-800">
            {item.lettreGeneree}
          </div>
        </div>
      )}

      {item.statut === "PRET" && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Validation juriste</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Vérifiez la lettre signée puis approuvez-la : le client recevra
            son kit d&apos;envoi en recommandé avec accusé de réception (LRAR).
            Vous pouvez aussi le retourner ou le rejeter.
          </p>
          <div className="mt-5">
            <JuristeActions dossierId={item.id} />
          </div>
        </div>
      )}

      {item.statut === "A_VERIFIER" && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Rejet</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Lettre non encore signée : si aucun motif de contestation ne
            s&apos;applique, rejetez le dossier avec un motif.
          </p>
          <div className="mt-5">
            <JuristeActions dossierId={item.id} mode="rejet" />
          </div>
        </div>
      )}

      {item.statut === "ENVOYE" && (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-900">
            Dossier envoyé par le client (LRAR)
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            Le client a confirmé l&apos;envoi de sa lettre en recommandé avec
            accusé de réception. À la réception de la réponse de l&apos;OMP,
            enregistrez la décision pour clore le dossier.
          </p>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-800">
              Suivi de la décision (OMP)
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Une fois la réponse de l&apos;OMP reçue, enregistrez la décision
              pour clore le dossier (statut « Résolu ») et en informer le
              client.
            </p>
            <div className="mt-4">
              <DecisionOmpForm dossierId={item.id} />
            </div>
          </div>
        </div>
      )}

      {item.statut === "RESOLU" && item.decisionOmp && (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-900">
            Dossier résolu — décision :{" "}
            {item.decisionOmp === "ACCEPTE" ? "requête acceptée" : "requête rejetée"}
          </h2>
          {item.decisionDetail && (
            <p className="mt-2 text-sm text-emerald-800">{item.decisionDetail}</p>
          )}
        </div>
      )}
    </div>
  );
}