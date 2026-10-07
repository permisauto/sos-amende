import { describe, expect, it } from "vitest";
import {
  MAX_MOTIFS_NOUVEAUX,
  enrichissementActif,
  enrichirApresOcr,
  planEnrichissement,
  planNouvellesFailles,
} from "./auto-enrichissement";
import type { MajSuggestion } from "./verif-failles";

const s = (failleId: string): MajSuggestion => ({
  failleId,
  suggestionIa: {
    source: "ia",
    pertinence: "forte",
    justification: `Faits du dossier qui fondent ${failleId}.`,
    at: "2026-10-07T10:00:00.000Z",
  },
});

const sig = (failleId: string): MajSuggestion => ({
  failleId,
  suggestionIa: {
    source: "ia",
    signalement: "Un fait contredit la détection de cette faille.",
    at: "2026-10-07T10:00:00.000Z",
  },
});

describe("planEnrichissement (écritures post-analyse)", () => {
  it("crée une candidature pour une suggestion sur un id inédit", () => {
    const plan = planEnrichissement([], [s("faille-x")], []);
    expect(plan.creations.map((c) => c.failleId)).toEqual(["faille-x"]);
    expect(plan.majs).toEqual([]);
  });

  it("complète une candidature existante non annotée (maj)", () => {
    const plan = planEnrichissement(
      [{ failleId: "faille-a", statut: "CANDIDATE" }],
      [s("faille-a")],
      [],
    );
    expect(plan.creations).toEqual([]);
    expect(plan.majs.map((m) => m.failleId)).toEqual(["faille-a"]);
  });

  it("ne remplace jamais une annotation existante (vérification déjà tracée)", () => {
    const plan = planEnrichissement(
      [
        {
          failleId: "faille-a",
          statut: "CANDIDATE",
          suggestionIa: { source: "ia", justification: "déjà tracée" },
        },
      ],
      [s("faille-a")],
      [],
    );
    expect(plan.creations).toEqual([]);
    expect(plan.majs).toEqual([]);
  });

  it("ne réécrit ni ne recrée une faille écartée par le juriste", () => {
    const plan = planEnrichissement(
      [{ failleId: "faille-a", statut: "REJETEE" }],
      [s("faille-a")],
      [sig("faille-a")],
    );
    expect(plan.creations).toEqual([]);
    expect(plan.majs).toEqual([]);
  });

  it("un signalement ne crée jamais de ligne (il ne renseigne qu'une candidature)", () => {
    const plan = planEnrichissement([], [], [sig("faille-x")]);
    expect(plan.creations).toEqual([]);
    expect(plan.majs).toEqual([]);
  });

  it("la suggestion prime sur le signalement pour la même faille", () => {
    const plan = planEnrichissement(
      [{ failleId: "faille-a", statut: "CANDIDATE" }],
      [s("faille-a")],
      [sig("faille-a")],
    );
    expect(plan.majs).toHaveLength(1);
    expect(plan.majs[0].suggestionIa.justification).toBeDefined();
    expect(plan.majs[0].suggestionIa.signalement).toBeUndefined();
  });

  it("annoter une confirmation déjà posée reste possible (comme le flux manuel)", () => {
    const plan = planEnrichissement(
      [{ failleId: "faille-a", statut: "CONFIRMEE" }],
      [s("faille-a")],
      [],
    );
    expect(plan.majs.map((m) => m.failleId)).toEqual(["faille-a"]);
  });

  it("déduplique une suggestion répétée (une seule écriture)", () => {
    const plan = planEnrichissement([], [s("faille-x"), s("faille-x")], []);
    expect(plan.creations).toHaveLength(1);
  });
});

describe("enrichissementActif (provider IA)", () => {
  it("mock = actif, off = coupé", () => {
    expect(enrichissementActif({ VERIF_IA_PROVIDER: "mock" })).toBe(true);
    expect(enrichissementActif({ VERIF_IA_PROVIDER: "off" })).toBe(false);
  });

  it("gemini = actif seulement avec une clé", () => {
    expect(enrichissementActif({ VERIF_IA_PROVIDER: "gemini" })).toBe(false);
    expect(
      enrichissementActif({
        VERIF_IA_PROVIDER: "gemini",
        GEMINI_API_KEY: "k",
      }),
    ).toBe(true);
    expect(enrichissementActif({ GEMINI_API_KEY: "k" })).toBe(true);
    expect(enrichissementActif({})).toBe(false);
  });
});

