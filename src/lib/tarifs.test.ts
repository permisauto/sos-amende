import { describe, expect, it } from "vitest";

import {
  PRIX_AMENDE,
  PRIX_OPTION_LRAR,
  PRIX_SUSPENSION,
  libelleMontant,
  libelleMontantCentimes,
  montantAvecOption,
  prixBase,
} from "./tarifs";

describe("prixBase", () => {
  it("39 € pour une amende, 59 € pour une suspension", () => {
    expect(prixBase("AMENDE")).toBe(39);
    expect(prixBase("SUSPENSION")).toBe(59);
  });

  it("expose les montants attendus (garde-fou commercial)", () => {
    expect(PRIX_AMENDE).toBe(39);
    expect(PRIX_SUSPENSION).toBe(59);
    expect(PRIX_OPTION_LRAR).toBe(10);
  });
});

describe("montantAvecOption", () => {
  it("n'applique le supplément LRAR que si l'option est cochée", () => {
    expect(montantAvecOption("AMENDE", false)).toBe(39);
    expect(montantAvecOption("SUSPENSION", false)).toBe(59);
  });

  it("ajoute 10 € avec l'option (49 € / 69 €)", () => {
    expect(montantAvecOption("AMENDE", true)).toBe(49);
    expect(montantAvecOption("SUSPENSION", true)).toBe(69);
  });

  it("est strictement supérieure au tarif de base avec l'option", () => {
    expect(montantAvecOption("AMENDE", true)).toBeGreaterThan(prixBase("AMENDE"));
    expect(montantAvecOption("SUSPENSION", true)).toBeGreaterThan(prixBase("SUSPENSION"));
  });
});

describe("libellés", () => {
  it("libelleMontant formate en euros entiers", () => {
    expect(libelleMontant("AMENDE")).toBe("39 €");
    expect(libelleMontant("AMENDE", true)).toBe("49 €");
    expect(libelleMontant("SUSPENSION", true)).toBe("69 €");
  });

  it("libelleMontantCentimes formate à la française (virgule)", () => {
    expect(libelleMontantCentimes("AMENDE")).toBe("39,00 €");
    expect(libelleMontantCentimes("AMENDE", true)).toBe("49,00 €");
  });
});
