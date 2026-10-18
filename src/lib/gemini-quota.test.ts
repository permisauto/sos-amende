import { afterEach, describe, expect, it } from "vitest";

import { jourCourant, partExtractionJournaliere, quotaJournalier } from "./gemini-quota";

const ENV = ["GEMINI_QUOTA_JOUR", "GEMINI_PART_EXTRACTION"] as const;

afterEach(() => {
  for (const cle of ENV) delete process.env[cle];
});

describe("quotaJournalier", () => {
  it("vaut 20 par défaut (palier gratuit)", () => {
    expect(quotaJournalier()).toBe(20);
  });

  it("lit GEMINI_QUOTA_JOUR", () => {
    process.env.GEMINI_QUOTA_JOUR = "50";
    expect(quotaJournalier()).toBe(50);
  });

  it("retombe sur 20 si la valeur est illisible ou nulle", () => {
    for (const v of ["", "abc", "0", "-3"]) {
      process.env.GEMINI_QUOTA_JOUR = v;
      expect(quotaJournalier()).toBe(20);
    }
  });
});

describe("partExtractionJournaliere", () => {
  it("vaut 5 par défaut", () => {
    expect(partExtractionJournaliere()).toBe(5);
  });

  it("lit GEMINI_PART_EXTRACTION (0 autorisé)", () => {
    process.env.GEMINI_PART_EXTRACTION = "0";
    expect(partExtractionJournaliere()).toBe(0);
    process.env.GEMINI_PART_EXTRACTION = "12";
    expect(partExtractionJournaliere()).toBe(12);
  });

  it("retombe sur 5 si la valeur est illisible ou négative", () => {
    for (const v of ["", "abc", "-1"]) {
      process.env.GEMINI_PART_EXTRACTION = v;
      expect(partExtractionJournaliere()).toBe(5);
    }
  });
});

describe("jourCourant", () => {
  it("formate une date UTC en YYYY-MM-DD", () => {
    expect(jourCourant(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-18");
    expect(jourCourant(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