describe("enrichirApresOcr — garde-fous", () => {
  it("sans provider configuré : ignore sans toucher à la base", async () => {
    const prevProvider = process.env.VERIF_IA_PROVIDER;
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.VERIF_IA_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    try {
      const r = await enrichirApresOcr("dossier-quelconque");
      expect(r.statut).toBe("ignore");
      if (r.statut === "ignore") {
        expect(r.motif).toContain("IA non configurée");
      }
    } finally {
      if (prevProvider !== undefined) {
        process.env.VERIF_IA_PROVIDER = prevProvider;
      }
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });
});

describe("planNouvellesFailles — propositions PROPOSEE (lot H2)", () => {
  const motif = (
    titre: string,
    observation = "Constat factuel suffisamment long pour fonder une proposition.",
    articleCite?: string,
  ) => ({ titre, observation, articleCite });

  it("propose un motif inédit, sans template (l'IA ne rédige jamais de lettre)", () => {
    const plan = planNouvellesFailles(
      [
        motif(
          "Absence de mention du stage obligatoire",
          "Le document ne comporte aucune mention du stage de sensibilisation obligatoire.",
          "art. R. 232-14",
        ),
      ],
      ["Prescription de l'action publique"],
      "Le document mentionne l'art. R. 232-14 du code de la route.",
      "AMENDE",
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].id.startsWith("proposition-ia-")).toBe(true);
    expect(plan[0].typeInfraction).toBe("AMENDE");
    expect(plan[0].regle).toContain("stage");
    // Article conservé uniquement s'il figure textuellement dans le document.
    expect(plan[0].articleLoi).toBe("art. R. 232-14");
    expect(plan).not.toHaveProperty("templateLettre");
    expect(JSON.stringify(plan)).not.toContain("template");
  });

  it("refuse l'article si absent du texte (jamais d'article halluciné)", () => {
    const plan = planNouvellesFailles(
      [motif("Motif sans ancrage textuel ici", undefined, "art. L. 999-9")],
      [],
      "Procès-verbal de contravention classique sans article particulier.",
      "SUSPENSION",
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].articleLoi).toBe("");
  });

  it("déduplique contre le catalogue existant (casse/accents/ponctuation)", () => {
    const plan = planNouvellesFailles(
      [
        motif("Défaut de motivation de l'arrêté 3F"),
        motif("DEFAUT DE MOTIVATION de l'arrete 3f !"),
      ],
      ["Défaut de motivation de l'arrêté 3F"],
      "texte",
      "SUSPENSION",
    );
    expect(plan).toHaveLength(0);
  });

  it("plafonne à MAX_MOTIFS_NOUVEAUX par passage", () => {
    const motifs = Array.from({ length: 6 }, (_, i) =>
      motif(`Motif anormal distinct numéro ${i} sur le document`),
    );
    const plan = planNouvellesFailles(motifs, [], "texte", "AMENDE");
    expect(plan).toHaveLength(MAX_MOTIFS_NOUVEAUX);
  });

  it("id déterministe pour un même titre (idempotence createMany skipDuplicates)", () => {
    const m = motif("Mention de consignation absente du document");
    const a = planNouvellesFailles([m], [], "texte", "SUSPENSION");
    const b = planNouvellesFailles([m], [], "autre texte", "SUSPENSION");
    expect(a[0].id).toBe(b[0].id);
  });

  it("écarte une observation trop courte (pas de ligne sans substance)", () => {
    const plan = planNouvellesFailles(
      [{ titre: "Motif valide mais observation vide", observation: "court" }],
      [],
      "texte",
      "AMENDE",
    );
    expect(plan).toHaveLength(0);
  });
});
