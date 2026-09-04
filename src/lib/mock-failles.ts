import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { CATALOGUE_SOURCES } from "@/lib/catalogue-sources";
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

// Build base mocks from CATALOGUE_SOURCES (28 total)
const isHistorique = new Set([
  "faille-prescription-1-an",
  "faille-mentions-obligatoires",
  "faille-erreur-plaque",
  "faille-certificat-etalonnage",
  "faille-travaux-signalisation",
  "faille-meteo-visibilite",
  "faille-cession-vehicule",
  "faille-conducteur-different",
  "faille-paiement-deja-effectue",
  "faille-adresse-erronee",
  "faille-prescription-peine-3ans",
]);

const baseMocks: MockFaille[] = CATALOGUE_SOURCES.map((f) => ({
  id: f.id,
  typeInfraction: f.typeInfraction,
  titreFaille: f.titreFaille,
  articleLoi: f.articleLoi,
  regle: f.regle,
  templateLettre: f.templateLettre,
  source: f.source,
  statut: isHistorique.has(f.id) ? "ACTIVE" : "PROPOSEE",
  reglesDetection: f.reglesDetection as RegleDetection[],
  jurisprudence: f.jurisprudence as JurisprudenceRef[],
  createdAt: new Date(),
}));

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
  // Generate 28 entries (one per catalog faille) - no duplication
  for (let i = 0; i < baseMocks.length; i++) {
    const base = baseMocks[i];
    const validatedStatut = validated.get(base.id);
    mocks.push({
      ...base,
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