import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { joursRestants } from "@/lib/moteur";
import { storageUrl } from "@/lib/storage";
import { AnalyseForm } from "./analyse-form";
import { SignaturePad } from "./signature-pad";
import { LrKit } from "./lr-kit";
import { AvocatRequest } from "./avocat-request";
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

export default async function CaseDetailPage(
  props: PageProps<"/dashboard/cases/[id]">,
) {
  const user = await requireUser();
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const item = await prisma.dossier.findFirst({
    where: { id, userId: user.id },
    include: {
      courriers: true,
      failleJuridique: true,
      lawyerMatch: true,
      preuves: { orderBy: { createdAt: "asc" } },
      evenements: { orderBy: { createdAt: "asc" } },
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

  const pvUrl = await storageUrl(item.pvUrl);
  const isImage = pvUrl?.match(/\.(jpe?g|png|webp)(\?.*)?$/i);
  const courrier = item.courriers[item.courriers.length - 1];
  const pdfUrl = await storageUrl(courrier?.pdfUrl ?? null);
  const signatureUrl = await storageUrl(courrier?.signatureUrl ?? null);
  const preuveEtalonnage =
    typeof item.extractedData === "object" &&
    item.extractedData !== null &&
    "preuveEtalonnage" in item.extractedData
      ? await storageUrl(String(item.extractedData.preuveEtalonnage))
      : null;
  const evenements = await Promise.all(
    item.evenements.map(async (e) => ({
      ...e,
      detailUrl: e.detail ? await storageUrl(e.detail) : null,
    })),
  );
  const restants = joursRestants(item.dateLimite);
  const deadlineUrgency =
    restants > 10
      ? { badge: "bg-emerald-100 text-emerald-800", text: `J-${restants}` }
      : restants > 0
        ? { badge: "bg-amber-100 text-amber-800", text: `Urgent : J-${restants}` }
        : {
            badge: "bg-red-100 text-red-800",
            text: "Délai dépassé — agissez immédiatement",
          };

  const data = item.extractedData as Record<string, unknown> | null;
  const numPv = typeof data?.num_pv === "string" ? data.num_pv : null;
  // La lettre n'est révélée au client qu'après l'envoi effectif de la
  // contestation (vérifiée et validée par le juriste).
  const lettreVisible = item.statut === "ENVOYE" || item.statut === "RESOLU";

  const workflow = [
    { statut: "BROUILLON", label: "Création" },
    { statut: "EN_ANALYSE", label: "Analyse" },
    { statut: "A_VERIFIER", label: "Signature" },
    { statut: "PRET", label: "Validation juriste" },
    { statut: "ENVOYE", label: "Envoi LRAR" },
    { statut: "RESOLU", label: "Résolution" },
  ];
  const currentIndex = workflow.findIndex((s) => s.statut === item.statut);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/cases"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour aux dossiers
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {item.type === "AMENDE"
            ? "Contestation d'amende"
            : "Suspension de permis"}
        </h1>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          {statusLabels[item.statut] ?? item.statut}
        </span>
      </div>

      {searchParams.envoye === "ok" && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Votre lettre a été envoyée.{" "}
          {item.type === "AMENDE"
            ? "L'OMP examinera votre requête"
            : "Le préfet examinera votre recours"}{" "}
          — pensez à conserver votre récépissé.
        </div>
      )}

      {item.type === "SUSPENSION" &&
        item.statut !== "REJETE" &&
        item.statut !== "RESOLU" &&
        item.statut !== "ANNULE" && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-semibold text-amber-900">
              Suspension de permis : délais de recours très courts
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Les recours en matière de rétention de permis sont soumis à des
              délais stricts. Agissez rapidement et, en cas de doute, faites-vous
              assister par un avocat.
            </p>
          </div>
        )}

      {item.statut === "REJETE" && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-900">
            Dossier rejeté après examen
          </h2>
          <p className="mt-1 text-sm text-red-800">
            Un juriste n&apos;a pas retenu de motif de contestation pour ce
            dossier. Motif :
          </p>
          <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-zinc-700">
            {item.motifRejet ?? "—"}
          </p>
          <p className="mt-3 text-xs text-red-700">
            Votre crédit a été rendu : vous pouvez lancer un nouveau dossier
            sans repayer.
          </p>
          <p className="mt-1 text-xs text-red-700">
            Pour toute question, contactez le support avec la référence de ce
            dossier.
          </p>
        </div>
      )}

      {item.statut === "RESOLU" && item.decisionOmp && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-emerald-900">
            {item.decisionOmp === "ACCEPTE"
              ? "Dossier résolu : votre contestation a été acceptée"
              : "Dossier résolu : votre contestation a été rejetée"}
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            {item.decisionOmp === "ACCEPTE"
              ? "L'amende a été annulée. Vous n'avez plus rien à faire."
              : "La requête a été rejetée par l'OMP. Pour toute question, contactez le support avec la référence de ce dossier."}
          </p>
          {item.decisionDetail && (
            <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-zinc-700">
              {item.decisionDetail}
            </p>
          )}
        </div>
      )}

      {item.statut !== "ANNULE" && (
        <ol className="mt-6 flex items-center gap-1 overflow-x-auto">
          {workflow.map((step, i) => {
            const reached =
              item.statut === "ERREUR_TECHNIQUE" || item.statut === "REJETE"
                ? i <= workflow.findIndex((s) => s.statut === "ENVOYE")
                : currentIndex >= 0 && i <= currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <li key={step.statut} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                    isCurrent
                      ? "bg-emerald-600 text-white"
                      : reached
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {reached && !isCurrent && (
                    <span className="font-bold">✓</span>
                  )}
                  {step.label}
                </div>
                {i < workflow.length - 1 && (
                  <span className="text-zinc-300">—</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Avis de contravention
          </h2>
          {pvUrl ? (
            isImage ? (
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
                📄 Ouvrir le PV (PDF)
              </a>
            )
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Aucun PV uploadé.</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Informations
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
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
              <div className="flex justify-between">
                <dt className="text-zinc-500">Créé le</dt>
                <dd className="font-medium">
                  {item.createdAt.toLocaleDateString("fr-FR")}
                </dd>
              </div>
            </dl>
          </div>

          {item.dateLimite && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Délai de contestation
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Date limite :{" "}
                <span className="font-medium">
                  {item.dateLimite.toLocaleDateString("fr-FR")}
                </span>
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${deadlineUrgency.badge}`}
              >
                {deadlineUrgency.text}
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Faille juridique
            </h2>
            {item.failleJuridique ? (
              <div className="mt-3">
                <p className="font-medium">{item.failleJuridique.titreFaille}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {item.failleJuridique.articleLoi}
                </p>
                {typeof item.extractedData === "object" &&
                  item.extractedData !== null &&
                  preuveEtalonnage && (
                    <a
                      href={preuveEtalonnage}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline"
                    >
                      Voir le certificat d'étalonnage
                    </a>
                  )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                En attente d'analyse par le moteur juridique.
              </p>
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
          currentUserId={user.id}
        />
      </div>

      <div className="mt-8">
        <AvocatRequest
          dossierId={item.id}
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

      {item.statut === "EN_ANALYSE" ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Analyse de votre avis de contravention
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Saisissez les informations lues sur le PV. Le moteur détecte la
            faille juridique et génère la lettre, qui sera ensuite validée par
            un juriste.
          </p>
          <div className="mt-6">
            <AnalyseForm
              dossierId={item.id}
              type={item.type}
              prefill={
                item.extractedData as {
                  nom?: string;
                  plaque?: string;
                  num_pv?: string;
                  date?: string;
                  heure?: string;
                  montant?: string;
                  numTelePaiement?: string;
                  cle?: string;
                  typeRadar?: string;
                  radarId?: string;
                  plaqueIncorrecte?: boolean;
                  paiementDejaFait?: boolean;
                  vehiculeCede?: boolean;
                  vehiculeVole?: boolean;
                  conducteurDifferent?: boolean;
                } | null
              }
            />
          </div>
        </div>
      ) : item.statut === "A_VERIFIER" && !item.lettreGeneree ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Examen par un juriste en cours
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Aucune faille juridique automatique n&apos;a été détectée pour ce
            dossier. Un juriste examine actuellement votre demande et vous
            tiendra informé. Aucune lettre ne sera générée sans base juridique
            validée.
          </p>
          <span className="mt-4 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
            En attente de l&apos;avis du juriste
          </span>
        </div>
      ) : item.statut === "A_VERIFIER" && item.lettreGeneree ? (
        <div className="mt-8 flex flex-col gap-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Signature de la lettre</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                En attente de votre signature
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Votre lettre de contestation a été préparée par notre équipe
              juridique. Elle vous sera présentée après l&apos;envoi de la
              contestation. Tracez simplement votre signature ci-dessous :
              elle sera apposée en bas de la lettre et le PDF final généré.
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 shrink-0 text-zinc-400"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-zinc-600">
                Lettre confidentielle — révélée après l&apos;envoi validé par
                un juriste.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Signature électronique</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Votre signature sera collée automatiquement en bas de la lettre
              de contestation.
            </p>
            <div className="mt-6">
              <SignaturePad dossierId={item.id} />
            </div>
          </div>
        </div>
      ) : item.statut === "PRET" && item.courriers.length > 0 ? (
        item.valideLe ? (
          <LrKit
            dossierId={item.id}
            dateLimite={item.dateLimite}
            type={item.type}
            numPv={numPv}
          />
        ) : (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Lettre signée</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                En attente de validation du juriste
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Votre lettre est signée. Un juriste la vérifie avant que vous
              puissiez transmettre votre contestation.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {signatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureUrl}
                  alt="Votre signature"
                  className="h-16 w-auto rounded-lg border border-zinc-200 bg-white p-1"
                />
              )}
            </div>
          </div>
        )
      ) : item.statut === "ENVOYE" || item.statut === "RESOLU" ? (
        <div className="mt-8 flex flex-col gap-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="font-semibold text-emerald-900">
              Contestation envoyée
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              {item.type === "AMENDE"
                ? "L'OMP examinera votre requête"
                : "Le préfet examinera votre recours"}{" "}
              — pensez à conserver votre accusé d&apos;envoi.
            </p>
          </div>
          {lettreVisible && item.lettreGeneree && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-semibold">
                Votre lettre de contestation
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Contenu de la lettre vérifiée et validée par un juriste, telle
                que transmise.
              </p>
              <div className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 p-6 text-sm leading-relaxed text-zinc-800">
                {item.lettreGeneree}
              </div>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Télécharger la lettre signée (PDF)
                </a>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">Prochaines étapes</h2>
          <p className="mt-1 text-sm text-amber-800">
            Une fois signée et validée par un juriste, votre lettre pourra être
            transmise en ligne ou en recommandé avec accusé de réception (LRAR).
          </p>
        </div>
      )}
    </div>
  );
}