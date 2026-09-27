import { describe, expect, it } from "vitest";
import {
  extraireDerniereEditionJorf,
  formaterEditionJorf,
  tokenEditionJorf,
} from "./veille-juridique";

describe("extraireDerniereEditionJorf — parsing de l'index opendata DILA/JORF", () => {
  it("retourne l'édition la plus récente d'un listing (ordre du répertoire)", () => {
    const listing = [
      "Index of /OPENDATA/JORF",
      "AVERTISSEMENT-metadonnees_textes_entreprise_20181212.pdf",
      "Freemium_jorf_global_20250713-140000.tar.gz",
      "JORF_20250113-002503.tar.gz",
      "JORF_20260611-215545.tar.gz",
      "JORF_20261130-205735.tar.gz",
    ].join("\n");
    const e = extraireDerniereEditionJorf(listing);
    expect(e).toEqual({
      dateEdition: "20261130",
      heureEdition: "205735",
      fichier: "JORF_20261130-205735.tar.gz",
    });
  });

  it("ignore les fichiers qui ne sont pas des éditions JORF (PDF, sommaires)", () => {
    const listing = [
      "parent directory",
      "DILA_JORF_Presentation_20170824.pdf",
      "JORF_20261205-002621.tar.gz",
    ].join("\n");
    const e = extraireDerniereEditionJorf(listing);
    expect(e?.fichier).toBe("JORF_20261205-002621.tar.gz");
  });

  it("retourne null sans aucune édition", () => {
    expect(extraireDerniereEditionJorf("rien ici")).toBeNull();
  });
});

describe("formaterEditionJorf — libellé humain", () => {
  it("formate date et heure de parution", () => {
    expect(
      formaterEditionJorf({
        dateEdition: "20260611",
        heureEdition: "215545",
        fichier: "JORF_20260611-215545.tar.gz",
      }),
    ).toBe("11/06/2026 à 21h55");
  });
});

describe("tokenEditionJorf — identifiant persistant pour la trace", () => {
  it("encode l'édition dans un format exploitable en base", () => {
    expect(
      tokenEditionJorf({
        dateEdition: "20260611",
        heureEdition: "215545",
        fichier: "JORF_20260611-215545.tar.gz",
      }),
    ).toBe("edition=JORF_20260611-215545.tar.gz");
  });
});