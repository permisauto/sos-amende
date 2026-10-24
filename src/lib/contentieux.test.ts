import { describe, expect, it } from "vitest";
import {
  contentieuxNonRegle,
  MESSAGE_CONTENTIEUX_NON_REGLE,
} from "./contentieux";

describe("contentieuxNonRegle", () => {
  it("bloque un contentieux sans paiement encaissé", () => {
    expect(
      contentieuxNonRegle(
        { type: "AMENDE", voieProcedure: "CONTENTIEUX_CONTRAVENTION" },
        null,
      ),
    ).toBe(true);
  });

  it("laisse passer un contentieux payé", () => {
    expect(
      contentieuxNonRegle(
        { type: "AMENDE", voieProcedure: "CONTENTIEUX_CONTRAVENTION" },
        { id: "pay-1" },
      ),
    ).toBe(false);
  });

  it("ne concerne ni l'amende forfaitaire ni les dossiers sans voie", () => {
    expect(
      contentieuxNonRegle({ type: "AMENDE", voieProcedure: "AMENDE_FORFAITAIRE" }, null),
    ).toBe(false);
    expect(contentieuxNonRegle({ type: "AMENDE", voieProcedure: null }, null)).toBe(
      false,
    );
  });

  it("ne concerne jamais la suspension", () => {
    expect(
      contentieuxNonRegle({ type: "SUSPENSION", voieProcedure: "CONTENTIEUX_CONTRAVENTION" }, null),
    ).toBe(false);
  });

  it("le message nomme le prix de l'offre contentieux", () => {
    expect(MESSAGE_CONTENTIEUX_NON_REGLE).toContain("149");
    expect(MESSAGE_CONTENTIEUX_NON_REGLE).toContain("contentieux");
  });
});
