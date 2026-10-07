import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { storageUrl } from "@/lib/storage";
import { JuristeActions, DecisionOmpForm } from "./juriste-actions";
import { VerificationFailles } from "./verification-failles";
import { LettreEdition } from "./lettre-edition";
import { GenerateurLettre } from "./generateur-lettre";
import { AvocatTraitement } from "./avocat-traitement";
import { SuggestionsDrawer } from "./suggestions-drawer";
import { PiecesManquantes } from "../pieces-manquantes";
import { PreuvesApiBlock } from "@/components/preuves-api";
import { Preuves, type PreuveDto } from "@/components/preuves";
import { SignatureApercu } from "@/components/signature-apercu";
import {
  DossierTimeline,
  type TimelineEvent,
} from "@/components/dossier-timeline";
import type {
  FailleBibliotheque,
  RefJurisprudentielle,
} from "@/components/bibliotheque-juriste";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { controlerForclusion48si } from "@/lib/delais";
import {
  remplirLettreMulti,
  remplirTemplate,
  type ExtractedData,
} from "@/lib/moteur";
import { LIBELLES_REPONSES, suggestionsPreuvesClient } from "@/lib/questions";
import {
  formaterLettreOfficielle,
  organismeEnvoi,
  destinataireLrar,
  libelleCanalDepuisStockage,
  libelleDocType,
} from "@/lib/envoi";
import { faillesPourTypePreuve, listePiecesJointes } from "@/lib/preuves-api";
import { FilMessages, type MessageDto } from "@/components/messages";
import {
  FilEquipe,
  type MessageEquipeDto,
} from "../../messages/fil-equipe";
import {
  marquerMessagesLus,
  marquerInternesLus,
} from "../../messages/actions";

const statusLabels: Record<string, string> = {
  BROUILLON: "Brouillon",
  EN_ANALYSE: "En analyse",
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  EN_ATTENTE_VALIDATION: "À valider",
  EN_ATTENTE_PRE_SIGNATURE: "En attente de signature client",
  A_VERIFIER: "À vérifier",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  REJETE: "Rejeté",
  ERREUR_TECHNIQUE: "Erreur technique",
  RESOLU: "Résolu",
  ANNULE: "Annulé",
};

