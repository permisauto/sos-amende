import { describe, expect, it } from "vitest";
import {
  dateRefLibelle,
  delaiLibelle,
  destinataireLrar,
  numeroRefLibelle,
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
});