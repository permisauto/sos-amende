import { describe, expect, it } from "vitest";
import {
  BONUS_RESULTAT_VEILLE_MAX,
  bonusResultatVeille,
  historiqueParArticle,
  type HistoriqueParArticle,
} from "./veille-resultat";
import type { HistoriqueFaille } from "./failles-classement";
import type { SourcePreparable } from "./veille-prefiltre";

const historique: HistoriqueFaille[] = [
  { failleId: "faille-a", gagnes: 8, perdus: 2 }, // taux 0.8
  { failleId: "faille-b", gagnes: 2, perdus: 8 }, // taux 0.2
];

const failles = [
  { failleId: "faille-a", articleLoi: "Article L. 224-2 du code de la route" },
  { failleId: "faille-b", articleLoi: "Article R. 47-1 du code" },
];

describe("historiqueParArticle", () => {
  it("associe le taux de réussite aux articles cités", () => {
    const map = historiqueParArticle(historique, failles);
    expect(map.get("L224-2")).toEqual({
      failleId: "L224-2",
      gagnes: 8,
      perdus: 2,
    });
    expect(map.get("R47-1")?.gagnes).toBe(2);
  });
});

function source(contenu: string): SourcePreparable {
  return {
    id: "x",
    titre: "Publication",
    contenu,
    score: 12,
    matchsCore: [],
    dateSource: null,
    etatProposition: null,
    tentatives: null,
  };
}

describe("bonusResultatVeille", () => {
  const map: HistoriqueParArticle = historiqueParArticle(historique, failles);

  it("priorise une publication citant un article à fort taux", () => {
    const bonus = bonusResultatVeille(
      source("L'article L. 224-2 fixe une règle de procédure."),
      map,
    );
    expect(bonus).toBe(Math.round(0.8 * BONUS_RESULTAT_VEILLE_MAX));
  });

  it("n'accorde rien à un article à faible taux", () => {
    const bonus = bonusResultatVeille(
      source("L'article R. 47-1 est contesté."),
      map,
    );
    expect(bonus).toBeLessThanOrEqual(
      Math.round(0.2 * BONUS_RESULTAT_VEILLE_MAX),
    );
  });

  it("reste neutre quand l'échantillon est trop faible", () => {
    const faible = [{ failleId: "f", gagnes: 1, perdus: 0 }];
    const m = historiqueParArticle(faible, [
      { failleId: "f", articleLoi: "Article L. 224-2" },
    ]);
    expect(bonusResultatVeille(source("L'article L. 224-2."), m)).toBe(0);
  });

  it("est neutre sans historique", () => {
    expect(bonusResultatVeille(source("L'article L. 224-2."), new Map())).toBe(0);
  });
});