const statutChip: Record<string, { label: string; cls: string }> = {
  EN_ATTENTE_PAIEMENT: {
    label: "En attente de paiement",
    cls: "bg-zinc-100 text-zinc-600",
  },
  EN_ATTENTE_VALIDATION: {
    label: "À valider",
    cls: "bg-amber-100 text-amber-800",
  },
  EN_ATTENTE_PRE_SIGNATURE: {
    label: "Validée — en attente de la signature du client",
    cls: "bg-indigo-100 text-indigo-800",
  },
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

type JuristeCaseDetail = {
  id: string;
  userId: string;
  type: "AMENDE" | "SUSPENSION";
  statut: string;
  pvUrl: string | null;
  pvTexte: string | null;
  extractedData: Record<string, unknown> | null;
  lettreGeneree: string | null;
  canalEnvoi: string | null;
  conditions_meteo: string | null;
  remarquesJuriste: string | null;
  failleJuridique: {
    id: string;
    titreFaille: string;
    articleLoi: string;
    statut: string;
    regle: string | null;
    jurisprudence: unknown;
  } | null;
  failleJuridiqueId: string | null;
  faillesRetenues: Array<{
    failleId: string;
    statut: string;
    suggestionIa?: unknown;
    faille: {
      id: string;
      statut: string;
      titreFaille: string;
      articleLoi: string;
      templateLettre?: string | null;
    };
  }>;
  courriers: Array<{
    pdfUrl: string | null;
    signatureUrl: string | null;
    preuveDepotUrl: string | null;
    packUrls?: unknown;
  }>;
  preuves: Array<{
    id: string;
    nom: string;
    type: string;
    url: string;
    createdAt: Date;
    userId: string | null;
  }>;
  evenements: Array<{ type: string; detail: string | null; createdAt: Date }>;
  lawyerMatch: {
    id: string;
    statut: string;
    motif: string | null;
    partnerName: string | null;
    partnerBarreau: string | null;
    partnerEmail: string | null;
    note: string | null;
  } | null;
  prix: number;
  createdAt: Date;
  dateLimite: Date | null;
  motifRejet: string | null;
  decisionOmp: "ACCEPTE" | "REJETE" | null;
  decisionDetail: string | null;
  decisionAttendueLe?: Date | null;
  decisionRecupereeLe?: Date | null;
  valideLe: Date | null;
  user: { name: string | null; email: string | null; signatureUrl: string | null };
  messages: Array<{
    id: string;
    contenu: string;
    createdAt: Date;
    lu: boolean;
    auteurId: string;
    auteur: { id: string; name: string | null; role: string };
  }>;
  messageInternes: Array<{
    id: string;
    contenu: string;
    createdAt: Date;
    lu: boolean;
    expediteurId: string;
    expediteur: { id: string; name: string | null; role: string };
  }>;
};

type JuristeDemoMock = {
  type: "AMENDE" | "SUSPENSION";
  statut: string;
  pvTexte: string;
  extractedData: Record<string, unknown>;
  failleJuridique: {
    id: string;
    titreFaille: string;
    articleLoi: string;
    statut: string;
    regle: string;
    jurisprudence: unknown[];
  } | null;
  lettreGeneree: string | null;
};

const JURISTE_MOCK_BY_ID: Record<string, JuristeDemoMock> = {
  "pv-analyse-001": { type: "AMENDE", statut: "EN_ANALYSE", pvTexte: "CONTRAVENTION N° PV-ANALYSE-001\nVitesse 96km/h limitée 70 le 10/07/2026 à 15:00\nLieu: A6 km 42\nRadar MESTA 210C n° 777\nPlaque AB-123-CD\nMontant 135€\nAdresse 12 RUE DE LA PAIX 75001 PARIS", extractedData: { plaque: "AB-123-CD", num_pv: "PV-ANALYSE-001", date: "2026-07-10", heure: "15h00", lieu: "A6 km 42", adresse: "12 RUE DE LA PAIX 75001 PARIS", montant: "135,00 €", radarId: "777" }, failleJuridique: null, lettreGeneree: null },
  "pv-sign-002": { type: "AMENDE", statut: "A_VERIFIER", pvTexte: "CONTRAVENTION N° PV-SIGN-002\nPlaque XY-999-ZZ\nDate: 20/05/2026 à 10:15\nLieu: Rue de Rivoli, Paris 1er\nMontant: 90€", extractedData: { plaque: "XY-999-ZZ", num_pv: "PV-SIGN-002", date: "2026-05-20", heure: "10:15", lieu: "Rue de Rivoli Paris", adresse: "8 impasse des Lilas 13001 MARSEILLE", plaqueIncorrecte: true }, failleJuridique: { id: "faille-erreur-plaque", titreFaille: "Erreur plaque", articleLoi: "Art. 429 CPP", statut: "ACTIVE", regle: "Erreur plaque", jurisprudence: [] }, lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, titulaire du certificat d'immatriculation du véhicule portant la plaque XY-999-ZZ, conteste l'avis de contravention n° PV-SIGN-002 du 2026-05-20.\n\nLa plaque d'immatriculation XY-999-ZZ mentionnée sur l'avis de contravention ne correspond pas à mon véhicule. Il s'agit d'une erreur matérielle de la part des services verbalisateurs.\n\nConformément à l'article 429 du Code de procédure pénale, l'exonération est demandée lorsque l'avis de contravention est entaché d'une erreur portant sur l'identification du véhicule ou de son titulaire.\n\nJe demande en conséquence l'exonération de l'amende de 90 € qui m'est réclamée." },
  "pv-pret-003": { type: "AMENDE", statut: "PRET", pvTexte: "CONTRAVENTION N° PV-PRET-003\nDate 10/05/2026\nPlaque CD-456-EF\nTravaux présents\nLieu: A10 - Orléans\nMontant: 45€", extractedData: { plaque: "CD-456-EF", num_pv: "PV-PRET-003", date: "2026-05-10", heure: "08:45", lieu: "A10 - Orléans", travaux_présents: true, adresse: "45 Avenue des Champs 75008 PARIS" }, failleJuridique: { id: "faille-travaux-signalisation", titreFaille: "Travaux et signalisation temporaire", articleLoi: "Art. R. 411-8 CR", statut: "ACTIVE", regle: "Travaux", jurisprudence: [] }, lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-PRET-003 du 2026-05-10 relatif au véhicule immatriculé CD-456-EF.\n\nDes travaux avec signalisation temporaire étaient présents au lieu dit A10 - Orléans le 10 mai 2026. La signalisation n'était pas conforme aux prescriptions de l'article R. 411-8 du Code de la route, ce qui entache la régularité de la constatation.\n\nEn application de l'article R. 411-8 du Code de la route, la limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.\n\nJe demande en conséquence l'annulation de l'amende de 45 € qui m'est réclamée." },
  "pv-envoye-004": { type: "AMENDE", statut: "ENVOYE", pvTexte: "CONTRAVENTION N° PV-ENVOYE-004\nDate 01/04/2026\nPlaque EF-012-IJ\nLieu: A6\nMontant: 135€", extractedData: { plaque: "EF-012-IJ", num_pv: "PV-ENVOYE-004", date: "2026-04-01", heure: "16:20", adresse: "22 rue Nationale 75013 PARIS", lieu: "A6" }, failleJuridique: { id: "faille-prescription-1-an", titreFaille: "Prescription 1 an", articleLoi: "Art. 133-3 CPP", statut: "ACTIVE", regle: "Prescription 1 an", jurisprudence: [] }, lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-ENVOYE-004 du 2026-04-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise (art. 9 CPP). Or, plus d'un an s'est écoulé entre la date de l'infraction et la notification du présent avis.\n\nL'infraction est donc prescrite. Je demande en conséquence l'annulation de l'amende de 135 € qui m'est réclamée." },
  "pv-rejete-005": { type: "AMENDE", statut: "REJETE", pvTexte: "CONTRAVENTION N° PV-REJETE-005\nDate 15/03/2026\nPlaque GH-345-KL\nLieu: A7 - Salon-de-Provence\nMontant: 135€", extractedData: { plaque: "GH-345-KL", num_pv: "PV-REJETE-005", date: "2026-03-15", heure: "12:30", lieu: "A7 - Salon-de-Provence", montant: 135 }, failleJuridique: null, lettreGeneree: null },
  "pv-resolu-006": { type: "AMENDE", statut: "RESOLU", pvTexte: "CONTRAVENTION N° PV-RESOLU-006\nDate 01/02/2026\nPlaque MN-678-OP\nLieu: A10 - Aire de Tours\nMontant: 135€", extractedData: { plaque: "MN-678-OP", num_pv: "PV-RESOLU-006", date: "2026-02-01", heure: "11:00", lieu: "A10 - Aire de Tours", montant: 135 }, failleJuridique: { id: "faille-prescription-1-an", titreFaille: "Prescription 1 an", articleLoi: "Art. 9 CPP", statut: "ACTIVE", regle: "Prescription 1 an", jurisprudence: [] }, lettreGeneree: "À l'attention de l'Officier du Ministère Public,\n\nJe soussigné Jean Dupont, conteste l'avis de contravention n° PV-RESOLU-006 du 2026-02-01.\n\nL'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. L'infraction est prescrite.\n\nJe demande l'annulation de l'amende de 135 €." },
  "dec-analyse-007": { type: "SUSPENSION", statut: "EN_ANALYSE", pvTexte: "DÉCISION DE SUSPENSION N° DEC-ANALYSE-007\nPréfecture de Lyon\nDurée: 6 mois\nMotif: Alcoolémie 0,45 mg/L\nDate: 01/07/2026", extractedData: { num_pv: "DEC-ANALYSE-007", date: "2026-07-01", prefecture: "Préfecture de Lyon", duree: "6 mois", motif: "alcoolémie", adresse: "12 RUE DE LA PAIX 75001 PARIS" }, failleJuridique: null, lettreGeneree: null },
  "dec-sign-008": { type: "SUSPENSION", statut: "A_VERIFIER", pvTexte: "DÉCISION DE SUSPENSION N° DEC-SIGN-008\nPréfecture des Bouches-du-Rhône\nDurée: 4 mois\nMotif: Vitesse 180 km/h\nDate: 15/06/2026", extractedData: { num_pv: "DEC-SIGN-008", date: "2026-06-15", prefecture: "Préfecture des Bouches-du-Rhône", duree: "4 mois", motif: "vitesse", lieu: "A7 - Marseille" }, failleJuridique: { id: "faille-suspension-sans-contradictoire", titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA", statut: "PROPOSEE", regle: "Contradictoire", jurisprudence: [] }, lettreGeneree: "À l'attention de Monsieur le Préfet des Bouches-du-Rhône,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-SIGN-008 du 2026-06-15 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 4 mois.\n\nCette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser. En application des articles L. 121-1 et L. 211-2 du code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations (Conseil d'État, 20 avril 2021, n° 438114).\n\nJe demande en conséquence le retrait de la décision de suspension prise à mon encontre." },
  "dec-pret-009": { type: "SUSPENSION", statut: "PRET", pvTexte: "DÉCISION DE SUSPENSION N° DEC-PRET-009\nPréfecture de Paris\nDurée: 12 mois\nMotif: Stupéfiants\nDate: 01/06/2026", extractedData: { num_pv: "DEC-PRET-009", date: "2026-06-01", prefecture: "Préfecture de Paris", duree: "12 mois", motif: "stupéfiants" }, failleJuridique: { id: "faille-suspension-sans-contradictoire", titreFaille: "Suspension sans contradictoire", articleLoi: "Art. L121-1 CRPA", statut: "PROPOSEE", regle: "Contradictoire", jurisprudence: [] }, lettreGeneree: "À l'attention de Monsieur le Préfet de Paris,\n\nJe soussigné Jean Dupont, conteste la décision n° DEC-PRET-009 du 2026-06-01 par laquelle vous avez prononcé la suspension de mon permis de conduire pour une durée de 12 mois.\n\nCette décision a été prise sans procédure contradictoire préalable, en violation des articles L. 121-1 et L. 211-2 CRPA.\n\nJe demande le retrait de cette décision." },
};

function demoJuristeDossier(id: string): JuristeCaseDetail | null {
  const mock = JURISTE_MOCK_BY_ID[id];
  if (!mock) return null;
  const mockUser = {
    name: "Jean Dupont",
    email: "e2e-client@test.local",
    signatureUrl: null,
  };
  const evenements = [
    { type: "CREATION", detail: "Dossier créé", createdAt: new Date(MOCK_NOW_JURISTE - 86400000 * 2) },
    { type: "ANALYSE", detail: "Analyse OCR + questionnaire", createdAt: new Date(MOCK_NOW_JURISTE - 86400000 * 1) },
    { type: "LETTRE_GENEREE", detail: `Lettre générée (faille: ${mock.failleJuridique?.titreFaille ?? "—"})`, createdAt: new Date(MOCK_NOW_JURISTE) },
  ];
  if (mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU") {
    evenements.push({ type: "VALIDATION", detail: "Lettre validée par le juriste", createdAt: new Date(MOCK_NOW_JURISTE + 86400000) });
  }
  if (mock.statut === "ENVOYE" || mock.statut === "RESOLU") {
    evenements.push({ type: "ENVOI", detail: "Contestation envoyée à " + (mock.type === "AMENDE" ? "l'OMP" : "le préfet") + " (lettre + pièces jointes)", createdAt: new Date(MOCK_NOW_JURISTE + 86400000 * 2) });
  }
  if (mock.statut === "RESOLU") {
    evenements.push({ type: "DECISION", detail: "Décision OMP: ACCEPTE - Amende annulée", createdAt: new Date(MOCK_NOW_JURISTE + 86400000 * 3) });
  }
  return {
    id,
    userId: "dev-user",
    type: mock.type,
    statut: mock.statut,
    pvUrl: "/uploads/demo-pv.jpg",
    pvTexte: mock.pvTexte,
    extractedData: mock.extractedData,
    lettreGeneree: mock.lettreGeneree,
    canalEnvoi: null,
    conditions_meteo: null,
    remarquesJuriste: null,
    failleJuridique: mock.failleJuridique,
    failleJuridiqueId: mock.failleJuridique?.id ?? null,
    faillesRetenues: mock.failleJuridique
      ? [{ failleId: mock.failleJuridique.id, statut: "CONFIRMEE", faille: mock.failleJuridique }]
      : [],
    courriers:
      mock.statut === "PRET" || mock.statut === "ENVOYE" || mock.statut === "RESOLU"
        ? [{ pdfUrl: "/uploads/demo-lettre.pdf", signatureUrl: "/uploads/demo-signature.png", preuveDepotUrl: mock.statut === "ENVOYE" ? "/uploads/demo-accuse.pdf" : null }]
        : [],
    preuves: [],
    evenements,
    lawyerMatch: null,
    prix: mock.type === "AMENDE" ? 39 : 59,
    createdAt: new Date(MOCK_NOW_JURISTE),
    dateLimite: new Date(MOCK_NOW_JURISTE + 86400000 * 30),
    motifRejet: mock.statut === "REJETE" ? "Aucune faille applicable : PV régulier, toutes mentions présentes, pas de prescription." : null,
    decisionOmp: mock.statut === "RESOLU" ? "ACCEPTE" : null,
    decisionDetail: mock.statut === "RESOLU" ? "Amende annulée - prescription acquise" : null,
    valideLe: mock.statut === "ENVOYE" || mock.statut === "RESOLU" ? new Date() : null,
    user: mockUser,
    messages: [],
    messageInternes: [],
  };
}

export default async function JuristeCasePage(
  props: PageProps<"/dashboard/juriste/[id]">,
) {
  const juriste = await requireJuriste();
  const lectureSeule = juriste.role !== "JURISTE";
  const params = await props.params;
  const searchParams = await props.searchParams;

  let item: JuristeCaseDetail | null = null;
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
        messages: {
          orderBy: { createdAt: "asc" },
          include: { auteur: { select: { id: true, name: true, role: true } } },
        },
        messageInternes: {
          orderBy: { createdAt: "asc" },
          include: {
            expediteur: { select: { id: true, name: true, role: true } },
          },
        },
        user: { select: { name: true, email: true, signatureUrl: true } },
      },
    })) as unknown as JuristeCaseDetail | null;
  } catch (e) {
    console.error("juriste/[id]: DB indisponible", e);
  }

  if (!item) {
    item = demoJuristeDossier(params.id);
    if (!item) {
      notFound();
    }
  }

  const preuves = await Promise.all(
    item.preuves.map(async (p) => ({
      ...p,
      url: (await storageUrl(p.url)) ?? p.url,
    })),
  );
  // Lien preuve externe ↔ faille détectée : le juriste voit pourquoi chaque
  // preuve « Récupérée » a été suggérée (mapping PREUVES_PAR_FAILLE).
  const faillesRetenuesContexte = (item.faillesRetenues ?? []).filter(
    (df) => df.statut === "CANDIDATE" || df.statut === "CONFIRMEE",
  );
  const contexteParType: Record<string, string | null> = {
    METEO: null,
    RADAR: null,
    TRAVAUX: null,
  };
  for (const type of Object.keys(contexteParType) as Array<"METEO" | "RADAR" | "TRAVAUX">) {
    const faille = faillesRetenuesContexte.find((df) =>
      faillesPourTypePreuve(type).includes(df.faille.id),
    );
    if (faille) {
      contexteParType[type] =
        `Suggérée pour la faille : ${faille.faille.titreFaille}`;
    }
  }
  const preuvesDto: PreuveDto[] = preuves.map((p) => ({
    id: p.id,
    nom: p.nom,
    type: p.type,
    url: p.url,
    createdAt: p.createdAt,
    userId: p.userId,
    contexte: contexteParType[p.type] ?? null,
  }));
  // Pièces attendues d'après les réponses du client (capteur de fait) : le
  // juriste voit ce qui reste à joindre, sans que la pièce devienne un fondement.
  const suggestionsPreuves = suggestionsPreuvesClient(
    item.extractedData,
    preuves.map((p) => p.type),
  );
  const numPvExtrait =
    typeof item.extractedData === "object" && item.extractedData !== null
      ? ((item.extractedData as Record<string, unknown>).num_pv as string) ??
        null
      : null;

  const messagesDto: MessageDto[] = (item.messages ?? []).map((m) => ({
    id: m.id,
    contenu: m.contenu,
    createdAt: m.createdAt,
    lu: m.lu,
    auteurId: m.auteurId,
    auteurNom: m.auteur.name ?? m.auteur.role,
    auteurRole: (m.auteur.role === "JURISTE" || m.auteur.role === "ADMIN" ? m.auteur.role : "CLIENT") as "CLIENT" | "JURISTE" | "ADMIN",
  }));

  const equipeDto: MessageEquipeDto[] = (item.messageInternes ?? []).map(
    (m) => ({
      id: m.id,
      contenu: m.contenu,
      createdAt: m.createdAt,
      lu: m.lu,
      expediteurId: m.expediteurId,
      expediteurNom: m.expediteur.name ?? m.expediteur.role,
      expediteurRole: (m.expediteur.role === "ADMIN"
        ? "ADMIN"
        : "JURISTE") as "JURISTE" | "ADMIN",
    }),
  );

  // Marque comme lus les messages du client et du fil d'équipe dès l'ouverture.
  await marquerMessagesLus(item.id).catch(() => {});
  await marquerInternesLus(item.id).catch(() => {});

  const candidats = item.faillesRetenues.map((df) => ({
    failleId: df.failleId,
    statut: df.statut,
    statutFaille: df.faille.statut,
    titre: df.faille.titreFaille,
    articleLoi: df.faille.articleLoi,
    principale: item.failleJuridiqueId === df.failleId,
    suggestionIa: df.suggestionIa as {
      source?: string;
      pertinence?: string;
      justification?: string;
      controle?: string;
      signalement?: string;
      nouvelleProposition?: boolean;
      at?: string;
    } | null,
  }));

  // Dernière « Vérifier les failles » (horodatage affiché dans le drawer).
  const derniereVerifEvent = item.evenements
    .filter((e) => e.type === "VERIFICATION_POUSSEE")
    .slice(-1)[0];
  const derniereVerification = derniereVerifEvent
    ? new Date(derniereVerifEvent.createdAt).toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  // Analyse approfondie disponible : clé Gemini ou provider simulé (E2E).
  const iaDisponible =
    Boolean(process.env.GEMINI_API_KEY) ||
    process.env.VERIF_IA_PROVIDER === "mock";

  const data = item.extractedData as Record<string, unknown> | null;

  const dataLettres = (item.extractedData ?? {}) as ExtractedData;
  // Habillage professionnel des propositions (en-tête, Objet, Madame/Monsieur,
  // formule de politesse) identique à la lettre stockée — cohérence de style.
  const habiller = (corps: string) =>
    formaterLettreOfficielle({
      type: item.type,
      corps,
      numRef: dataLettres.num_pv ?? null,
      dateRef: dataLettres.date ?? null,
      nom: item.user?.name ?? null,
      adresse: dataLettres.adresse ?? null,
      date: new Date().toISOString().slice(0, 10),
    });
  const faillesActivesAvecTemplate = item.faillesRetenues
    .filter((df) => df.faille.statut === "ACTIVE" && df.faille.templateLettre)
    .map((df) => df.faille);
  const lettresProposees = faillesActivesAvecTemplate.map((f) => ({
    failleId: f.id,
    titreFaille: f.titreFaille,
    articleLoi: f.articleLoi ?? "",
    lettre: habiller(remplirTemplate(f.templateLettre!, dataLettres)),
  }));
  const lettreCombine = (() => {
    const brute = remplirLettreMulti(
      faillesActivesAvecTemplate.map((f) => ({
        id: f.id,
        titreFaille: f.titreFaille,
        articleLoi: f.articleLoi ?? "",
        templateLettre: f.templateLettre!,
      })),
      dataLettres,
    );
    return brute ? habiller(brute) : null;
  })();
  // Variantes du générateur de lettre : une combinaison possible par sous-ensemble
  // (toutes les failles actives, ou chacune seule) — le juriste choisit celle
  // qu'il souhaite appliquer, avec résumé avant application.
  const variantes = faillesActivesAvecTemplate.length
    ? [
        ...(lettreCombine && faillesActivesAvecTemplate.length > 1
          ? [
              {
                cle: "combinee",
                titre: "Toutes les failles (lettre complète)",
                failleIds: faillesActivesAvecTemplate.map((f) => f.id),
                fondements: faillesActivesAvecTemplate.map((f) => ({
                  titre: f.titreFaille,
                  article: f.articleLoi ?? "",
                })),
                lettre: lettreCombine,
              },
            ]
          : []),
        ...faillesActivesAvecTemplate.map((f) => ({
          cle: `seule-${f.id}`,
          titre: `Faille seule : ${f.titreFaille}`,
          failleIds: [f.id],
          fondements: [{ titre: f.titreFaille, article: f.articleLoi ?? "" }],
          lettre: habiller(remplirTemplate(f.templateLettre!, dataLettres)),
        })),
      ]
    : [];
  const questionnaire = data
    ? [
        // Registre unique `lib/questions.ts` (mêmes libellés que le client) +
        // la case plaque, posée hors groupes dans le formulaire.
        ...LIBELLES_REPONSES,
        { cle: "plaqueIncorrecte", lib: "Plaque du PV différente de la mienne" },
      ]
        .filter((item) => data[item.cle] === true)
        .map((item) => item.lib)
    : [];
  const courrier = item.courriers[item.courriers.length - 1];
  const pjData = (item.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: item.type,
    conditionsMeteo: item.conditions_meteo,
    numRef: typeof pjData["num_pv"] === "string" ? (pjData["num_pv"] as string) : null,
    preuves: item.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });
  const pvUrl = await storageUrl(item.pvUrl);
  const titrePv =
    item.type === "AMENDE" ? "Avis de contravention" : "Décision de suspension";
  const pdfUrl = await storageUrl(courrier?.pdfUrl ?? null);
  const accuseUrl = await storageUrl(courrier?.preuveDepotUrl ?? null);
  const signatureCourrier = await storageUrl(courrier?.signatureUrl ?? null);
  const signatureProfil = await storageUrl(item.user.signatureUrl ?? null);
  // Pack Télérecours (3F/48SI) : 3 PDF rattachés au courrier validé.
  const pack = (courrier?.packUrls ?? null) as {
    requete?: string | null;
    refere?: string | null;
    bordereau?: string | null;
  } | null;
  const packRequeteUrl = await storageUrl(pack?.requete ?? null);
  const packRefereUrl = await storageUrl(pack?.refere ?? null);
  const packBordereauUrl = await storageUrl(pack?.bordereau ?? null);
  const evenements = await Promise.all(
    item.evenements.map(async (e) => ({
      ...e,
      detailUrl: e.detail ? await storageUrl(e.detail) : null,
    })),
  );

  // Bibliothèque juridique dynamique — résiliente si DB down. Filtrée sur le
  // type du dossier : seules les failles du même type (AMENDE/SUSPENSION) sont
  // proposées comme suggestions contextuelles au juriste.
  let bibliotheque: Awaited<ReturnType<typeof prisma.failleJuridique.findMany>> = [];
  try {
    bibliotheque = await prisma.failleJuridique.findMany({
      where: { statut: { in: ["ACTIVE", "PROPOSEE"] }, typeInfraction: item.type },
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
    templateLettre: f.templateLettre,
  }));

  const dateLimite = item.dateLimite
    ? dateFormat.format(item.dateLimite)
    : null;

  const envoiEvent = evenements.find((e) => e.type === "ENVOI");

  // Forclusion 48SI : recours à engager dans les 60 jours francs de la
  // notification — signal bloquant côté juriste (jamais inventé sans date).
  const forclusion48si =
    item.type === "SUSPENSION" && data?.docType === "48SI"
      ? controlerForclusion48si(
          typeof data.dateNotification === "string"
            ? data.dateNotification
            : null,
        )
      : null;

  const isDemo = item.id.startsWith("pv-") || item.id.startsWith("dec-");
  const editable =
    item.statut === "A_VERIFIER" ||
    item.statut === "PRET" ||
    item.statut === "EN_ATTENTE_VALIDATION";
  const chip = statutChip[item.statut] ?? {
    label: statusLabels[item.statut] ?? item.statut,
    cls: "bg-zinc-100 text-zinc-600",
  };
  const lettreAccroche =
    item.statut === "EN_ATTENTE_VALIDATION"
      ? "Lettre générée par le moteur, à relire.                   Corrigez, relancez la vérification des failles si nécessaire, puis approuvez — la contestation sera transmise au canal choisi."
      : item.statut === "EN_ATTENTE_PRE_SIGNATURE"
        ? "Lettre validée par vos soins : le client doit maintenant la signer. Une fois signée, il recevra le lien de dépôt assisté pour transmettre sa contestation sur le portail officiel (sauf canal LRAR, envoyé par SOS Amende)."
        : item.statut === "A_VERIFIER"
          ? "Lettre générée par le moteur, à relire et corriger avant la signature du client."
          : item.statut === "PRET"
            ? "Lettre signée par le client, à consulter en lecture seule. Choisissez le canal d'envoi (en ligne ou lettre recommandée avec accusé de réception — SOS Amende envoie par nos soins) puis approuvez la contestation — la signature du client est conservée en cas de correction."
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
            {item.user.signatureUrl &&
              (item.statut === "EN_ATTENTE_VALIDATION" ||
                item.statut === "A_VERIFIER" ||
                item.statut === "PRET") && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  Pré-signé dans son espace
                </span>
              )}
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

      {forclusion48si?.depasse && (
        <div
          data-testid="forclusion-48si"
          className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          Forclusion dépassée — le recours contre cette invalidation 48SI
          devait être engagé avant le{" "}
          {dateFormat.format(forclusion48si.dateForclusion)} (
          {forclusion48si.joursDepasse} jour
          {forclusion48si.joursDepasse > 1 ? "s" : ""} de dépassement). Ne
          transmettez pas la contestation sans avoir vérifié le délai avec le
          client.
        </div>
      )}

      {searchParams.valide === "ok" &&
        (searchParams.lien === "envoye" ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Lettre validée — le lien de dépôt assisté a été envoyé au client
            (e-mail). Il dépose sa contestation sur le portail officiel et le
            dossier passera « Envoyé » à sa confirmation.
          </div>
        ) : item.statut === "EN_ATTENTE_PRE_SIGNATURE" ? (
          <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            Lettre validée — le client est notifié et doit maintenant la
            signer. Dès sa signature, il recevra le lien de dépôt pour
            transmettre sa contestation sur le portail officiel (sauf canal
            LRAR, envoyé par SOS Amende).
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Lettre validée — SOS Amende transmet la contestation par nos soins
            (canal lettre recommandée) : le dépôt est enregistré par le
            juriste. Vous pouvez aussi réenvoyer le lien de dépôt au client.
          </div>
        ))}

      {(searchParams.envoye === "ok" && searchParams.valide !== "ok") ||
      (searchParams.lien === "envoye" && searchParams.valide !== "ok") ||
      searchParams.retourne === "ok" ||
      searchParams.rejete === "ok" ||
      searchParams.decision === "ok" ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {searchParams.envoye === "ok" && searchParams.valide !== "ok"
            ? `Contestation envoyée à ${organismeEnvoi(item.type)} (lettre + pièces jointes).`
            : searchParams.lien === "envoye" && searchParams.valide !== "ok"
              ? "Lien de dépôt assisté réenvoyé au client (e-mail). Il dépose sa contestation sur le portail officiel puis le dossier passera « Envoyé »."
              : searchParams.retourne === "ok"
                ? "Dossier retourné pour nouvelle analyse."
                : searchParams.rejete === "ok"
                  ? "Dossier rejeté, le client est informé du motif."
                  : "Décision OMP enregistrée, dossier résolu."}
        </div>
      ) : null}

      {isDemo && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Dossier de démonstration — les actions (enregistrer, approuver, rejeter) sont simulées et ne modifient pas la base.
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

      {/* Contrôle côte à côte : la lettre à gauche face au texte extrait (OCR)
          à droite, pleine hauteur — le juriste confronte les deux sans quitter
          la page ; le document original se télécharge via un bouton au pied
          du panneau OCR, les pièces suivent en dessous. */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
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
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 lg:h-[70vh] lg:overflow-y-auto">
              {editable ? (
                <>
                  {item.lettreGeneree ? (
                    <LettreEdition
                      dossierId={item.id}
                      lettre={item.lettreGeneree}
                      signee={item.statut === "PRET"}
                      lectureSeule={lectureSeule}
                      signatureUrl={signatureCourrier}
                    />
                  ) : (
                    <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      Aucune lettre générée pour ce dossier (aucun fondement
                      juridique applicable). Le dossier est soumis à votre
                      examen : rejetez-le avec un motif si nécessaire.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {item.lettreGeneree && (
                    <div className="rounded-xl bg-zinc-50 p-6">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                        {item.lettreGeneree}
                      </div>
                      {signatureCourrier && (
                        <div className="mt-10">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Signature du client déjà apposée
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signatureCourrier}
                            alt="Signature du client"
                            className="mt-3 h-16 w-auto rounded-lg border border-zinc-300 bg-white p-1"
                          />
                          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                            Cette signature est collée en bas de la lettre — elle
                            est conservée après toute modification (PDF régénéré
                            automatiquement).
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {!item.lettreGeneree && (
                    <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      Aucune lettre générée pour ce dossier — en attente
                      d&apos;analyse ou aucun fondement juridique applicable.
                    </p>
                  )}
                  {piecesJointes.length > 0 && (
                    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Pièces jointes à la contestation
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                        {piecesJointes.map((pj) => (
                          <li key={pj} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                            <span>{pj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(courrier?.pdfUrl && pdfUrl) || item.lettreGeneree ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {courrier?.pdfUrl && pdfUrl && (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Télécharger la lettre (PDF)
                        </a>
                      )}
                      <a
                        href={`/api/dossier/${item.id}/lettre`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                          courrier?.pdfUrl && pdfUrl
                            ? "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {courrier?.pdfUrl && pdfUrl
                          ? "Télécharger aussi via génération (PDF)"
                          : "Télécharger la lettre (PDF)"}
                      </a>
                    </div>
                  ) : null}
                </>
              )}
              {/* Pack Télérecours : rendu dans les DEUX modes (lecture et
                  édition) — un dossier PRET prêt au dépôt doit montrer ses
                  3 PDF, pas seulement après envoi. */}
              {(packRequeteUrl || packBordereauUrl) && (
                <div
                  data-testid="pack-telerecours"
                  className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    Pack Télérecours — pièces du dépôt en ligne
                  </p>
                  <p className="mt-1 text-xs text-indigo-700/80">
                    Requête au fond, référé (art. L. 521-2 CJA) et bordereau :
                    les 3 documents que le client télécharge pour déposer sur
                    le portail officiel.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {packRequeteUrl && (
                      <a
                        data-testid="pack-requete"
                        href={packRequeteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                      >
                        Requête (PDF)
                      </a>
                    )}
                    {packRefereUrl && (
                      <a
                        data-testid="pack-refere"
                        href={packRefereUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-xl border border-indigo-300 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
                      >
                        Référé L. 521-2 (PDF)
                      </a>
                    )}
                    {packBordereauUrl && (
                      <a
                        data-testid="pack-bordereau"
                        href={packBordereauUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-xl border border-indigo-300 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100"
                      >
                        Bordereau (PDF)
                      </a>
                    )}
                  </div>
                </div>
              )}
              {!signatureCourrier && signatureProfil && (
                <div className="mt-4">
                  <SignatureApercu
                    signatureUrl={signatureProfil}
                    label="Pré-signature (profil client)"
                    note="Signature capturée au dépôt du dossier : elle sera proposée au client à la signature et apposée en bas de la lettre."
                  />
                </div>
              )}
            </div>

            {/* Texte extrait (OCR) : panneau dédié, toujours déplié — bonne
                visibilité pour confronter la lettre au contenu du PV. */}
            <section
              data-testid="ocr-texte"
              className="flex h-full min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:h-[70vh]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Texte extrait (OCR)
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  Lecture automatique — à vérifier
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {item.pvTexte ? (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
                    {item.pvTexte}
                  </pre>
                ) : (
                  <p className="text-sm text-zinc-500">
                    Aucun texte extrait pour ce dossier (OCR non abouti) —
                    le document original reste téléchargeable ci-dessous.
                  </p>
                )}
              </div>
              {pvUrl && (
                <div className="border-t border-zinc-100 px-4 py-3">
                  <a
                    href={pvUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Télécharger le document ({titrePv.toLowerCase()})
                  </a>
                </div>
              )}
            </section>

            {editable && (
              <div className="border-t border-zinc-100 pt-6 lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Prochaine étape
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {item.statut === "EN_ATTENTE_VALIDATION" ||
                  item.statut === "A_VERIFIER" ? (
                    <>
                      <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
                        Valider la lettre finale pour déclencher
                        l&apos;envoi (canal ANTAI, Télérecours, ou lettre
                        recommandée envoyée par SOS Amende) — la recherche
                        peut être affinée avant validation.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <GenerateurLettre
                          dossierId={item.id}
                          variantes={variantes}
                          lectureSeule={lectureSeule}
                        />
                        <span className="text-xs text-zinc-500">
                          La lettre ne vous convient pas ? Choisissez une autre
                          combinaison de fondements juridiques.
                        </span>
                      </div>
                      <JuristeActions
                        dossierId={item.id}
                        showCanal
                        type={item.type}
                        organisme={organismeEnvoi(item.type)}
                        lectureSeule={lectureSeule}
                      />
                    </>
                  ) : item.statut === "PRET" ? (
                    <>
                      {!item.valideLe && (
                        <div className="flex flex-wrap items-center gap-3">
                          <GenerateurLettre
                            dossierId={item.id}
                            variantes={variantes}
                            lectureSeule={lectureSeule}
                          />
                          <span className="text-xs text-zinc-500">
                            Lettre signée par le client : une variante
                            réécrite conserve la signature et régénère le PDF.
                          </span>
                        </div>
                      )}
                      <JuristeActions
                        dossierId={item.id}
                        validee={Boolean(item.valideLe)}
                        showCanal={!Boolean(item.valideLe)}
                        type={item.type}
                        organisme={organismeEnvoi(item.type)}
                        canalEnvoi={item.canalEnvoi}
                        lectureSeule={lectureSeule}
                      />
                    </>
                  ) : (
                    <JuristeActions
                      dossierId={item.id}
                      mode="rejet"
                      lectureSeule={lectureSeule}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Volet pièces sous la lettre : justificatives, preuves externes et
          relance des pièces manquantes empilées — le document ne s'affiche
          plus en aperçu, un bouton sous le texte OCR y donne accès. */}
      <div className="mt-6 flex flex-col gap-6">
        {suggestionsPreuves.length > 0 && (
          <PiecesManquantes
            dossierId={item.id}
            numPv={numPvExtrait}
            pieces={suggestionsPreuves}
          />
        )}

        <Preuves
          dossierId={item.id}
          preuves={preuvesDto}
          currentUserId={null}
          canDeleteAll={!lectureSeule}
          suggestions={suggestionsPreuves}
        />

        <PreuvesApiBlock
          dossierId={item.id}
          lectureSeule={lectureSeule}
          conditionsMeteo={item.conditions_meteo}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {item.valideLe && (
            <section className="rounded-2xl border border-emerald-200 bg-white p-6">
              <h2 className="font-semibold text-emerald-900">
                Envoi de la contestation
              </h2>
              <dl className="mt-3 space-y-0 text-sm">
                <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2">
                  <dt className="text-zinc-500">Statut</dt>
                  <dd className="font-medium text-zinc-800">
                    {statusLabels[item.statut] ?? item.statut}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2">
                  <dt className="text-zinc-500">Canal d&apos;envoi</dt>
                  <dd className="font-medium text-zinc-800">
                    {libelleCanalDepuisStockage(item.canalEnvoi, item.type)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2">
                  <dt className="text-zinc-500">Destinataire</dt>
                  <dd className="font-medium text-zinc-800">
                    {item.canalEnvoi === "LRAR"
                      ? destinataireLrar(item.type)
                      : organismeEnvoi(item.type)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2">
                  <dt className="text-zinc-500">Validée le</dt>
                  <dd className="font-medium text-zinc-800">
                    {dateFormat.format(item.valideLe)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Pièces jointes à la contestation
                </p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {piecesJointes.map((pj) => (
                    <li key={pj} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                      <span>{pj}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {accuseUrl && (
                <a
                  href={accuseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Télécharger l&apos;accusé de dépôt (PDF)
                </a>
              )}
            </section>
          )}

          {item.statut === "ENVOYE" && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h2 className="font-semibold text-emerald-900">
                Dossier envoyé — contestation transmise
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                La contestation (lettre + pièces jointes) a été transmise à{" "}
                {item.canalEnvoi === "LRAR"
                  ? destinataireLrar(item.type)
                  : organismeEnvoi(item.type)}{" "}
                — par SOS Amende. À la réception de la réponse de
                l&apos;OMP, enregistrez la décision pour clore le dossier.
              </p>

              {envoiEvent?.detail && (
                <p className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm text-emerald-800">
                  {envoiEvent.detail}
                </p>
              )}

              {item.decisionAttendueLe && !item.decisionRecupereeLe && (
                <p className="mt-3 rounded-xl bg-white px-4 py-2.5 text-xs text-emerald-700">
                  Décision suivie automatiquement : SOS Amende interroge le
                  portail (déposé le{" "}
                  {item.decisionAttendueLe.toLocaleDateString("fr-FR")}). Le
                  dossier passera « Résolu » dès que la réponse est lue — sinon
                  enregistrez-la manuellement.
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
                  {lectureSeule ? (
                    <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      Lecture seule (administrateur) : la décision est
                      enregistrée par un juriste.
                    </p>
                  ) : (
                    <DecisionOmpForm dossierId={item.id} />
                  )}
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
              {item.decisionRecupereeLe && (
                <p className="mt-2 text-xs text-emerald-700">
                  Décision récupérée automatiquement par SOS Amende (portail
                  officiel) le {item.decisionRecupereeLe.toLocaleDateString("fr-FR")}.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Colonne latérale — références et contexte de vérification */}
        <div className="flex flex-col gap-6">
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
                  {!!data.dateVerificationAppareil && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Vérification radar</dt>
                      <dd className="font-medium">
                        {String(data.dateVerificationAppareil)}
                      </dd>
                    </div>
                  )}
                  {libelleDocType(
                    typeof data.docType === "string" ? data.docType : null,
                  ) && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Document</dt>
                      <dd className="font-medium text-indigo-700">
                        {libelleDocType(
                          typeof data.docType === "string"
                            ? data.docType
                            : null,
                        )}
                      </dd>
                    </div>
                  )}
                  {!!data.dateSignatureArrete && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Signé le</dt>
                      <dd className="font-medium">
                        {String(data.dateSignatureArrete)}
                        {typeof data.heureSignatureArrete === "string" &&
                          data.heureSignatureArrete &&
                          ` à ${String(data.heureSignatureArrete)}`}
                      </dd>
                    </div>
                  )}
                  {!!data.dateNotification && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Notifiée le</dt>
                      <dd className="font-medium">
                        {String(data.dateNotification)}
                      </dd>
                    </div>
                  )}
                  {!!data.dateStage && (
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Stage suivi le</dt>
                      <dd className="font-medium">
                        {String(data.dateStage)}
                      </dd>
                    </div>
                  )}
                  {data.pointsRetiresMemesDate != null &&
                    data.pointsRetiresMemesDate !== "" && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-500">
                          Points retirés le même jour
                        </dt>
                        <dd className="font-medium">
                          {String(data.pointsRetiresMemesDate)}
                        </dd>
                      </div>
                    )}
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
            {item.remarquesJuriste && (
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Remarques du juriste (vérification)
                </h3>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  {item.remarquesJuriste}
                </p>
              </div>
            )}
          </section>

          {!lectureSeule &&
            (item.statut === "A_VERIFIER" ||
              item.statut === "EN_ATTENTE_VALIDATION") && (
              <VerificationFailles
                dossierId={item.id}
                iaDisponible={iaDisponible}
                derniereVerification={derniereVerification}
              />
            )}

          <FilMessages
            dossierId={item.id}
            messages={messagesDto}
            currentUserId={juriste.id}
            currentRole={juriste.role as "CLIENT" | "JURISTE" | "ADMIN"}
          />

          <FilEquipe
            dossierId={item.id}
            messages={equipeDto}
            currentUserId={juriste.id}
          />

          <AvocatTraitement
            matchId={item.lawyerMatch?.id ?? ""}
            lectureSeule={lectureSeule}
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
            <DossierTimeline events={evenements as TimelineEvent[]} />
          )}
        </div>
      </div>

      <SuggestionsDrawer
        dossierId={item.id}
        candidats={candidats}
        lectureSeule={lectureSeule}
        derniereVerification={derniereVerification}
        failleRetenue={failleRetenue}
        bibliotheque={bibliothequeDto}
        lettresProposees={lettresProposees}
        lettreCombine={lettreCombine}
        lettrePrincipale={item.lettreGeneree}
      />
    </div>
  );
}