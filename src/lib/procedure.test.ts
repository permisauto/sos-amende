import { describe, expect, it } from "vitest";
import {
  detecterProcedure,
  estContentieux,
  estDelit,
  libelleVoieProcedure,
  lireMontant,
  lireVoieProcedure,
  montantDepuisTexte,
} from "./procedure";

describe("lireMontant", () => {
  it("lit un nombre", () => {
    expect(lireMontant(135)).toBe(135);
    expect(lireMontant(0)).toBeNull();
    expect(lireMontant(Number.NaN)).toBeNull();
  });

  it("lit les formes françaises", () => {
    expect(lireMontant("135 €")).toBe(135);
    expect(lireMontant("135,00 €")).toBe(135);
    expect(lireMontant("1 500 €")).toBe(1500);
    expect(lireMontant("1\u00a0500,50 euros")).toBe(1500.5);
    expect(lireMontant("1.500,00 €")).toBe(1500);
  });

  it("refuse une chaîne vide ou illisible", () => {
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("aucun")).toBeNull();
    expect(lireMontant(null)).toBeNull();
  });
});

describe("montantDepuisTexte", () => {
  it("extrait le premier montant en euros", () => {
    expect(montantDepuisTexte("Montant : 135 €")).toBe(135);
    expect(montantDepuisTexte("Amende 1 500 € à payer")).toBe(1500);
    expect(montantDepuisTexte("aucun montant")).toBeNull();
  });
});

describe("detecterProcedure — barème des contraventions", () => {
  const cas: Array<[number, 1 | 2 | 3 | 4 | 5]> = [
    [11, 1],
    [17, 1],
    [33, 1],
    [22, 2],
    [35, 2],
    [75, 2],
    [45, 3],
    [68, 3],
    [180, 3],
    [90, 4],
    [135, 4],
    [375, 4],
    [200, 5],
    [450, 5],
  ];

  for (const [montant, classe] of cas) {
    it(`${montant} € → ${classe}e classe`, () => {
      const d = detecterProcedure({ montant: `${montant} €` });
      expect(d.classe).toBe(classe);
      expect(d.voie).toBe(
        classe <= 3 ? "AMENDE_FORFAITAIRE" : "CONTENTIEUX_CONTRAVENTION",
      );
      expect(d.consignationMontant).toBe(classe <= 3 ? null : montant);
    });
  }

  it("classe 1 à 3 : aucune consignation", () => {
    expect(detecterProcedure({ montant: 68 }).consignationMontant).toBeNull();
  });

  it("classe 4 et 5 : consignation reprise de l'avis", () => {
    expect(detecterProcedure({ montant: 135 }).consignationMontant).toBe(135);
    expect(detecterProcedure({ montant: 200 }).consignationMontant).toBe(200);
  });
});

describe("detecterProcedure — délits", () => {
  it("un montant délictuel usuel est un délit", () => {
    expect(detecterProcedure({ montant: 500 }).voie).toBe("DELIT");
    expect(detecterProcedure({ montant: 800 }).voie).toBe("DELIT");
    expect(detecterProcedure({ montant: "1 600 €" }).voie).toBe("DELIT");
  });

  it("« stupéfiants » prime sur un montant de 5e classe", () => {
    const d = detecterProcedure({
      montant: 200,
      texte: "Infraction : conduite après usage de stupéfiants",
    });
    expect(d.voie).toBe("DELIT");
    expect(d.classe).toBeNull();
  });

  it("une mention forte (tribunal correctionnel) prime sur un montant de contravention", () => {
    expect(
      detecterProcedure({ montant: 135, texte: "Convocation tribunal correctionnel" })
        .voie,
    ).toBe("DELIT");
  });

  it("« délit » seul ne prime pas sur un montant de contravention reconnu", () => {
    const d = detecterProcedure({
      montant: 135,
      texte: "Avis de contravention — un délit peut entraîner une peine",
    });
    expect(d.voie).toBe("CONTENTIEUX_CONTRAVENTION");
  });

  it("« délit » seul, sans montant reconnu, suffit", () => {
    expect(detecterProcedure({ texte: "Citation pour délit" }).voie).toBe("DELIT");
  });

  it("sans permis / sans assurance", () => {
    expect(detecterProcedure({ texte: "Conduite sans permis" }).voie).toBe("DELIT");
    expect(detecterProcedure({ texte: "Défaut d'assurance" }).voie).toBe("DELIT");
  });
});

describe("detecterProcedure — incertitude", () => {
  it("montant 1 500 € : inconnu (le client choisit)", () => {
    const d = detecterProcedure({ montant: 1500 });
    expect(d.voie).toBe("INCONNU");
    expect(d.consignationMontant).toBeNull();
  });

  it("montant absent ou illisible : inconnu", () => {
    expect(detecterProcedure({}).voie).toBe("INCONNU");
    expect(detecterProcedure({ montant: "—" }).voie).toBe("INCONNU");
  });

  it("un montant hors barème reste inconnu", () => {
    expect(detecterProcedure({ montant: 123 }).voie).toBe("INCONNU");
  });

  it("utilise le texte quand le champ montant est vide", () => {
    const d = detecterProcedure({ texte: "Avis de contravention\nMontant : 135 €" });
    expect(d.voie).toBe("CONTENTIEUX_CONTRAVENTION");
    expect(d.classe).toBe(4);
  });
});

describe("helpers", () => {
  it("lireVoieProcedure n'accepte que la liste", () => {
    expect(lireVoieProcedure("DELIT")).toBe("DELIT");
    expect(lireVoieProcedure("CONTENTIEUX_CONTRAVENTION")).toBe(
      "CONTENTIEUX_CONTRAVENTION",
    );
    expect(lireVoieProcedure("AUTRE")).toBeNull();
    expect(lireVoieProcedure(null)).toBeNull();
  });

  it("estContentieux / estDelit", () => {
    expect(estContentieux("CONTENTIEUX_CONTRAVENTION")).toBe(true);
    expect(estContentieux("AMENDE_FORFAITAIRE")).toBe(false);
    expect(estDelit("DELIT")).toBe(true);
    expect(estDelit(null)).toBe(false);
  });

  it("libelleVoieProcedure", () => {
    expect(libelleVoieProcedure("AMENDE_FORFAITAIRE", 3)).toBe(
      "Amende simple (3e classe)",
    );
    expect(libelleVoieProcedure("CONTENTIEUX_CONTRAVENTION", 4)).toBe(
      "Contentieux contraventionnel (4e classe)",
    );
    expect(libelleVoieProcedure("DELIT")).toBe("Délit — avocat nécessaire");
    expect(libelleVoieProcedure(null)).toBe("Procédure à préciser");
  });
});
