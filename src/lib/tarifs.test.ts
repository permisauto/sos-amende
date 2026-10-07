import { describe, expect, it } from "vitest";

import {
  PRIX_AMENDE,
  PRIX_OPTION_LRAR,
  PRIX_SUSPENSION,
  estOffreSuspension,
  libelleMontant,
  libelleMontantCentimes,
  montantAvecOption,
  prixBase,
} from "./tarifs";

describe("prixBase", () => {
  it("39 € pour une amende, 199 € pour une suspension", () => {
    expect(prixBase("AMENDE")).toBe(39);
    expect(prixBase("SUSPENSION")).toBe(199);
  });

  it("expose les montants attendus (garde-fou commercial)", () => {
    expect(PRIX_AMENDE).toBe(39);
    expect(PRIX_SUSPENSION).toBe(199);
    expect(PRIX_OPTION_LRAR).toBe(10);
  });
});

describe("montantAvecOption", () => {
  it("n'applique le supplément LRAR que si l'option est cochée", () => {
    expect(montantAvecOption("AMENDE", false)).toBe(39);
    expect(montantAvecOption("SUSPENSION", false)).toBe(199);
  });

  it("ajoute 10 € avec l'option (49 € / 209 €)", () => {
    expect(montantAvecOption("AMENDE", true)).toBe(49);
    expect(montantAvecOption("SUSPENSION", true)).toBe(209);
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
    expect(libelleMontant("SUSPENSION")).toBe("199 €");
    expect(libelleMontant("SUSPENSION", true)).toBe("209 €");
  });

  it("libelleMontantCentimes formate à la française (virgule)", () => {
    expect(libelleMontantCentimes("AMENDE")).toBe("39,00 €");
    expect(libelleMontantCentimes("AMENDE", true)).toBe("49,00 €");
    expect(libelleMontantCentimes("SUSPENSION")).toBe("199,00 €");
  });
});

describe("offre Suspension & Invalidation (offre unique 199 €)", () => {
  it("le pack REP + référé est inclus dans le tarif suspension (plus de 349 €)", () => {
    expect(prixBase("SUSPENSION")).toBe(199);
    expect(montantAvecOption("SUSPENSION", false)).toBe(199);
    expect(montantAvecOption("SUSPENSION", true)).toBe(209);
  });

  it("estOffreSuspension s'appuie sur le montant débité (source de vérité)", () => {
    expect(estOffreSuspension("SUSPENSION", 199)).toBe(true);
    expect(estOffreSuspension("SUSPENSION", 209)).toBe(true);
    // Anciens paiements à 59 € / 69 € : ce n'était pas l'offre 199 €.
    expect(estOffreSuspension("SUSPENSION", 59)).toBe(false);
    expect(estOffreSuspension("SUSPENSION", 69)).toBe(false);
    // Une amende à 199 € n'existe pas : jamais d'offre suspension sur AMENDE.
    expect(estOffreSuspension("AMENDE", 199)).toBe(false);
    expect(estOffreSuspension("AMENDE", 39)).toBe(false);
  });

  it("l'amende reste étanche : 39 € partout", () => {
    expect(prixBase("AMENDE")).toBe(39);
    expect(montantAvecOption("AMENDE", true)).toBe(49);
    expect(libelleMontant("AMENDE")).toBe("39 €");
  });
});
