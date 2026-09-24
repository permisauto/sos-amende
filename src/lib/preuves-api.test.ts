import { describe, expect, it } from "vitest";
import { listePiecesJointes } from "./preuves-api";

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