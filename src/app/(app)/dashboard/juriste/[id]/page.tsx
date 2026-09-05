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

const MOCK_NOW_JURISTE = new Date("2026-07-15T12:00:00Z").getTime();

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
    const mockUser = { name: "Jean Dupont", email: "e2e-client@test.local" };
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
        failleJuridique: { id: "faille-erreur-plaque", titreFaille: "Erreur plaque", articleLoi: "Art. 429 CPP", statut: "ACTIVE", regle: "Erreur plaque", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule portant la plaque XY-999-ZZ, conteste l'avis de contravention n° PV-SIGN-002 du 2026-05-20.\n\nLa plaque d'immatriculation XY-999-ZZ mentionnée sur l'avis de contravention ne correspond pas à mon véhicule. Il s'agit d'une erreur matérielle de la part des services verbalisateurs.\n\nConformément à l'article 429 du Code de procédure pénale, l'exonération est demandée lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.\n\nJe demande en conséquence l'exonération de l'amende de 90 € qui m'est réclamée." 
      },
      "pv-pret-003": { 
        type: "AMENDE", statut: "PRET", 
        pvTexte: "CONTRAVENTION N° PV-PRET-003\nDate 10/05/2026\nPlaque CD-456-EF\nTravaux présents\nLieu: A10 - Orléans\nMontant: 45€", 
        extractedData: { plaque: "CD-456-EF", num_pv: "PV-PRET-003", date: "2026-05-10", heure: "08:45", lieu: "A10 - Orléans", travaux_présents: true, adresse: "45 Avenue des Champs 75008 PARIS" }, 
        failleJuridique: { id: "faille-travaux-signalisation", titreFaille: "Travaux et signalisation temporaire", articleLoi: "Art. R. 411-8 CR", statut: "ACTIVE", regle: "Travaux", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-PRET-003 du 2026-05-10 relatif au véhicule immatriculé CD-456-EF.\n\nDes travaux avec signalisation temporaire étaient présents au lieu dit A10 - Orléans le 10 mai 2026. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation.\n\nEn application de l'article R. 411-8 du Code de la route, la limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.\n\nJe demande en conséquence l'annulation de l'amende de 45 € qui m'est réclamée." 
      },
      "pv-envoye-004": { 
        type: "AMENDE", statut: "ENVOYE", 
        pvTexte: "CONTRAVENTION N° PV-ENVOYE-004\nDate 01/04/2026\nPlaque EF-012-IJ\nLieu: A6\nMontant: 135€", 
        extractedData: { plaque: "EF-012-IJ", num_pv: "PV-ENVOYE-004", date: "2026-04-01", heure: "16:20", adresse: "22 rue Nationale 75013 PARIS", lieu: "A6" }, 
        failleJuridique: { id: "faille-prescription-1-an", titreFaille: "Prescription 1 an", articleLoi: "Art. 133-3 CPP", statut: "ACTIVE", regle: "Prescription 1 an", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-ENVOYE-004 du 2026-04-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise (art. 9 CPP). Or, plus d'un an s'est écoulé entre la date de l'infraction et la notification du présent avis.\n\nL'infraction est donc prescrite. Je demande en conséquence l'annulation de l'amende de 135 € qui m'est réclamée." 
      },
      "pv-rejete-005": { 
        type: "AMENDE", statut: "REJETE", 
        pvTexte: "CONTRAVENTION N° PV-REJETE-005\nDate 15/03/2026\nPlaque GH-345-KL\nLieu: A7 - Salon-de-Provence\nMontant: 135€", 
        extractedData: { plaque: "GH-345-KL", num_pv: "PV-REJETE-005", date: "2026-03-15", heure: "12:30", lieu: "A7 - Salon-de-Provence", montant: 135 }, 
        failleJuridique: null, 
        lettreGeneree: null 
      },
      "pv-resolu-006": { 
        type: "AMENDE", statut: "RESOLU", 
        pvTexte: "CONTRAVENTION N° PV-RESOLU-006\nDate 01/02/2026\nPlaque MN-678-OP\nLieu: A10 - Aire de Tours\nMontant: 135€", 
        extractedData: { plaque: "MN-678-OP", num_pv: "PV-RESOLU-006", date: "2026-02-01", heure: "11:00", lieu: "A10 - Aire de Tours", montant: 135 }, 
        failleJuridique: { id: "faille-prescription-1-an", titreFaille: "Prescription 1 an", articleLoi: "Art. 9 CPP", statut: "ACTIVE", regle: "Prescription 1 an", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-RESOLU-006 du 2026-02-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. L'infraction est prescrite.\n\nJe demande l'annulation de l'amende de 135 €." 
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
        failleJuridique: { id: "faille-suspension-sans-contradictoire", titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA", statut: "PROPOSEE", regle: "Contradictoire", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de Monsieur le Préfet des Bouches-du-Rhône,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-SIGN-008 du 2026-06-15 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 4 mois.\n\nCette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114).\n\nJe demande en conséquence le retrait de la décision de suspension prise à mon encontre." 
      },
      "dec-pret-009": { 
        type: "SUSPENSION", statut: "PRET", 
        pvTexte: "DÉCISION DE SUSPENSION N° DEC-PRET-009\nPréfecture de Paris\nDurée: 12 mois\nMotif: Stupéfiants\nDate: 01/06/2026", 
        extractedData: { num_pv: "DEC-PRET-009", date: "2026-06-01", prefecture: "Préfecture de Paris", duree: "12 mois", motif: "stupéfiants" }, 
        failleJuridique: { id: "faille-suspension-sans-contradictoire", titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA", statut: "PROPOSEE", regle: "Contradictoire", jurisprudence: [] }, 
        lettreGeneree: "À l'attention de Monsieur le Préfet de Paris,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-PRET-009 du 2026-06-01 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 12 mois.\n\nCette décision a été prise sans procédure contradictoire préalable, en violation des articles L. 121-1 et L. 211-2 CRPA.\n\nJe demande le retrait de cette décision." 
      },
    };
    const mock = mockById[params.id];
    if (mock) {
      item = {
        id: params.id,
        userId: "dev-user",
        type: mock.type,
        statut: mock.statut,
        pvUrl: "/uploads/demo-pv.jpg",
        pvTexte: mock.pvTexte,
        extractedData: mock.extractedData,
        lettreGeneree: mock.lettreGeneree ?? null,
        failleJuridique: mock.failleJuridique,
        faillesRetenues: mock.failleJuridique ? [{ failleId: mock.failleJuridique.id, statut: "CONFIRMEE", faille: mock.failleJuridique }] : [],
        courriers: (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU") ? [{ pdfUrl: "/uploads/demo-lettre.pdf", signatureUrl: "/uploads/demo-signature.png", preuveDepotUrl: mock.statut === "ENVOYE" ? "/uploads/demo-accuse.pdf" : null }] : [],
        preuves: [],
        evenements: (() => {
          const base = [
            { type: "CREATION", detail: "Dossier créé", createdAt: new Date(MOCK_NOW_JURISTE - 86400000 * 2), detailUrl: null },
            { type: "ANALYSE", detail: "Analyse OCR + questionnaire", createdAt: new Date(MOCK_NOW_JURISTE - 86400000 * 1), detailUrl: null },
            { type: "LETTRE_GENEREE", detail: `Lettre générée (faille: ${mock.failleJuridique?.titreFaille ?? "—"})`, createdAt: new Date(MOCK_NOW_JURISTE), detailUrl: null },
          ];
          if (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU") {
            base.push({ type: "VALIDATION", detail: "Lettre validée par le juriste", createdAt: new Date(MOCK_NOW_JURISTE + 86400000), detailUrl: null });
          }
          if (mock.statut === "ENVOYE" || mock.statut === "RESOLU") {
            base.push({ type: "ENVOI", detail: "Contestation envoyée à " + (mock.type === "AMENDE" ? "l'OMP" : "le préfet") + " (lettre + pièces jointes)", createdAt: new Date(MOCK_NOW_JURISTE + 86400000 * 2), detailUrl: null });
          }
          if (mock.statut === "RESOLU") {
            base.push({ type: "DECISION", detail: "Décision OMP: ACCEPTE - Amende annulée", createdAt: new Date(MOCK_NOW_JURISTE + 86400000 * 3), detailUrl: null });
          }
          return base;
        })(),
        lawyerMatch: null,
        prix: mock.type === "AMENDE" ? 39 : 59,
        createdAt: new Date(MOCK_NOW_JURISTE),
        dateLimite: new Date(MOCK_NOW_JURISTE + 86400000 * 30),
        motifRejet: mock.statut === "REJETE" ? "Aucune faille applicable : PV régulier, toutes mentions présentes, pas de prescription." : null,
        decisionOmp: mock.statut === "RESOLU" ? "ACCEPTE" : null,
        decisionDetail: mock.statut === "RESOLU" ? "Amende annulée - prescription acquise" : null,
        valideLe: (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU") ? new Date() : null,
        user: mockUser,
      } as unknown as Record<string, any>;
    } else {
      notFound();
    }
  }

  const preuves = await Promise.all(
    (item.preuves as Array<Record<string, any>>).map(async (p: Record<string, any>) => ({
      ...p,
      url: (await storageUrl(p.url)) ?? p.url,
    })),
  );
  const preuvesDto: PreuveDto[] = preuves.map((p: Record<string, any>) => ({
    id: p.id,
    nom: p.nom,
    type: p.type,
    url: p.url,
    createdAt: p.createdAt,
    userId: p.userId,
  }));

  const candidats = (item.faillesRetenues as Array<Record<string, any>>).map((df: Record<string, any>) => ({
    failleId: df.failleId,
    statut: df.statut,
    titre: (df.faille as Record<string, any>).titreFaille,
    articleLoi: (df.faille as Record<string, any>).articleLoi,
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
    (item.evenements as Array<Record<string, any>>).map(async (e: Record<string, any>) => ({
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

  // @ts-ignore
  const envoiEvent = (evenements as Array<Record<string, any>>).find((e: Record<string, any>) => e.type === "ENVOI");

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
            // @ts-ignore
            <DossierTimeline events={evenements as unknown as TimelineEvent[]} />
          )}
        </div>
      </div>
    </div>
  );
}