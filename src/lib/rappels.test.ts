import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossier: { findMany: vi.fn() },
    rappel: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { RAPPEL_TYPES, rappelDue } from "./rappels";

/** Date limite placée dans `jours` jours (positif = recours encore ouvert). */
function limiteDans(jours: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d;
}

describe("rappelDue", () => {
  it("J10 : dû entre 4 et 10 jours restants", () => {
    expect(rappelDue(limiteDans(10), "J10")).toBe(true);
    expect(rappelDue(limiteDans(7), "J10")).toBe(true);
    expect(rappelDue(limiteDans(4), "J10")).toBe(true);
  });

  it("J10 : pas dû au-delà de 10 jours ni à 3 jours ou moins", () => {
    expect(rappelDue(limiteDans(11), "J10")).toBe(false);
    expect(rappelDue(limiteDans(30), "J10")).toBe(false);
    expect(rappelDue(limiteDans(3), "J10")).toBe(false);
  });

  it("J3 : dû entre 1 et 3 jours restants", () => {
    expect(rappelDue(limiteDans(3), "J3")).toBe(true);
    expect(rappelDue(limiteDans(1), "J3")).toBe(true);
  });

  it("J3 : pas dû au-delà de 3 jours ni une fois échu", () => {
    expect(rappelDue(limiteDans(4), "J3")).toBe(false);
    expect(rappelDue(limiteDans(-1), "J3")).toBe(false);
  });

  it("J0 : dû uniquement une fois le délai dépassé", () => {
    expect(rappelDue(limiteDans(0), "J0")).toBe(true);
    expect(rappelDue(limiteDans(-5), "J0")).toBe(true);
    expect(rappelDue(limiteDans(5), "J0")).toBe(false);
  });

  it("les fenêtres J10/J3/J0 ne se chevauchent pas", () => {
    for (const jours of [-1, 0, 1, 3, 4, 10, 11, 45]) {
      const dus = RAPPEL_TYPES.filter((t) => rappelDue(limiteDans(jours), t));
      expect(dus.length).toBeLessThanOrEqual(1);
    }
  });
});
