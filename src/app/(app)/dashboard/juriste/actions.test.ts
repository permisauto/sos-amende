import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ requireJuristeRedacteur: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossier: { findUnique: vi.fn() },
    dossierFaille: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    dossierEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { requireJuristeRedacteur } from "@/lib/dal";
import { ecarterCandidats, rejeterFaille } from "./actions";

const mockPrisma = prisma as unknown as {
  dossier: { findUnique: ReturnType<typeof vi.fn> };
  dossierFaille: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  dossierEvent: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function form(donnees: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(donnees)) {
    if (Array.isArray(valeur)) valeur.forEach((v) => fd.append(cle, v));
    else fd.append(cle, valeur);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireJuristeRedacteur as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "juriste-1",
    role: "JURISTE",
  });
  mockPrisma.dossier.findUnique.mockResolvedValue({ id: "dossier-1" });
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) =>
    Promise.all(ops),
  );
  mockPrisma.dossierFaille.upsert.mockResolvedValue({});
  mockPrisma.dossierEvent.create.mockResolvedValue({});
});

describe("rejeterFaille (écartement individuel)", () => {
  it("exige un motif d'au moins 5 caractères", async () => {
    const res = await rejeterFaille(
      undefined,
      form({ dossierId: "dossier-1", failleId: "f1", motifEcartement: "ab" }),
    );
    expect(res?.error).toContain("motif d'écartement");
    expect(mockPrisma.dossierFaille.upsert).not.toHaveBeenCalled();
  });

  it("refuse une faille non rattachée au dossier (pas de lien forgé)", async () => {
    mockPrisma.dossierFaille.findFirst.mockResolvedValue(null);
    const res = await rejeterFaille(
      undefined,
      form({
        dossierId: "dossier-1",
        failleId: "f1",
        motifEcartement: "Faits non transposables",
      }),
    );
    expect(res?.error).toBe("Cette faille ne fait pas partie du dossier.");
    expect(mockPrisma.dossierFaille.upsert).not.toHaveBeenCalled();
  });

  it("écarte la faille avec son motif et trace l'événement", async () => {
    mockPrisma.dossierFaille.findFirst.mockResolvedValue({ id: "link-1" });
    const res = await rejeterFaille(
      undefined,
      form({
        dossierId: "dossier-1",
        failleId: "f1",
        motifEcartement: "Faits non transposables au dossier",
      }),
    );
    expect(res).toBeUndefined();
    const upsert = mockPrisma.dossierFaille.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({
      statut: "REJETEE",
      motifEcartement: "Faits non transposables au dossier",
    });
    const evenement = mockPrisma.dossierEvent.create.mock.calls[0][0];
    expect(evenement.data.detail).toContain("Faits non transposables au dossier");
  });
});

describe("ecarterCandidats (écartement en masse)", () => {
  it("exige au moins une faille sélectionnée", async () => {
    const res = await ecarterCandidats(
      undefined,
      form({ dossierId: "dossier-1", motifEcartement: "Motif assez long" }),
    );
    expect(res?.error).toBe("Sélectionnez au moins une faille à écarter.");
  });

  it("exige un motif d'au moins 5 caractères", async () => {
    const res = await ecarterCandidats(
      undefined,
      form({ dossierId: "dossier-1", failleIds: ["f1"], motifEcartement: "ab" }),
    );
    expect(res?.error).toContain("motif d'écartement");
    expect(mockPrisma.dossierFaille.upsert).not.toHaveBeenCalled();
  });

  it("ne déclipse pas une faille déjà CONFIRMEE et trace un seul événement", async () => {
    mockPrisma.dossierFaille.findMany
      .mockResolvedValueOnce([{ failleId: "f1" }]) // confirmées
      .mockResolvedValueOnce([{ failleId: "f1" }, { failleId: "f2" }]); // liées
    const res = await ecarterCandidats(
      undefined,
      form({
        dossierId: "dossier-1",
        failleIds: ["f1", "f2"],
        motifEcartement: "Faits non transposables au dossier",
      }),
    );
    expect(res).toBeUndefined();
    const cibles = mockPrisma.dossierFaille.upsert.mock.calls.map(
      (c: unknown[]) => (c[0] as { create: { failleId: string } }).create.failleId,
    );
    expect(cibles).toEqual(["f2"]);
    expect(mockPrisma.dossierEvent.create).toHaveBeenCalledTimes(1);
  });

  it("refuse quand toutes les failles sélectionnées sont déjà retenues", async () => {
    mockPrisma.dossierFaille.findMany
      .mockResolvedValueOnce([{ failleId: "f1" }])
      .mockResolvedValueOnce([{ failleId: "f1" }]);
    const res = await ecarterCandidats(
      undefined,
      form({
        dossierId: "dossier-1",
        failleIds: ["f1"],
        motifEcartement: "Faits non transposables au dossier",
      }),
    );
    expect(res?.error).toContain("déjà retenues");
    expect(mockPrisma.dossierFaille.upsert).not.toHaveBeenCalled();
  });

  it("refuse une sélection sans aucune faille rattachée au dossier", async () => {
    mockPrisma.dossierFaille.findMany
      .mockResolvedValueOnce([]) // confirmées
      .mockResolvedValueOnce([]); // liées
    const res = await ecarterCandidats(
      undefined,
      form({
        dossierId: "dossier-1",
        failleIds: ["f1", "f2"],
        motifEcartement: "Faits non transposables au dossier",
      }),
    );
    expect(res?.error).toBe(
      "Aucune des failles sélectionnées ne fait partie de ce dossier.",
    );
    expect(mockPrisma.dossierFaille.upsert).not.toHaveBeenCalled();
  });

  it("écarte les failles retenues avec le motif et un événement de synthèse", async () => {
    mockPrisma.dossierFaille.findMany
      .mockResolvedValueOnce([]) // confirmées
      .mockResolvedValueOnce([{ failleId: "f1" }, { failleId: "f2" }]);
    const res = await ecarterCandidats(
      undefined,
      form({
        dossierId: "dossier-1",
        failleIds: ["f1", "f2"],
        motifEcartement: "Faits non transposables au dossier",
      }),
    );
    expect(res).toBeUndefined();
    expect(mockPrisma.dossierFaille.upsert).toHaveBeenCalledTimes(2);
    const evenement = mockPrisma.dossierEvent.create.mock.calls[0][0];
    expect(evenement.data.detail).toContain("2 faille(s) écartée(s)");
    expect(evenement.data.detail).toContain("Faits non transposables au dossier");
  });
});
