import { describe, expect, it } from "vitest";
import {
  normaliserSiret,
  parserReponseSiret,
  verifierSiret,
} from "./siret";

describe("normaliserSiret", () => {
  it("garde 14 chiffres", () => {
    expect(normaliserSiret("35600000066432")).toBe("35600000066432");
  });

  it("retire les espaces de la saisie humaine", () => {
    expect(normaliserSiret("356 000 000 66432")).toBe("35600000066432");
  });

  it("retire tirets et points", () => {
    expect(normaliserSiret("356-000.000-66432")).toBe("35600000066432");
  });

  it("refuse un SIREN (9 chiffres)", () => {
    expect(normaliserSiret("356000000")).toBeNull();
  });

  it("refuse un numéro trop court", () => {
    expect(normaliserSiret("1234")).toBeNull();
  });

  it("refuse un numéro trop long", () => {
    expect(normaliserSiret("356000000664321")).toBeNull();
  });

  it("refuse une entrée non string", () => {
    expect(normaliserSiret(35600000066432)).toBeNull();
    expect(normaliserSiret(null)).toBeNull();
    expect(normaliserSiret(undefined)).toBeNull();
  });

  it("refuse une chaîne vide ou sans chiffres", () => {
    expect(normaliserSiret("")).toBeNull();
    expect(normaliserSiret("abc")).toBeNull();
  });
});

describe("parserReponseSiret", () => {
  const fixture = {
    results: [
      {
        nom_complet: "SAS EXEMPLE",
        matching_etablissements: [
          {
            siret: "35600000066432",
            adresse: "1 rue de la Paix, 75002 PARIS",
            etat_administratif: "A",
          },
        ],
      },
    ],
  };

  it("extrait denomination, adresse et état", () => {
    const info = parserReponseSiret("35600000066432", fixture);
    expect(info).toEqual({
      siret: "35600000066432",
      denomination: "SAS EXEMPLE",
      adresse: "1 rue de la Paix, 75002 PARIS",
      etatAdministratif: "A",
    });
  });

  it("retombe sur nom_raison_sociale si nom_complet absent", () => {
    const info = parserReponseSiret("35600000066432", {
      results: [
        {
          nom_raison_sociale: "EURL EXEMPLE",
          matching_etablissements: [
            { siret: "35600000066432", etat_administratif: "A" },
          ],
        },
      ],
    });
    expect(info?.denomination).toBe("EURL EXEMPLE");
    expect(info?.adresse).toBeNull();
  });

  it("retourne null si results vide", () => {
    expect(parserReponseSiret("35600000066432", { results: [] })).toBeNull();
  });

  it("retourne null si results absent", () => {
    expect(parserReponseSiret("35600000066432", {})).toBeNull();
  });

  it("retourne null si entrée non objet", () => {
    expect(parserReponseSiret("35600000066432", null)).toBeNull();
    expect(parserReponseSiret("35600000066432", "oops")).toBeNull();
  });

  it("retourne null si aucune dénomination", () => {
    expect(
      parserReponseSiret("35600000066432", {
        results: [{ matching_etablissements: [] }],
      }),
    ).toBeNull();
  });

  it("choisit l'établissement correspondant au SIRET recherché", () => {
    const info = parserReponseSiret("35600000066432", {
      results: [
        {
          nom_complet: "SAS EXEMPLE",
          matching_etablissements: [
            { siret: "99999999999999", adresse: "AUTRE ADRESSE" },
            { siret: "35600000066432", adresse: "BONNE ADRESSE" },
          ],
        },
      ],
    });
    expect(info?.adresse).toBe("BONNE ADRESSE");
    expect(info?.siret).toBe("35600000066432");
  });

  it("retombe sur le premier établissement si aucun ne correspond", () => {
    const info = parserReponseSiret("35600000066432", {
      results: [
        {
          nom_complet: "SAS EXEMPLE",
          matching_etablissements: [
            { siret: "99999999999999", adresse: "SIÈGE" },
          ],
        },
      ],
    });
    expect(info?.adresse).toBe("SIÈGE");
  });
});

describe("verifierSiret", () => {
  it("retourne null si format invalide", async () => {
    expect(await verifierSiret("1234")).toBeNull();
  });

  it("mock : réponse déterministe pour un SIRET valide", async () => {
    const avant = process.env.SIRET_PROVIDER;
    process.env.SIRET_PROVIDER = "mock";
    try {
      const info = await verifierSiret("35600000066432");
      expect(info).not.toBeNull();
      expect(info?.denomination).toBe("SAS ENTREPRISE MOCK");
      expect(info?.etatAdministratif).toBe("A");
    } finally {
      if (avant === undefined) delete process.env.SIRET_PROVIDER;
      else process.env.SIRET_PROVIDER = avant;
    }
  });
});
