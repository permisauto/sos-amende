import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface MockFaille {
  id: string;
  typeInfraction: "AMENDE" | "SUSPENSION";
  titreFaille: string;
  articleLoi: string;
  regle: string | null;
  templateLettre: string;
  source: string | null;
  statut: "ACTIVE" | "INACTIVE" | "PROPOSEE";
  reglesDetection: RegleDetection[] | null;
  jurisprudence: JurisprudenceRef[] | null;
  createdAt: Date;
}

const baseMocks: MockFaille[] = [
  {
    id: "faille-prescription-1-an",
    typeInfraction: "AMENDE",
    titreFaille: "Prescription 1 an",
    articleLoi: "Art. 9 CPP",
    regle: "L'action publique pour les contraventions s'éteint par un an à compter du jour où l'infraction a été commise.",
    templateLettre: "Je soussigné {nom}, titulaire du permis {permis}, conteste le PV {num_pv} du {date} pour un montant de {montant} €. L'infraction étant prescrite depuis plus d'un an, je demande l'annulation.",
    source: "Legifrance",
    statut: "ACTIVE",
    reglesDetection: [{ type: "datePrescrite" }],
    jurisprudence: [],
    createdAt: new Date("2026-01-15"),
  },
  {
    id: "faille-travaux-signalisation",
    typeInfraction: "AMENDE",
    titreFaille: "Travaux sans signalisation",
    articleLoi: "Art. R. 411-8 CR",
    regle: "La limitation de vitesse dans les zones de travaux n'est opposable que si la signalisation réglementaire est en place.",
    templateLettre: "Je soussigné {nom}, conteste le PV {num_pv} du {date}. Aucune signalisation de travaux n'était présente sur le lieu de l'infraction, la limitation n'est donc pas opposable.",
    source: "Legifrance",
    statut: "ACTIVE",
    reglesDetection: [{ type: "texteContient", motif: "travaux" }, { type: "texteAbsent", motif: "signalisation" }],
    jurisprudence: [],
    createdAt: new Date("2026-02-10"),
  },
  {
    id: "faille-suspension-sans-contradictoire",
    typeInfraction: "SUSPENSION",
    titreFaille: "Suspension sans contradictoire préalable",
    articleLoi: "Art. L. 224-1 CRPA / L. 121-1 CRPA",
    regle: "Toute suspension de permis doit être précédée d'une procédure contradictoire (droit à être entendu).",
    templateLettre: "Je soussigné {nom}, conteste la décision de suspension {num_pv} du {date}. Aucune procédure contradictoire n'a été respectée avant cette décision, ce qui la rend irrégulière.",
    source: "Legifrance",
    statut: "PROPOSEE",
    reglesDetection: [{ type: "texteAbsent", motif: "observations" }],
    jurisprudence: [
      { reference: "CE 20 avr. 2021 n° 438114", juridiction: "Conseil d'État", date: "2021-04-20", url: "https://www.legifrance.gouv.fr/...", verifiee: false, resume: "Le droit à une procédure contradictoire préalable est une garantie fondamentale avant toute suspension administrative du permis de conduire." },
    ],
    createdAt: new Date("2026-08-01"),
  },
  {
    id: "faille-suspension-marge-erreur-ethylometre",
    typeInfraction: "SUSPENSION",
    titreFaille: "Marge d'erreur éthylomètre non appliquée",
    articleLoi: "Art. L. 234-1 CR / R. 234-1 CR",
    regle: "La marge d'erreur légale de l'éthylomètre (8 % ou 0,16 mg/L) doit être déduite du taux mesuré avant toute qualification.",
    templateLettre: "Je soussigné {nom}, conteste la décision de suspension {num_pv} du {date}. Le taux d'alcoolémie retenu n'intègre pas la marge d'erreur légale de l'appareil, la qualification est donc entachée d'erreur.",
    source: "Legifrance",
    statut: "PROPOSEE",
    reglesDetection: [{ type: "texteContient", motif: "alcool" }, { type: "champAbsent", champ: "margeErreur" }],
    jurisprudence: [
      { reference: "CE 14 févr. 2018 n° 407914", juridiction: "Conseil d'État", date: "2018-02-14", url: "https://www.legifrance.gouv.fr/...", verifiee: false, resume: "La marge d'erreur de 8 % (ou 0,16 mg/L) doit être systématiquement déduite du résultat brut de l'éthylomètre." },
    ],
    createdAt: new Date("2026-08-02"),
  },
  {
    id: "faille-suspension-notification-irreguliere",
    typeInfraction: "SUSPENSION",
    titreFaille: "Notification irrégulière de la décision",
    articleLoi: "Art. L. 121-4 CRPA / Art. R. 121-1 CRPA",
    regle: "La notification de la décision de suspension doit respecter les formes légales (LRAR, remise en main propre avec émargément).",
    templateLettre: "Je soussigné {nom}, conteste la décision de suspension {num_pv} du {date}. La notification n'a pas respecté les formes prescrites par la loi (absence de LRAR / remise en main propre), la décision est donc inopposable.",
    source: "Legifrance",
    statut: "PROPOSEE",
    reglesDetection: [{ type: "champAbsent", champ: "dateNotification" }],
    jurisprudence: [
      { reference: "CAA Bordeaux 12 mars 2020 n° 18BX01234", juridiction: "CAA Bordeaux", date: "2020-03-12", url: "https://www.legifrance.gouv.fr/...", verifiee: false, resume: "La notification par simple courrier simple sans accusé de réception ne satisfait pas aux exigences de l'article R. 121-1 CRPA." },
    ],
    createdAt: new Date("2026-08-03"),
  },
];

