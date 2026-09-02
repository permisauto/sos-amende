import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { storageUrl } from "@/lib/storage";
import { JuristeActions, DecisionOmpForm } from "./juriste-actions";
import { LettreEdition } from "./lettre-edition";
import { AvocatTraitement } from "./avocat-traitement";
import { FaillesCandidates } from "./failles-candidates";
import { Preuves, type PreuveDto } from "@/components/preuves";
import { DossierTimeline } from "@/components/dossier-timeline";
import {
  BibliothequeJuriste,
  type FailleBibliotheque,
  type RefJurisprudentielle,
} from "@/components/bibliotheque-juriste";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { organismeEnvoi } from "@/lib/envoi";

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

const statutChip: Record<string, { label: string; cls: string }> = {
  A_VERIFIER: {
    label: "À corriger avant envoi",
    cls: "bg-amber-100 text-amber-800",
  },
  PRET: { label: "Signée — à valider", cls: "bg-emerald-100 text-emerald-800" },
  ENVOYE: {
    label: "Envoyée (ANTAI/Télérecours)",
    cls: "bg-blue-100 text-blue-800",
  },
  RESOLU: { label: "Résolu", cls: "bg-emerald-100 text-emerald-800" },
  REJETE: { label: "Rejetée", cls: "bg-red-100 text-red-700" },
  EN_ANALYSE: { label: "En analyse", cls: "bg-zinc-100 text-zinc-600" },
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function JuristeCasePage(
  props: PageProps<"/dashboard/juriste/[id]">,
) {
  await requireJuriste();
  const params = await props.params;
  const searchParams = await props.searchParams;

  let item: Record<string, any> | null = null;
  try {
    item = (await prisma.dossier.findUnique({
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
    })) as unknown as Record<string, any> | null;
  } catch (e) {
    console.error("juriste/[id]: DB indisponible", e);
  }

  if (!item) {
    // Fallback mock pour dev sans DB
    const mockUser = { name: "Test Client", email: "test-client@sos-amende.fr" };
    item = {
      id: params.id,
      type: "AMENDE",
      statut: "PRET",
      pvUrl: "/uploads/demo-pv.jpg",
      pvTexte: "PV de démo",
      extractedData: { plaque: "AB-123-CD", num_pv: params.id.slice(0, 8), date: "2026-07-10", adresse: "12 RUE DE LA PAIX 75001 PARIS", lieu: "A6" },
      lettreGeneree: "À l'attention de l'Officier du Ministère Public,\nJe soussigné TEST CLIENT conteste l'avis n° " + params.id.slice(0, 8) + ".\nFondement : Prescription — Art. 133-3 CPP\n...",
      prix: 39,
      dateLimite: new Date(Date.now() + 86400000 * 20),
      createdAt: new Date(),
      failleJuridique: { id: "faille-prescription-1-an", titreFaille: "Prescription 1 an", articleLoi: "Art. 133-3 CPP", statut: "ACTIVE", regle: "Prescription", jurisprudence: [] },
      faillesRetenues: [],
      lawyerMatch: null,
      preuves: [],
      evenements: [{ type: "CREATION", detail: "Dossier de démo", createdAt: new Date(), detailUrl: null }],
      courriers: [{ pdfUrl: "/uploads/demo-lettre.pdf", preuveDepotUrl: null, signatureUrl: "/uploads/demo-signature.png" }],
      user: mockUser,
    } as unknown as Record<string, any>;
  }

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
  const accuseUrl = await storageUrl(courrier?.preuveDepotUrl ?? null);
  const evenements = await Promise.all(
    item.evenements.map(async (e) => ({
      ...e,
      detailUrl: e.detail ? await storageUrl(e.detail) : null,
    })),
  );

  // Bibliothèque juridique dynamique — résiliente si DB down
  let bibliotheque: Awaited<ReturnType<typeof prisma.failleJuridique.findMany>> = [];
  try {
    bibliotheque = await prisma.failleJuridique.findMany({
      where: { statut: { in: ["ACTIVE", "PROPOSEE"] } },
      orderBy: [{ statut: "asc" }, { createdAt: "desc" }],
    });
  } catch (e) {
    console.error("juriste bibliotheque: DB indisponible, fallback vide", e);
  }
  const toRefs = (j: unknown): RefJurisprudentielle[] =>
    ((j as JurisprudenceRef[]) ?? []).map((x) => ({
      reference: x.reference,
      juridiction: x.juridiction ?? null,
      date: x.date ?? null,
      url: x.url ?? null,
      verifiee: x.verifiee,
      resume: x.resume ?? null,
    }));
  const failleRetenue: FailleBibliotheque | null = item.failleJuridique
    ? {
        id: item.failleJuridique.id,
        titreFaille: item.failleJuridique.titreFaille,
        articleLoi: item.failleJuridique.articleLoi,
        statut: item.failleJuridique.statut,
        regle: item.failleJuridique.regle,
        jurisprudence: toRefs(item.failleJuridique.jurisprudence),
      }
    : null;
  const bibliothequeDto: FailleBibliotheque[] = bibliotheque.map((f) => ({
    id: f.id,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi,
    statut: f.statut,
    regle: f.regle,
    jurisprudence: toRefs(f.jurisprudence),
  }));

  const dateLimite = item.dateLimite
    ? dateFormat.format(item.dateLimite)
    : null;

  const envoiEvent = evenements.find((e) => e.type === "ENVOI");

  const editable = item.statut === "A_VERIFIER" || item.statut === "PRET";
  const chip = statutChip[item.statut] ?? {
    label: statusLabels[item.statut] ?? item.statut,
    cls: "bg-zinc-100 text-zinc-600",
  };
  const lettreAccroche =
    item.statut === "A_VERIFIER"
      ? "Lettre générée par le moteur, à relire et corriger avant la signature du client."
      : item.statut === "PRET"
        ? `Lettre signée par le client. Corrigez si nécessaire (la signature est recollée automatiquement), puis approuvez l'envoi — la contestation sera transmise à ${organismeEnvoi(item.type)}.`
        : `Lettre de contestation transmise à ${organismeEnvoi(item.type)} pour ce dossier.`;

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/dashboard/juriste"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour à la file d&apos;attente
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">
              {item.user.name ?? item.user.email}
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {statusLabels[item.statut] ?? item.statut}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
              {item.type === "AMENDE" ? "Amende" : "Suspension de permis"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{item.user.email}</p>
        </div>
        {dateLimite && (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Date limite de contestation
            </p>
            <p className="mt-1 text-lg font-bold text-zinc-900">{dateLimite}</p>
            <p className="text-xs font-medium text-zinc-500">
              Respectez ce délai pour la transmission
            </p>
          </div>
        )}
      </div>

      {searchParams.valide === "ok" &&
        (searchParams.envoye === "ok" ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Lettre validée et contestation envoyée à{" "}
            {organismeEnvoi(item.type)} (lettre + pièces jointes). Accusé de
            dépôt enregistré.
          </div>
        ) : searchParams.envoi === "echec" ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Lettre validée, mais l&apos;envoi à {organismeEnvoi(item.type)} a
            échoué. Relancez l&apos;envoi ci-dessous ou laissez le client
            transmettre sa contestation par LRAR (kit d&apos;envoi).
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Lettre validée, le client peut maintenant transmettre sa
            contestation (en ligne ou par LRAR).
          </div>
        ))}

      {(searchParams.envoye === "ok" && searchParams.valide !== "ok") ||
      searchParams.retourne === "ok" ||
      searchParams.rejete === "ok" ||
      searchParams.decision === "ok" ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {searchParams.envoye === "ok" && searchParams.valide !== "ok"
            ? `Contestation envoyée à ${organismeEnvoi(item.type)} (lettre + pièces jointes).`
            : searchParams.retourne === "ok"
              ? "Dossier retourné pour nouvelle analyse."
              : searchParams.rejete === "ok"
                ? "Dossier rejeté, le client est informé du motif."
                : "Décision OMP enregistrée, dossier résolu."}
        </div>
      ) : null}

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

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Colonne principale — la lettre, objet du travail du juriste */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-emerald-50/70 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Lettre de contestation</h2>
                <p className="mt-0.5 text-sm text-zinc-600">{lettreAccroche}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chip.cls}`}>
                {chip.label}
              </span>
            </div>
            <div className="p-6">
              {editable ? (
                <>
                  {item.lettreGeneree ? (
                    <LettreEdition
                      dossierId={item.id}
                      lettre={item.lettreGeneree}
                      signee={item.statut === "PRET"}
                    />
                  ) : (
                    <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      Aucune lettre générée pour ce dossier (aucun fondement
                      juridique applicable). Le dossier est soumis à votre
                      examen : rejetez-le avec un motif si nécessaire.
                    </p>
                  )}
                  {item.statut === "PRET" && courrier?.pdfUrl && pdfUrl && (
                    <div className="mt-5 border-t border-zinc-100 pt-5">
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-xl border border-emerald-200 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Télécharger la lettre signée (PDF)
                      </a>
                    </div>
                  )}
                  <div className="mt-6 border-t border-zinc-100 pt-6">
                    {item.statut === "PRET" ? (
                      <JuristeActions
                        dossierId={item.id}
                        validee={Boolean(item.valideLe)}
                        organisme={organismeEnvoi(item.type)}
                      />
                    ) : (
                      <JuristeActions dossierId={item.id} mode="rejet" />
                    )}
                  </div>
                </>
              ) : (
                <>
                  {item.lettreGeneree && (
                    <div className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-6 text-sm leading-relaxed text-zinc-800">
                      {item.lettreGeneree}
                    </div>
                  )}
                  {courrier?.pdfUrl && pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Télécharger la lettre (PDF)
                    </a>
                  )}
                </>
              )}
            </div>
          </section>

          {item.statut === "ENVOYE" && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h2 className="font-semibold text-emerald-900">
                Dossier envoyé — contestation transmise
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                La contestation (lettre + pièces jointes) a été transmise à{" "}
                {organismeEnvoi(item.type)} — ou confirmée en recommandé avec
                accusé de réception par le client. À la réception de la réponse
                de l&apos;OMP, enregistrez la décision pour clore le dossier.
              </p>

              {envoiEvent?.detail && (
                <p className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm text-emerald-800">
                  {envoiEvent.detail}
                </p>
              )}

              {accuseUrl && (
                <a
                  href={accuseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Télécharger l&apos;accusé de dépôt (PDF)
                </a>
              )}

              <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6">
                <h3 className="font-semibold text-zinc-800">
                  Suivi de la décision (OMP)
                </h3>
                <p className="mt-1 text-sm text-zinc-600">
                  Une fois la réponse de l&apos;OMP reçue, enregistrez la
                  décision pour clore le dossier (statut « Résolu ») et en
                  informer le client.
                </p>
                <div className="mt-4">
                  <DecisionOmpForm dossierId={item.id} />
                </div>
              </div>
            </section>
          )}

          {item.statut === "RESOLU" && item.decisionOmp && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h2 className="font-semibold text-emerald-900">
                Dossier résolu — décision :{" "}
                {item.decisionOmp === "ACCEPTE"
                  ? "requête acceptée"
                  : "requête rejetée"}
              </h2>
              {item.decisionDetail && (
                <p className="mt-2 text-sm text-emerald-800">
                  {item.decisionDetail}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Colonne latérale — références et contexte de vérification */}
        <div className="flex flex-col gap-6">
          <BibliothequeJuriste
            failleRetenue={failleRetenue}
            bibliotheque={bibliothequeDto}
          />

          {candidats.length > 0 && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Failles détectées — à confirmer ou écarter
              </h2>
              <div className="mt-3">
                <FaillesCandidates dossierId={item.id} candidats={candidats} />
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Données du dossier
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
                    <dt className="text-zinc-500">Prix</dt>
                    <dd className="font-medium">{item.prix.toString()} €</dd>
                  </div>
                </>
              ) : (
                <p className="text-zinc-500">Aucune donnée extraite.</p>
              )}
            </dl>
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Contexte (questionnaire)
              </h3>
              {questionnaire.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
                  {questionnaire.map((lib) => (
                    <li key={lib} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {lib}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  Aucun signalement particulier.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
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
          </section>

          <Preuves
            dossierId={item.id}
            preuves={preuvesDto}
            currentUserId={null}
          />

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

          {item.evenements.length > 0 && (
            <DossierTimeline events={evenements} />
          )}
        </div>
      </div>
    </div>
  );
}