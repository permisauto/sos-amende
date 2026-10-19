import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    rateLimitBucket: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "./prisma";
import {
  consommerCreneau,
  purgerFenetresExpirees,
  rateLimitStore,
} from "./rate-limit";

function txMock(queryRaw: ReturnType<typeof vi.fn>) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  return { $queryRaw: queryRaw, $executeRaw: executeRaw };
}

beforeEach(() => {
  delete process.env.RATE_LIMIT_STORE;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("rateLimitStore", () => {
  it("défaut à mémoire (dev/E2E)", () => {
    expect(rateLimitStore()).toBe("memory");
    process.env.RATE_LIMIT_STORE = "";
    expect(rateLimitStore()).toBe("memory");
    process.env.RATE_LIMIT_STORE = "redis";
    expect(rateLimitStore()).toBe("memory");
  });

  it("postgres sur choix explicite", () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    expect(rateLimitStore()).toBe("postgres");
  });
});

describe("consommerCreneau — mémoire (défaut)", () => {
  it("consomme puis bloque à épuisement", async () => {
    expect(await consommerCreneau("m:epuisement", 2, 60_000)).toBe(1);
    expect(await consommerCreneau("m:epuisement", 2, 60_000)).toBe(0);
    expect(await consommerCreneau("m:epuisement", 2, 60_000)).toBe(0);
  });

  it("fenêtre glissante : se libère à expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    expect(await consommerCreneau("m:glissante", 1, 60_000)).toBe(0);
    vi.setSystemTime(new Date("2026-10-19T10:00:30Z"));
    expect(await consommerCreneau("m:glissante", 1, 60_000)).toBe(0);
    vi.setSystemTime(new Date("2026-10-19T10:01:01Z"));
    expect(await consommerCreneau("m:glissante", 1, 60_000)).toBe(0);
    vi.useRealTimers();
  });

  it("cloisonne les clés", async () => {
    expect(await consommerCreneau("m:cle:a", 1, 60_000)).toBe(0);
    expect(await consommerCreneau("m:cle:b", 1, 60_000)).toBe(0);
    expect(await consommerCreneau("m:cle:c", 2, 60_000)).toBe(1);
  });
});

describe("consommerCreneau — postgres", () => {
  it("consomme via la fenêtre renvoyée par l'upsert", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    const queryRaw = vi.fn().mockResolvedValue([{ essais: [] }]);
    const tx = txMock(queryRaw);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: unknown) => (fn as (t: unknown) => Promise<unknown>)(tx),
    );
    expect(await consommerCreneau("p:libre", 2, 60_000)).toBe(1);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("retourne 0 sans écrire quand la fenêtre est pleine", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    const now = Date.now();
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ essais: [now - 1000, now - 500] }]);
    const tx = txMock(queryRaw);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: unknown) => (fn as (t: unknown) => Promise<unknown>)(tx),
    );
    expect(await consommerCreneau("p:pleine", 2, 60_000)).toBe(0);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("ignore les horodatages expirés et les entrées corrompues", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    const now = Date.now();
    const queryRaw = vi.fn().mockResolvedValue([
      { essais: [now - 120_000, "corrompu", null, now - 1000] },
    ]);
    const tx = txMock(queryRaw);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: unknown) => (fn as (t: unknown) => Promise<unknown>)(tx),
    );
    expect(await consommerCreneau("p:corrompu", 2, 60_000)).toBe(0);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("accepte une fenêtre stockée en chaîne JSON", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    const now = Date.now();
    const queryRaw = vi.fn().mockResolvedValue([
      { essais: JSON.stringify([now - 1000]) },
    ]);
    const tx = txMock(queryRaw);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: unknown) => (fn as (t: unknown) => Promise<unknown>)(tx),
    );
    expect(await consommerCreneau("p:json", 2, 60_000)).toBe(0);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("replie sur la mémoire si la BDD est en rade (jamais d'erreur 500)", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("db down"));
    expect(await consommerCreneau("p:db-ko", 2, 60_000)).toBe(1);
    expect(await consommerCreneau("p:db-ko", 2, 60_000)).toBe(0);
  });
});

describe("purgerFenetresExpirees", () => {
  it("no-op hors postgres", async () => {
    expect(await purgerFenetresExpirees()).toBe(0);
    expect(prisma.rateLimitBucket.deleteMany).not.toHaveBeenCalled();
  });

  it("supprime les lignes expirées et compte", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    vi.mocked(prisma.rateLimitBucket.deleteMany).mockResolvedValue({
      count: 2,
      keys: [],
    } as never);
    expect(await purgerFenetresExpirees()).toBe(2);
    expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalledWith({
      where: { expireLe: { lt: expect.any(Date) } },
    });
  });

  it("échec BDD = 0, jamais d'exception", async () => {
    process.env.RATE_LIMIT_STORE = "postgres";
    vi.mocked(prisma.rateLimitBucket.deleteMany).mockRejectedValue(
      new Error("db down"),
    );
    expect(await purgerFenetresExpirees()).toBe(0);
  });
});
