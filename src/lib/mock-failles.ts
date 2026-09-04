import type { RegleDetection } from "@/lib/moteur";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import { CATALOGUE_SOURCES } from "@/lib/catalogue-sources";

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

// In-memory store persistant dans le container Vercel
const validatedStore = new Map<string, "ACTIVE" | "INACTIVE">();

function generateMocks(): MockFaille[] {
  const mocks: MockFaille[] = [];
  for (const base of baseMocks) {
    const validatedStatut = validatedStore.get(base.id);
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
  validatedStore.set(id, action);
  return true;
}

export function isMockValidated(id: string): "ACTIVE" | "INACTIVE" | null {
  return validatedStore.get(id) ?? null;
}

export function resetMockValidations(): void {
  validatedStore.clear();
}