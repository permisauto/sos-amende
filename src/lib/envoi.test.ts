import { describe, expect, it } from "vitest";
import {
  canauxEnvoi,
  dateRefLibelle,
  delaiLibelle,
  destinataireLrar,
  libelleCanal,
  libelleCanalDepuisStockage,
  numeroRefLibelle,
  organismeEnvoi,
  pieceAJoindre,
  portailEnLigne,
  titreAnalyse,
} from "./envoi";

describe("envoi — libellés par type d'infraction", () => {
  it("destinataire LRAR : OMP pour une amende, préfet pour une suspension", () => {
    expect(destinataireLrar("AMENDE")).toContain("OMP");
    expect(destinataireLrar("SUSPENSION")).toContain("préfet");
  });

  it("pièce à joindre adaptée", () => {
    expect(pieceAJoindre("AMENDE")).toContain("avis de contravention");
    expect(pieceAJoindre("SUSPENSION")).toContain("décision");
  });

  it("délais : 45 jours (amende) vs 2 mois (suspension)", () => {
    expect(delaiLibelle("AMENDE")).toContain("45 jours");
    expect(delaiLibelle("SUSPENSION")).toContain("2 mois");
  });

  it("labels du formulaire d'analyse adaptés", () => {
    expect(numeroRefLibelle("AMENDE")).toBe("Numéro de PV");
    expect(numeroRefLibelle("SUSPENSION")).toBe("Numéro de décision");
    expect(dateRefLibelle("AMENDE")).toBe("Date du PV");
    expect(dateRefLibelle("SUSPENSION")).toBe("Date de la décision");
    expect(titreAnalyse("AMENDE")).toContain("avis");
    expect(titreAnalyse("SUSPENSION")).toContain("décision");
  });

  it("portails officiels de dépôt en ligne : ANTAI vs Télérecours", () => {
    const amende = portailEnLigne("AMENDE");
    expect(amende.label).toContain("ANTAI");
    expect(amende.url).toContain("usagers.antai.gouv.fr");

    const suspension = portailEnLigne("SUSPENSION");
    expect(suspension.label).toContain("Télérecours");
    expect(suspension.url).toContain("citoyens.telerecours.fr");
  });

  it("organisme destinataire de l'envoi automatisé", () => {
    expect(organismeEnvoi("AMENDE")).toContain("ANTAI");
    expect(organismeEnvoi("SUSPENSION")).toContain("Télérecours");
  });

  it("canaux d'envoi restreints au type d'infraction", () => {
    expect(canauxEnvoi("AMENDE")).toEqual(["ANTAI", "LRAR"]);
    expect(canauxEnvoi("SUSPENSION")).toEqual(["TELERECOURS", "LRAR"]);
    // Jamais de Télérecours pour une amende, jamais d'ANTAI pour une suspension.
    expect(canauxEnvoi("AMENDE")).not.toContain("TELERECOURS");
    expect(canauxEnvoi("SUSPENSION")).not.toContain("ANTAI");
  });

  it("libellés de canal explicites", () => {
    expect(libelleCanal("ANTAI")).toContain("ANTAI");
    expect(libelleCanal("TELERECOURS")).toContain("Télérecours");
    expect(libelleCanal("LRAR")).toContain("recommandé");
  });

  it("libellé de canal depuis la valeur stockée, avec repli sur le défaut du type", () => {
    expect(libelleCanalDepuisStockage("LRAR", "AMENDE")).toContain("recommandé");
    expect(libelleCanalDepuisStockage(null, "AMENDE")).toContain("ANTAI");
    expect(libelleCanalDepuisStockage("", "SUSPENSION")).toContain("Télérecours");
  });
});