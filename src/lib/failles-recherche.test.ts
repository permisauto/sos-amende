import { describe, expect, it } from "vitest";

import {
  motsClesRecherche,
  normaliserTexteRecherche,
  rechercherFailles,
  type FailleCherchable,
} from "./failles-recherche";

const etalonnage: FailleCherchable = {
  titreFaille: "Certificat d'étalonnage expiré",
  articleLoi: "Arrêté du 27 novembre 1978",
  regle: "Le certificat d'étalonnage du radar devait être valide le jour de l'infraction.",
  templateLettre: "Nous contestons le PV {num_pv} pour défaut d'étalonnage.",
  source: "data.gouv.fr",
  typeInfraction: "AMENDE",
  reglesDetection: [{ type: "etalonnageExpire", champ: "dateExpiration" }],
  jurisprudence: [
    {
      reference: "CA de Rouen, 15 janv. 2020",
      resume: "Absence de certificat d'étalonnage valable = nullité de la procédure.",
    },
  ],
};

const plaque: FailleCherchable = {
  titreFaille: "Erreur de plaque",
  articleLoi: "Article R. 130 du code de la route",
  regle: null,
  templateLettre: "Le numéro de plaque {plaque} est erroné.",
  source: null,
  typeInfraction: "AMENDE",
  reglesDetection: null,
  jurisprudence: null,
};

const suspension: FailleCherchable = {
  titreFaille: "Défaut de notification de la décision",
  articleLoi: "Article L. 224-16 du code de la route",
  regle: null,
  templateLettre: "La décision de suspension n'a pas été notifiée.",
  source: null,
  typeInfraction: "SUSPENSION",
  reglesDetection: null,
  jurisprudence: [
    { reference: "CE, 20 avr. 2021, n° 438114", resume: "Contradictoire préalable." },
  ],
};

const base = [etalonnage, plaque, suspension];

describe("normaliserTexteRecherche", () => {
  it("supprime les accents et met en minuscules", () => {
    expect(normaliserTexteRecherche("Étalonnage")).toBe("etalonnage");
    expect(normaliserTexteRecherche("N° 438114 — Règle")).toBe("n° 438114 — regle");
  });
});

describe("motsClesRecherche", () => {
  it("découpe en mots normalisés et ignore les espaces vides", () => {
    expect(motsClesRecherche("  Étalonnage   PLACe  ")).toEqual([
      "etalonnage",
      "place",
    ]);
    expect(motsClesRecherche("   ")).toEqual([]);
  });
});

describe("rechercherFailles", () => {
  it("requête vide → liste intacte", () => {
    expect(rechercherFailles(base, "   ")).toHaveLength(3);
  });

  it("trouve sans tenir compte de la casse et des accents", () => {
    const res = rechercherFailles(base, "etalonnage");
    expect(res).toHaveLength(1);
    expect(res[0]).toBe(etalonnage);
    expect(rechercherFailles(base, "ÉTALONNAGE")).toHaveLength(1);
  });

  it("plusieurs mots-clés : tous doivent matcher (ET)", () => {
    expect(rechercherFailles(base, "radar etalonnage")).toHaveLength(1);
    expect(rechercherFailles(base, "radar plaque")).toHaveLength(0);
  });

  it("cherche dans la jurisprudence (référence + résumé)", () => {
    expect(rechercherFailles(base, "rouen")).toHaveLength(1);
    expect(rechercherFailles(base, "438114")).toHaveLength(1);
    expect(rechercherFailles(base, "contradictoire")).toHaveLength(1);
  });

  it("cherche dans les règles de détection et le type", () => {
    expect(rechercherFailles(base, "etalonnageExpire")).toHaveLength(1);
    expect(rechercherFailles(base, "suspension")).toHaveLength(1);
  });

  it("aucun résultat → liste vide", () => {
    expect(rechercherFailles(base, "teleportation")).toHaveLength(0);
  });

  it("retourne le même tableau (aucune mutation)", () => {
    const res = rechercherFailles(base, "");
    expect(res).toBe(base);
  });
});
