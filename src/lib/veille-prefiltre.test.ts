import { describe, expect, it } from "vitest";
import {
  classerParPriorite,
  extraireArticles,
  famillesCitees,
  normaliserArticle,
  prioritePrefiltre,
  resumePriorite,
  type SourcePreparable,
} from "./veille-prefiltre";

const MAINTENANT = new Date("2026-10-22T00:00:00Z");

function source(partial: Partial<SourcePreparable> = {}): SourcePreparable {
  return {
    id: "src-1",
    titre: "TA de Caen, 12/05/2026",
    contenu:
      "Le requérant conteste un avis de contravention pour excès de vitesse. Le code de la route prévoit la suspension du permis. Article L. 234-1 du code de la route.",
    score: 18,
    matchsCore: ["excès de vitesse", "code de la route"],
    dateSource: "2026-05-12",
    etatProposition: null,
    tentatives: null,
    ...partial,
  };
}

describe("extraireArticles", () => {
  it("extrait et normalise les références d'articles", () => {
    expect(extraireArticles("en application de l'article L. 234-1 du code")).toEqual([
      "L234-1",
    ]);
    expect(extraireArticles("selon R224-3 et l'article D. 30-2")).toEqual([
      "R224-3",
      "D30-2",
    ]);
  });

  it("ignore les mentions en minuscule et les doublons", () => {
    expect(extraireArticles("il 3 fois, l 3 articles")).toEqual([]);
    expect(extraireArticles("L. 234-1 et l'article L234-1")).toEqual(["L234-1"]);
  });

  it("capte les articles sans lettre de code (« art. 529 du CPP »)", () => {
    expect(extraireArticles("en application de l'article 529 du code")).toEqual([
      "A529",
    ]);
    expect(extraireArticles("art. 530-1 du Code de procédure pénale")).toEqual([
      "A530-1",
    ]);
    // « art. » suivi d'une lettre de code : traité par l'autre motif.
    expect(extraireArticles("art. L. 121-1 du code")).toEqual(["L121-1"]);
  });

  it("normalise une référence", () => {
    expect(normaliserArticle("L. 234-1")).toBe("L234-1");
    expect(normaliserArticle("article R. 121-3")).toBe("R121-3");
  });
});

describe("famillesCitees", () => {
  it("repère les quatre familles du produit", () => {
    expect(famillesCitees("un radar a relevé un excès de vitesse")).toContain(
      "vitesse",
    );
    expect(famillesCitees("le taux d'alcoolémie mesuré")).toContain("alcool");
    expect(famillesCitees("défaut de stationnement sur la voie publique")).toContain(
      "stationnement",
    );
    expect(famillesCitees("il lui est retiré des points et son permis est suspendu")).toContain(
      "permis",
    );
  });

  it("ne signale aucune famille hors sujet", () => {
    expect(famillesCitees("un impôt de.property foncier contesté")).toEqual([]);
    expect(famillesCitees("")).toEqual([]);
  });
});

describe("prioritePrefiltre", () => {
  it("récompense les termes du domaine, l'article cité et le dispositif", () => {
    const p = prioritePrefiltre(
      source({
        contenu:
          "excès de vitesse, code de la route. ORDONNE : Article 1er : la requête est admise. L. 234-1.",
      }),
      new Set<string>(),
      MAINTENANT,
    );
    expect(p.coreDistincts).toBe(2);
    expect(p.article).toBe("L234-1");
    expect(p.dispositif).toBe(true);
    expect(p.score).toBeGreaterThan(10);
    expect(p.explication).toContain("dispositif extractible");
  });

  it("pénalise un article déjà couvert par une faille ACTIVE", () => {
    const couvert = prioritePrefiltre(
      source(),
      new Set(["L234-1"]),
      MAINTENANT,
    );
    const neuf = prioritePrefiltre(source(), new Set<string>(), MAINTENANT);
    expect(couvert.dejaCouvert).toBe(true);
    expect(neuf.dejaCouvert).toBe(false);
    expect(couvert.score).toBeLessThan(neuf.score);
    expect(couvert.explication).toContain("doublon");
  });

  it("pénalise les échecs d'extraction (rotation du budget)", () => {
    const echec = prioritePrefiltre(
      source({ etatProposition: "echec", tentatives: 2 }),
      new Set<string>(),
      MAINTENANT,
    );
    const frais = prioritePrefiltre(source(), new Set<string>(), MAINTENANT);
    expect(echec.echecs).toBe(2);
    expect(echec.score).toBeLessThan(frais.score);
    expect(echec.explication).toContain("2 échecs d'extraction");
  });

  it("valorise une décision récente", () => {
    const recent = prioritePrefiltre(
      source({ dateSource: "2026-10-01" }),
      new Set<string>(),
      MAINTENANT,
    );
    const ancien = prioritePrefiltre(
      source({ dateSource: "2024-01-05" }),
      new Set<string>(),
      MAINTENANT,
    );
    expect(recent.score).toBe(ancien.score + 2);
  });

  it("reste négatif possible (aucun signal)", () => {
    const p = prioritePrefiltre(
      source({
        titre: "Décision sans rapport",
        contenu: "Un texte sans article ni mot du domaine.",
        matchsCore: [],
        dateSource: null,
      }),
      new Set<string>(),
      MAINTENANT,
    );
    expect(p.explication).toBe("aucun signal");
    expect(p.score).toBe(0);
  });
});

describe("classerParPriorite", () => {
  it("classe par priorité décroissante", () => {
    const faible = source({ id: "a", matchsCore: [], contenu: "rien de neuf." });
    const fort = source({
      id: "b",
      contenu:
        "excès de vitesse, code de la route, ORDONNE : annulation. L. 234-1.",
    });
    const classes = classerParPriorite([faible, fort], new Set<string>(), MAINTENANT);
    expect(classes.map((c) => c.source.id)).toEqual(["b", "a"]);
  });

  it("place une source en échec derrière une source fraîche", () => {
    const echec = source({ id: "echec", etatProposition: "echec", tentatives: 3 });
    const frais = source({ id: "frais", score: 12 });
    const classes = classerParPriorite([echec, frais], new Set<string>(), MAINTENANT);
    expect(classes.map((c) => c.source.id)).toEqual(["frais", "echec"]);
  });

  it("détient un ordre déterministe à égalité (score, puis identifiant)", () => {
    const a = source({ id: "aaa" });
    const b = source({ id: "bbb" });
    const un = classerParPriorite([a, b], new Set<string>(), MAINTENANT);
    const deux = classerParPriorite([b, a], new Set<string>(), MAINTENANT);
    expect(un.map((c) => c.source.id)).toEqual(deux.map((c) => c.source.id));
    expect(un.map((c) => c.source.id)).toEqual(["aaa", "bbb"]);
  });

  it("résume la priorité pour l'interface", () => {
    const p = prioritePrefiltre(source(), new Set<string>(), MAINTENANT);
    expect(resumePriorite(p)).toContain("Priorité");
    expect(resumePriorite(p)).toContain("cite L234-1");
  });
});