const STORE_FILE = join(tmpdir(), "sos-amende-mock-failles.json");

function readStore(): Map<string, "ACTIVE" | "INACTIVE"> {
  if (!existsSync(STORE_FILE)) return new Map();
  try {
    const data = JSON.parse(readFileSync(STORE_FILE, "utf-8"));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function writeStore(store: Map<string, "ACTIVE" | "INACTIVE">): void {
  const obj = Object.fromEntries(store);
  writeFileSync(STORE_FILE, JSON.stringify(obj), "utf-8");
}

function generateMocks(): MockFaille[] {
  const validated = readStore();
  const mocks: MockFaille[] = [];
  for (let i = 0; i < 20; i++) {
    const base = baseMocks[i % baseMocks.length];
    const id = `${base.id}-${i}`;
    const validatedStatut = validated.get(id);
    mocks.push({
      ...base,
      id,
      statut: validatedStatut ?? base.statut,
    });
  }
  return mocks;
}

export function getMockFailles(filter?: string): MockFaille[] {
  let mocks = generateMocks();
  if (filter && filter !== "ALL") {
    mocks = mocks.filter((f) => f.statut === filter);
  }
  return mocks;
}

export function getMockStats(): Array<{ statut: string; _count: number }> {
  const mocks = generateMocks();
  const counts = new Map<string, number>();
  for (const m of mocks) {
    counts.set(m.statut, (counts.get(m.statut) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([statut, _count]) => ({ statut, _count }));
}

export function getSuspensionActiveCount(): number {
  return generateMocks().filter((f) => f.typeInfraction === "SUSPENSION" && f.statut === "ACTIVE").length;
}

export function validateMockFaille(id: string, action: "ACTIVE" | "INACTIVE"): boolean {
  if (!id.startsWith("faille-")) return false;
  const store = readStore();
  store.set(id, action);
  writeStore(store);
  return true;
}

export function isMockValidated(id: string): "ACTIVE" | "INACTIVE" | null {
  return readStore().get(id) ?? null;
}

export function resetMockValidations(): void {
  writeStore(new Map());
}