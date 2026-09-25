import { describe, expect, it } from "vitest";
import {
  canauxEnvoi,
  dateRefLibelle,
  delaiLibelle,
  destinataireLrar,
  formuleAppel,
  formulePolitesse,
  formaterLettreOfficielle,
  libelleCanal,
  libelleCanalDepuisStockage,
  numeroRefLibelle,
  objetLettre,
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

describe("envoi — formalisme de la lettre", () => {
  it("formule d'appel neutre « Madame, Monsieur, » pour les deux types", () => {
    expect(formuleAppel()).toBe("Madame, Monsieur,");
  });

  it("formule de politesse professionnelle en clôture", () => {
    expect(formulePolitesse()).toContain("considération distinguée");
  });

  it("objet type-aware : avis de contravention vs décision de suspension", () => {
    expect(
      objetLettre({ type: "AMENDE", numRef: "123", dateRef: "2026-05-10" }),
    ).toBe("Contestation de l'avis de contravention n° 123 du 2026-05-10");
    expect(
      objetLettre({ type: "SUSPENSION", numRef: "456", dateRef: "2026-07-01" }),
    ).toBe("Recours contre la décision de suspension n° 456 du 2026-07-01");
  });

  it("objet sans numéro ni date : pas de valeur fabriquée", () => {
    expect(objetLettre({ type: "AMENDE" })).toBe(
      "Contestation de l'avis de contravention",
    );
  });

  it("habillage complet : Objet, P.J., Madame Monsieur, corps, politesse", () => {
    const lettre = formaterLettreOfficielle({
      type: "AMENDE",
      corps: "Je soussigné(e) DUPONT, conteste le PV 123.",
      numRef: "123",
      dateRef: "2026-05-10",
      piecesJointes: ["Copie de l'avis de contravention", "Bulletin météo"],
    });
    expect(lettre.startsWith("Objet : Contestation de l'avis de contravention n° 123")).toBe(true);
    expect(lettre).toContain("P.J. : Copie de l'avis de contravention · Bulletin météo");
    expect(lettre).toContain("Madame, Monsieur,");
    expect(lettre).toContain("Je soussigné(e) DUPONT, conteste le PV 123.");
    expect(lettre.endsWith(formulePolitesse())).toBe(true);
  });

  it("idempotent : une lettre déjà habillée n'est pas re-habillée", () => {
    const uneFois = formaterLettreOfficielle({
      type: "AMENDE",
      corps: "Je conteste le PV 123.",
    });
    const deuxFois = formaterLettreOfficielle({
      type: "AMENDE",
      corps: uneFois,
    });
    expect(deuxFois).toBe(uneFois);
    const nbObjets = deuxFois.split(/^Objet :/m).length - 1;
    expect(nbObjets).toBe(1);
  });

  it("retourne une chaîne vide quand le corps est vide", () => {
    expect(formaterLettreOfficielle({ type: "AMENDE", corps: "  " })).toBe("");
  });
});