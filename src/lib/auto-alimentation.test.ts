import { describe, expect, it } from "vitest";
import {
  CATALOGUE_SOURCES,
  type FailleSourcee,
} from "@/lib/catalogue-sources";
import {
  detecterMisesAJourCatalogue,
  type LigneBase,
} from "@/lib/auto-alimentation";

function ligne(
  entree: FailleSourcee,
  extra: Partial<LigneBase> = {},
): LigneBase {
  return {
    id: entree.id,
    titreFaille: entree.titreFaille,
    articleLoi: entree.articleLoi,
    regle: entree.regle,
    templateLettre: entree.templateLettre,
    source: entree.source,
    statut: "ACTIVE",
    reglesDetection: entree.reglesDetection,
    jurisprudence: entree.jurisprudence,
    ...extra,
  };
}

describe("detecterMisesAJourCatalogue (option B)", () => {
  const entree = CATALOGUE_SOURCES[0];

  it("ne signale rien quand la base est à jour", () => {
    expect(
      detecterMisesAJourCatalogue(CATALOGUE_SOURCES, [
        ligne(CATALOGUE_SOURCES[0]),
        ligne(CATALOGUE_SOURCES[1]),
      ]),
    ).toEqual([]);
  });

  it("ne compare que les failles fournies (pas tout le catalogue)", () => {
    // Deux lignes seulement : le reste du catalogue n'est pas en base.
    const ecarts = detecterMisesAJourCatalogue(CATALOGUE_SOURCES, [
      ligne(entree),
    ]);
    expect(ecarts).toEqual([]);
  });

  it("détecte une règle dégagée modifiée avec le libellé du champ", () => {
    const ecarts = detecterMisesAJourCatalogue(
      [entree],
      [ligne(entree, { regle: "Ancienne rédaction." })],
    );

    expect(ecarts).toHaveLength(1);
    expect(ecarts[0].id).toBe(entree.id);
    expect(ecarts[0].statut).toBe("ACTIVE");
    expect(ecarts[0].champs).toEqual([
      { champ: "Règle dégagée", actuel: "Ancienne rédaction.", propose: entree.regle },
    ]);
  });

  it("détecte un template de lettre évolué (c'est le cas d'usage)", () => {
    const ecarts = detecterMisesAJourCatalogue(
      [entree],
      [ligne(entree, { templateLettre: "Cher Monsieur, … (ancienne version)" })],
    );

    expect(ecarts[0].champs.map((c) => c.champ)).toEqual([
      "Template de lettre",
    ]);
    expect(ecarts[0].champs[0].propose).toBe(entree.templateLettre);
  });

  it("ne signale jamais une faille écartée (INACTIVE)", () => {
    const ecarts = detecterMisesAJourCatalogue(
      [entree],
      [ligne(entree, { statut: "INACTIVE", regle: "Obsolète." })],
    );
    expect(ecarts).toEqual([]);
  });

  it("ne signale pas une faille absente de la base (chemin PROPOSEE normal)", () => {
    const ecarts = detecterMisesAJourCatalogue([entree], []);
    expect(ecarts).toEqual([]);
  });

  it("n'a pas de faux positif quand jsonb a réordonné les clés", () => {
    const jurisprudence = entree.jurisprudence;
    if (jurisprudence.length === 0) return;
    // Lecture jsonb : l'ordre des clés n'est pas garanti (longueur des clés).
    const reordonnee = Object.fromEntries(
      Object.entries(jurisprudence[0]).reverse(),
    );
    expect(reordonnee).toEqual(jurisprudence[0]);

    const ecarts = detecterMisesAJourCatalogue([entree], [
      ligne(entree, { jurisprudence: [reordonnee, ...jurisprudence.slice(1)] }),
    ]);
    expect(ecarts).toEqual([]);
  });

  it("traite regle null en base comme « à compléter »", () => {
    const ecarts = detecterMisesAJourCatalogue([entree], [
      ligne(entree, { regle: null }),
    ]);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0].champs[0].actuel).toBe("");
    expect(ecarts[0].champs[0].propose).toBe(entree.regle);
  });
});
