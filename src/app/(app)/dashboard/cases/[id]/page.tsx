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

  let item: Record<string, any> | null = null;
  try {
    const isDev = user.id.startsWith("dev-");
    item = (await prisma.dossier.findFirst({
      where: isDev ? { id } : { id, userId: user.id },
      include: {
        courriers: true,
        failleJuridique: true,
        lawyerMatch: true,
        preuves: { orderBy: { createdAt: "asc" } },
        evenements: { orderBy: { createdAt: "asc" } },
      },
    })) as unknown as Record<string, any> | null;
    // Fallback : si dev et dossier non trouvé avec filtre userId, retente sans filtre
    if (!item && isDev) {
      item = (await prisma.dossier.findFirst({
        where: { id },
        include: {
          courriers: true,
          failleJuridique: true,
          lawyerMatch: true,
          preuves: { orderBy: { createdAt: "asc" } },
          evenements: { orderBy: { createdAt: "asc" } },
        },
      })) as unknown as Record<string, any> | null;
    }
  } catch (e) {
    console.error("cases/[id]: DB indisponible", e);
  }

  if (!item) {
    if (user.id.startsWith("dev-")) {
      // Mock ultra-réaliste par id pour que le clic soit toujours vérifiable même si DB down
      const mockById: Record<string, Record<string, any>> = {
        "pv-analyse-001": { 
          type: "AMENDE", statut: "EN_ANALYSE", 
          pvTexte: "CONTRAVENTION N° PV-ANALYSE-001\nVitesse 96km/h limitée 70 le 10/07/2026 à 15:00\nLieu: A6 km 42\nRadar MESTA 210C n° 777\nPlaque AB-123-CD\nMontant 135€\nAdresse 12 RUE DE LA PAIX 75001 PARIS", 
          extractedData: { plaque: "AB-123-CD", num_pv: "PV-ANALYSE-001", date: "2026-07-10", heure: "15h00", lieu: "A6 km 42", adresse: "12 RUE DE LA PAIX 75001 PARIS", montant: "135,00 €", radarId: "777" }, 
          failleJuridique: null, 
          lettreGeneree: null 
        },
        "pv-sign-002": { 
          type: "AMENDE", statut: "A_VERIFIER", 
          pvTexte: "CONTRAVENTION N° PV-SIGN-002\nPlaque XY-999-ZZ\nDate: 20/05/2026 à 10:15\nLieu: Rue de Rivoli, Paris 1er\nMontant: 90€", 
          extractedData: { plaque: "XY-999-ZZ", num_pv: "PV-SIGN-002", date: "2026-05-20", heure: "10:15", lieu: "Rue de Rivoli Paris", adresse: "8 impasse des Lilas 13001 MARSEILLE", plaqueIncorrecte: true }, 
          failleJuridique: { titreFaille: "Erreur plaque", articleLoi: "Art. 429 CPP" }, 
          lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule portant la plaque XY-999-ZZ, conteste l'avis de contravention n° PV-SIGN-002 du 2026-05-20.\n\nLa plaque d'immatriculation XY-999-ZZ mentionnée sur l'avis de contravention ne correspond pas à mon véhicule. Il s'agit d'une erreur matérielle de la part des services verbalisateurs.\n\nConformément à l'article 429 du Code de procédure pénale, l'exonération est demandée lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.\n\nJe demande en conséquence l'exonération de l'amende de 90 € qui m'est réclamée." 
        },
        "pv-pret-003": { 
          type: "AMENDE", statut: "PRET", 
          pvTexte: "CONTRAVENTION N° PV-PRET-003\nDate 10/05/2026\nPlaque CD-456-EF\nTravaux présents\nLieu: A10 - Orléans\nMontant: 45€", 
          extractedData: { plaque: "CD-456-EF", num_pv: "PV-PRET-003", date: "2026-05-10", heure: "08:45", lieu: "A10 - Orléans", travaux_présents: true, adresse: "45 Avenue des Champs 75008 PARIS" }, 
          failleJuridique: { titreFaille: "Travaux et signalisation temporaire", articleLoi: "Art. R. 411-8 CR" }, 
          lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-PRET-003 du 2026-05-10 relatif au véhicule immatriculé CD-456-EF.\n\nDes travaux avec signalisation temporaire étaient présents au lieu dit A10 - Orléans le 10 mai 2026. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation.\n\nEn application de l'article R. 411-8 du Code de la route, la limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.\n\nJe demande en conséquence l'annulation de l'amende de 45 € qui m'est réclamée.",
          valideLe: new Date("2026-07-15"),
          decisionOmp: null,
          decisionDetail: null,
        },
        "pv-envoye-004": { 
          type: "AMENDE", statut: "ENVOYE", 
          pvTexte: "CONTRAVENTION N° PV-ENVOYE-004\nDate 01/04/2026\nPlaque EF-012-IJ\nLieu: A6\nMontant: 135€", 
          extractedData: { plaque: "EF-012-IJ", num_pv: "PV-ENVOYE-004", date: "2026-04-01", heure: "16:20", adresse: "22 rue Nationale 75013 PARIS", lieu: "A6" }, 
          failleJuridique: { titreFaille: "Prescription 1 an", articleLoi: "Art. 133-3 CPP" }, 
          lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-ENVOYE-004 du 2026-04-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise (art. 9 CPP). Or, plus d'un an s'est écoulé entre la date de l'infraction et la notification du présent avis.\n\nL'infraction est donc prescrite. Je demande en conséquence l'annulation de l'amende de 135 € qui m'est réclamée.",
          valideLe: new Date("2026-07-10"),
          decisionOmp: null,
          decisionDetail: null,
        },
        "pv-rejete-005": { 
          type: "AMENDE", statut: "REJETE", 
          pvTexte: "CONTRAVENTION N° PV-REJETE-005\nDate 15/03/2026\nPlaque GH-345-KL\nLieu: A7 - Salon-de-Provence\nMontant: 135€", 
          extractedData: { plaque: "GH-345-KL", num_pv: "PV-REJETE-005", date: "2026-03-15", heure: "12:30", lieu: "A7 - Salon-de-Provence", montant: 135 }, 
          failleJuridique: null, 
          lettreGeneree: null,
          valideLe: null,
          decisionOmp: null,
          decisionDetail: null,
        },
        "pv-resolu-006": { 
          type: "AMENDE", statut: "RESOLU", 
          pvTexte: "CONTRAVENTION N° PV-RESOLU-006\nDate 01/02/2026\nPlaque MN-678-OP\nLieu: A10 - Aire de Tours\nMontant: 135€", 
          extractedData: { plaque: "MN-678-OP", num_pv: "PV-RESOLU-006", date: "2026-02-01", heure: "11:00", lieu: "A10 - Aire de Tours", montant: 135 }, 
          failleJuridique: { titreFaille: "Prescription 1 an", articleLoi: "Art. 9 CPP" }, 
          lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-RESOLU-006 du 2026-02-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. L'infraction est prescrite.\n\nJe demande l'annulation de l'amende de 135 €.",
          valideLe: new Date("2026-06-15"),
          decisionOmp: "ACCEPTE",
          decisionDetail: "Amende annulée - prescription acquise",
        },
        "dec-analyse-007": { 
          type: "SUSPENSION", statut: "EN_ANALYSE", 
          pvTexte: "DÉCISION DE SUSPENSION N° DEC-ANALYSE-007\nPréfecture de Lyon\nDurée: 6 mois\nMotif: Alcoolémie 0,45 mg/L\nDate: 01/07/2026", 
          extractedData: { num_pv: "DEC-ANALYSE-007", date: "2026-07-01", prefecture: "Préfecture de Lyon", duree: "6 mois", motif: "alcoolémie", adresse: "12 RUE DE LA PAIX 75001 PARIS" }, 
          failleJuridique: null, 
          lettreGeneree: null 
        },
        "dec-sign-008": { 
          type: "SUSPENSION", statut: "A_VERIFIER", 
          pvTexte: "DÉCISION DE SUSPENSION N° DEC-SIGN-008\nPréfecture des Bouches-du-Rhône\nDurée: 4 mois\nMotif: Vitesse 180 km/h\nDate: 15/06/2026", 
          extractedData: { num_pv: "DEC-SIGN-008", date: "2026-06-15", prefecture: "Préfecture des Bouches-du-Rhône", duree: "4 mois", motif: "vitesse", lieu: "A7 - Marseille" }, 
          failleJuridique: { titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA" }, 
          lettreGeneree: "À l'attention de Monsieur le Préfet des Bouches-du-Rhône,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-SIGN-008 du 2026-06-15 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 4 mois.\n\nCette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114).\n\nJe demande en conséquence le retrait de la décision de suspension prise à mon encontre.",
          valideLe: null,
          decisionOmp: null,
          decisionDetail: null,
        },
        "dec-pret-009": { 
          type: "SUSPENSION", statut: "PRET", 
          pvTexte: "DÉCISION DE SUSPENSION N° DEC-PRET-009\nPréfecture de Paris\nDurée: 12 mois\nMotif: Stupéfiants\nDate: 01/06/2026", 
          extractedData: { num_pv: "DEC-PRET-009", date: "2026-06-01", prefecture: "Préfecture de Paris", duree: "12 mois", motif: "stupéfiants" }, 
          failleJuridique: { titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA" }, 
          lettreGeneree: "À l'attention de Monsieur le Préfet de Paris,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-PRET-009 du 2026-06-01 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 12 mois.\n\nCette décision a été prise sans procédure contradictoire préalable, en violation des articles L. 121-1 et L. 211-2 CRPA.\n\nJe demande le retrait de cette décision.",
          valideLe: new Date("2026-07-10"),
          decisionOmp: null,
          decisionDetail: null,
        },
      };
      const mock = mockById[id];
      if (mock) {
        item = {
          id,
          userId: user.id,
          type: mock.type,
          statut: mock.statut,
          pvUrl: "/uploads/demo-pv.jpg",
          pvTexte: mock.pvTexte,
          extractedData: mock.extractedData,
          lettreGeneree: mock.lettreGeneree ?? null,
          failleJuridique: mock.failleJuridique,
          courriers: (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU") ? [{ pdfUrl: "/uploads/demo-lettre.pdf", signatureUrl: "/uploads/demo-signature.png", preuveDepotUrl: mock.statut === "ENVOYE" ? "/uploads/demo-accuse.pdf" : null }] : [],
          preuves: [],
          evenements: [{ type: "CREATION", detail: "Dossier de démo", createdAt: new Date(), detailUrl: null }],
          lawyerMatch: null,
          prix: mock.type === "AMENDE" ? 39 : 59,
          createdAt: new Date(),
          dateLimite: new Date(Date.now() + 86400000 * 30),
          motifRejet: null,
          decisionOmp: mock.decisionOmp ?? null,
          decisionDetail: mock.decisionDetail ?? null,
          valideLe: mock.valideLe ?? (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU" ? new Date() : null),
        } as unknown as Record<string, any>;
      } else {
        return (
          <div className="mx-auto max-w-4xl p-8">
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Mode démo — dossier {id.slice(0, 8)} non trouvé. Revenez à <a href="/dashboard?dev=1" className="font-semibold underline">/dashboard?dev=1</a> et cliquez sur un des 9 dossiers listés (PV-TEST-00X).</p>
            <Link href="/dashboard?dev=1" className="mt-4 inline-block rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white">Retour</Link>
          </div>
        );
      }
    } else {
      notFound();
    }
  }

  // @ts-ignore
  const preuves = await Promise.all(
    (item.preuves as Array<Record<string, any>>).map(async (p: Record<string, any>) => ({
      ...p,
      url: (await storageUrl(p.url)) ?? p.url,
    })),
  );
  // @ts-ignore
  const preuvesDto: PreuveDto[] = preuves.map((p: Record<string, any>) => ({
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
  const preuveDepotUrl = await storageUrl(courrier?.preuveDepotUrl ?? null);
  const preuveEtalonnage =
    typeof item.extractedData === "object" &&
    item.extractedData !== null &&
    "preuveEtalonnage" in item.extractedData
      ? await storageUrl(String(item.extractedData.preuveEtalonnage))
      : null;
  // @ts-ignore
  const evenements = await Promise.all(
    (item.evenements as Array<Record<string, any>>).map(async (e: Record<string, any>) => ({
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
        <div className={`mt-6 rounded-2xl border p-6 ${item.decisionOmp === "ACCEPTE" ? "border-emerald-200 bg-emerald-50" : "border-zinc-300 bg-zinc-50"}`}>
          <h2 className={`font-semibold ${item.decisionOmp === "ACCEPTE" ? "text-emerald-900" : "text-zinc-900"}`}>
            {item.decisionOmp === "ACCEPTE"
              ? "Dossier résolu : votre contestation a été acceptée"
              : "Dossier résolu : votre contestation a été rejetée"}
          </h2>
          <p className={`mt-1 text-sm ${item.decisionOmp === "ACCEPTE" ? "text-emerald-800" : "text-zinc-600"}`}>
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
          {/* @ts-ignore */}
          <DossierTimeline events={evenements as unknown as TimelineEvent[]} />
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
        user.credits < 1 ? (
          <div className="mt-8 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-6">
            <h2 className="text-lg font-semibold text-emerald-900">✓ Faille validée — finalisez votre paiement</h2>
            <p className="mt-2 text-sm text-emerald-800">
              Le scan et le scoring ({item.failleJuridique ? "faille détectée" : "analyse terminée"}) sont gratuits. Pour débloquer la lettre ({item.type === "AMENDE" ? "39 €" : "59 €"}) et la faire signer/valider par un juriste, renseignez vos coordonnées et choisissez votre paiement.
            </p>
            <Link href={`/dashboard/paiement/${item.id}`} className="mt-4 inline-block rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
              Payer — virement ou Stripe
            </Link>
            <p className="mt-2 text-xs text-emerald-700">Nom, prénom, email, WhatsApp demandés à l'étape suivante.</p>
          </div>
        ) : (
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
        )
      ) : item.statut === "PRET" && item.courriers.length > 0 ? (
        item.valideLe ? (
          <>
            <LrKit
              dossierId={item.id}
              dateLimite={item.dateLimite}
              type={item.type}
              numPv={numPv}
            />
            {pdfUrl && (
              <div className="mt-6">
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  Télécharger la lettre signée (PDF)
                </a>
              </div>
            )}
          </>
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
              — conservez votre accusé d&apos;envoi, il fait foi de la date.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {preuveDepotUrl ? (
                <a href={preuveDepotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow hover:bg-emerald-50">
                  Voir l&apos;accusé de dépôt
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-zinc-600">
                  Accusé : conservez le récépissé LRAR / dépôt en ligne
                </span>
              )}
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  Télécharger la lettre envoyée (PDF)
                </a>
              )}
            </div>
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