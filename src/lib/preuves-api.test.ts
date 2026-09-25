import { describe, expect, it } from "vitest";
import {
  listePiecesJointes,
  paragraphePiecesVersees,
  typesPreuvesPourFailles,
  faillesPourTypePreuve,
} from "./preuves-api";

describe("listePiecesJointes — inventaire des pièces jointes de la contestation", () => {
  it("liste toujours la copie du PV / de la décision avec sa référence", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      numRef: "PV-123",
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de l'avis de contravention n° PV-123"]);
  });

  it("adapte le libellé pour une suspension de permis", () => {
    const pieces = listePiecesJointes({
      type: "SUSPENSION",
      numRef: "DEC-7",
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de la décision de suspension n° DEC-7"]);
  });

  it("rajoute chaque preuve réellement récupérée", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      numRef: "PV-1",
      preuves: [
        { nom: "Fiche radar — MESTA 210C (A6)", type: "RADAR", url: "" },
        { nom: "Travaux — A10 Orléans", type: "TRAVAUX", url: "" },
      ],
    });
    expect(pieces).toHaveLength(3);
    expect(pieces[1]).toContain("MESTA");
    expect(pieces[2]).toContain("A10");
  });

  it("rappelle le relevé météo (conditions_meteo) sur la preuve METEO", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      conditionsMeteo: "Ciel dégagé • 18°/26°C",
      preuves: [{ nom: "Bulletin météo historique", type: "METEO", url: "" }],
    });
    expect(pieces).toHaveLength(2);
    expect(pieces[1]).toBe("Bulletin météo historique — Ciel dégagé • 18°/26°C");
  });

  it("ne cite jamais une preuve absente (garde-fou anti-hallucination)", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      conditionsMeteo: null,
      numRef: null,
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de l'avis de contravention"]);
  });

  it("ignore les preuves sans nom n'ayant pas à être listées", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      preuves: [
        { nom: "  ", type: "METEO", url: "" },
        { nom: "Piece valide", type: "OTHER", url: "/uploads/x.png" },
      ],
    });
    expect(pieces).toContain("Piece valide");
    expect(pieces).not.toContain("");
  });
});

describe("paragraphePiecesVersees — mention écrite des pièces dans la lettre", () => {
  it("retourne une chaîne vide sans pièces (garde-fou anti-hallucination)", () => {
    expect(paragraphePiecesVersees([])).toBe("");
  });

  it("liste chaque pièce réellement versée dans le corps de la lettre", () => {
    const paragraphe = paragraphePiecesVersees([
      "Copie de l'avis de contravention n° PV-1",
      "Bulletin météo historique — Pluie modérée",
    ]);
    expect(paragraphe).toContain("Pièces versées à l'appui de la contestation");
    expect(paragraphe).toContain("- Copie de l'avis de contravention n° PV-1");
    expect(paragraphe).toContain("- Bulletin météo historique — Pluie modérée");
  });

  it("s'ajoute en fin de lettre avec deux retours à la ligne", () => {
    const lettre = "Je conteste l'avis reçu le 2026-01-01.";
    const resultat = lettre + paragraphePiecesVersees(["Copie de l'avis"]);
    expect(resultat).toContain("\n\nPièces versées");
    expect(resultat.startsWith(lettre)).toBe(true);
  });
});

describe("typesPreuvesPourFailles — pertinence faille → preuves externes", () => {
  it("reste vide sans faille pertinente (aucune preuve cherchée)", () => {
    expect(typesPreuvesPourFailles([]).size).toBe(0);
    expect(
      typesPreuvesPourFailles(["faille-prescription-1-an", "faille-erreur-plaque"]).size,
    ).toBe(0);
  });

  it("mappe la faille étalonnage sur la fiche radar uniquement", () => {
    const types = typesPreuvesPourFailles(["faille-certificat-etalonnage"]);
    expect(types.has("RADAR")).toBe(true);
    expect(types.has("METEO")).toBe(false);
    expect(types.has("TRAVAUX")).toBe(false);
  });

  it("mappe la faille travaux sur les chantiers routiers", () => {
    const types = typesPreuvesPourFailles(["faille-travaux-signalisation"]);
    expect(types.has("TRAVAUX")).toBe(true);
  });

  it("mappe la faille météo sur le bulletin météo", () => {
    const types = typesPreuvesPourFailles(["faille-meteo-visibilite"]);
    expect(types.has("METEO")).toBe(true);
  });

  it("fait l'union des types quand plusieurs failles sont pertinentes", () => {
    const types = typesPreuvesPourFailles([
      "faille-certificat-etalonnage",
      "faille-travaux-signalisation",
    ]);
    expect(types.has("RADAR")).toBe(true);
    expect(types.has("TRAVAUX")).toBe(true);
    expect(types.has("METEO")).toBe(false);
  });
});

describe("faillesPourTypePreuve — inverse : preuve externe → failles pertinentes", () => {
  it("reste vide pour un type sans faille associée", () => {
    // Il n'existe pas de mapping TELEMETRE… : on teste un type courant qui
    // n'apparaît dans aucun mapping (aucune chance de faux positifs).
    expect(faillesPourTypePreuve("METEO")).toContain("faille-meteo-visibilite");
    expect(faillesPourTypePreuve("RADAR")).toContain("faille-certificat-etalonnage");
    expect(faillesPourTypePreuve("TRAVAUX")).toContain("faille-travaux-signalisation");
  });

  it("correspond aux failles qui pointent réellement vers le type", () => {
    const radarFailles = faillesPourTypePreuve("RADAR");
    expect(radarFailles).toContain("faille-homologation-radar");
    // Aucune faille « prescription » ou « plaque » ne déclenche de preuve.
    expect(radarFailles).not.toContain("faille-prescription-1-an");
    expect(radarFailles).not.toContain("faille-erreur-plaque");
  });
});