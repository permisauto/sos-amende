import { describe, expect, it } from "vitest";
import {
  articlesCitesFaille,
  detecterCaducite,
  extraitCaducite,
} from "./veille-caducite";

describe("articlesCitesFaille", () => {
  it("extrait les références d'articles d'une chaîne articleLoi", () => {
    expect(
      articlesCitesFaille("Article L. 224-2 du code de la route ; R. 47-1"),
    ).toEqual(["L224-2", "R47-1"]);
  });

  it("renvoie vide sans article", () => {
    expect(articlesCitesFaille(null)).toEqual([]);
    expect(articlesCitesFaille("")).toEqual([]);
  });
});

describe("detecterCaducite", () => {
  it("signale un article abrogé par un texte ingéré", () => {
    const texte =
      "L'article L. 224-2 du code de la route est abrogé par la loi du 1er juillet 2026.";
    expect(detecterCaducite(texte, new Set(["L224-2"]))).toEqual(["L224-2"]);
  });

  it("signale une modification", () => {
    const texte =
      "Le décret modifie les dispositions de l'article R. 47-1 du code de procédure pénale.";
    expect(detecterCaducite(texte, new Set(["R47-1"]))).toEqual(["R47-1"]);
  });

  it("reste muet sans marqueur d'abrogation, même si l'article est cité", () => {
    const texte = "L'article L. 224-2 prévoit une suspension.";
    expect(detecterCaducite(texte, new Set(["L224-2"]))).toEqual([]);
  });

  it("reste muet si l'article abrogé n'est pas surveillé", () => {
    const texte = "L'article L. 999-9 est abrogé.";
    expect(detecterCaducite(texte, new Set(["L224-2"]))).toEqual([]);
  });
});

describe("extraitCaducite", () => {
  it("extrait un passage verbatim contenant l'article", () => {
    const texte =
      "Diverses dispositions sont modifiées. L'article L. 224-2 est abrogé à compter du 1er janvier.";
    const extrait = extraitCaducite(texte, "L. 224-2");
    expect(extrait).toContain("L. 224-2");
    expect(extrait).toContain("abrogé");
  });
});