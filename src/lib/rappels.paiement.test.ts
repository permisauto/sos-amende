import { relancePaiementDue, PAIEMENT_RELANCE_JOURS } from "@/lib/rappels";

describe("relancePaiementDue", () => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  it("returns true when createdAt is exactly J+3", () => {
    const createdAt = new Date(now - 3 * dayMs);
    expect(relancePaiementDue(createdAt, 3)).toBe(true);
  });

  it("returns true when createdAt is older than J+3 (e.g. J+4)", () => {
    const createdAt = new Date(now - 4 * dayMs);
    expect(relancePaiementDue(createdAt, 3)).toBe(true);
  });

  it("returns false when createdAt is newer than J+3 (e.g. J+2)", () => {
    const createdAt = new Date(now - 2 * dayMs);
    expect(relancePaiementDue(createdAt, 3)).toBe(false);
  });

  it("returns true when createdAt is exactly J+7", () => {
    const createdAt = new Date(now - 7 * dayMs);
    expect(relancePaiementDue(createdAt, 7)).toBe(true);
  });

  it("returns true when createdAt is older than J+7 (e.g. J+8)", () => {
    const createdAt = new Date(now - 8 * dayMs);
    expect(relancePaiementDue(createdAt, 7)).toBe(true);
  });

  it("returns false when createdAt is newer than J+7 (e.g. J+6)", () => {
    const createdAt = new Date(now - 6 * dayMs);
    expect(relancePaiementDue(createdAt, 7)).toBe(false);
  });

  it("PAIEMENT_RELANCE_JOURS contains 3 and 7", () => {
    expect(PAIEMENT_RELANCE_JOURS).toEqual([3, 7]);
  });
});