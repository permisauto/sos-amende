import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Lot 1 — pré-filtre déterministe : vérifie que le **budget d'extraction**
 * est dépensé sur les publications les plus exploitables, et non sur celles
 * qui scorcent le plus ou qui échouent déjà à l'extraction.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sourceJuridique: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    failleJuridique: { findMany: vi.fn(), create: vi.fn() },
    autoAlimentationTrace: { create: vi.fn() },
    geminiUsage: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { extrairePropositionsEnAttente } from "./veille-ingestion";

const mock = prisma as unknown as {
  sourceJuridique: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  failleJuridique: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  autoAlimentationTrace: { create: ReturnType<typeof vi.fn> };
  geminiUsage: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
};

function ligne(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    titre: `TA de Caen, 12/05/2026 — ${id}`,
    contenu:
      "excès de vitesse constaté par radar. ORDONNE : Article 1er : la requête est admise. L. 234-1 du code de la route.",
    score: 12,
    matchsCore: ["excès de vitesse", "code de la route"],
    dateSource: new Date("2026-10-15"),
    url: "https://example.test/decision",
    archive: "JADE_20261015",
    proposition: null,
    ...extra,
  };
}

/** Publication_FULL : article cité, dispositif, termes du domaine, récente. */
const LIGNE_EXPLOITABLE = ligne("frais");
/** Publication qui échoue déjà à l'extraction (3 tentatives). */
const LIGNE_EN_ECHEC = ligne("echec", {
  score: 40,
  proposition: { etat: "echec", tentatives: 3 },
});
/** Publication vague : un terme du domaine, pas d'article, pas de dispositif. */
const LIGNE_FAIBLE = ligne("faible", {
  score: 30,
  matchsCore: ["code de la route"],
  contenu: "Le code de la route est applicable à la situation du requérant.",
  dateSource: new Date("2024-01-05"),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERIF_IA_PROVIDER = "mock";
  // Requête des candidats → les lignes de test ; requête d'auto-proposition → vide.
  mock.sourceJuridique.findMany.mockImplementation(async (args: { where?: { proposition?: unknown } }) =>
    args?.where?.proposition
      ? []
      : [LIGNE_EN_ECHEC, LIGNE_FAIBLE, LIGNE_EXPLOITABLE],
  );
  mock.sourceJuridique.update.mockResolvedValue({});
  mock.sourceJuridique.updateMany.mockResolvedValue({ count: 0 });
  // Aucune faille ACTIVE (pas de doublon détecté) ni PROPOSEE.
  mock.failleJuridique.findMany.mockResolvedValue([]);
  mock.failleJuridique.create.mockResolvedValue({ id: "faille-1" });
  mock.autoAlimentationTrace.create.mockResolvedValue({});
  mock.geminiUsage.findUnique.mockResolvedValue({ jour: "2026-10-22", appels: 0 });
  mock.geminiUsage.upsert.mockResolvedValue({});
});

function idsExtraits(): string[] {
  return mock.sourceJuridique.update.mock.calls.map(
    (c) => (c[0] as { where: { id: string } }).where.id,
  );
}

describe("extrairePropositionsEnAttente — pré-filtre déterministe", () => {
  it("dépense le budget sur la publication la plus exploitable", async () => {
    const bilan = await extrairePropositionsEnAttente(1);
    expect(idsExtraits()).toEqual(["frais"]);
    expect(bilan.prefiltrees).toBe(3);
    expect(bilan.deferes).toBe(2);
  });

  it("diffère une publication déjà en échec d'extraction", async () => {
    // « echec » a déjà échoué 3 fois : son score de triage est pénalisé, il
    // passe derrière les autres même si son score de pertinence est le plus
    // élevé.
    mock.sourceJuridique.findMany.mockImplementation(async (args: { where?: { proposition?: unknown } }) =>
      args?.where?.proposition ? [] : [LIGNE_EN_ECHEC, LIGNE_EXPLOITABLE],
    );
    await extrairePropositionsEnAttente(1);
    expect(idsExtraits()).toEqual(["frais"]);
  });

  it("trace la campagne de pré-filtre", async () => {
    await extrairePropositionsEnAttente(1);
    const trace = mock.autoAlimentationTrace.create.mock.calls.find(
      (c) => (c[0] as { data: { campagne: string } }).data.campagne === "pre-filtre-veille",
    );
    expect(trace).toBeDefined();
    expect((trace![0] as { data: { traitees: number } }).data.traitees).toBe(3);
  });

  it("fait tourner la file (fenêtre score + fenêtre ancienneté)", async () => {
    // Une publication ancienne et peu notée n'apparaît pas dans la fenêtre
    // « score » : elle doit quand même entrer dans le lot (sinon la file
    // resterait figée sur les mêmes publications).
    mock.sourceJuridique.findMany.mockImplementation(
      async (args: {
        where?: { proposition?: unknown };
        orderBy?: unknown;
      }) => {
        if (args?.where?.proposition) return [];
        const parScore = Array.isArray(args?.orderBy) && "score" in args.orderBy[0];
        return parScore
          ? [LIGNE_EXPLOITABLE]
          : [LIGNE_FAIBLE, LIGNE_EXPLOITABLE];
      },
    );
    const bilan = await extrairePropositionsEnAttente(1);
    expect(bilan.prefiltrees).toBe(2);
    expect(idsExtraits()).toEqual(["frais"]);
  });
});
