import { describe, expect, it } from "vitest";
import {
  estEligibleSuivi,
  joursDepuis,
  lireDecisionDepuisTexte,
  mapperReponseMock,
  numRefExtrait,
} from "./suivi-decision";

const JOUR_MS = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-30T12:00:00Z");

describe("joursDepuis", () => {
  it("calcule le nombre de jours écoulés", () => {
    expect(joursDepuis(new Date(now - 3 * JOUR_MS), now)).toBe(3);
  });
  it("plafonne à 0 une date future", () => {
    expect(joursDepuis(new Date(now + JOUR_MS), now)).toBe(0);
  });
  it("renvoie null sans date", () => {
    expect(joursDepuis(null, now)).toBeNull();
  });
});

describe("estEligibleSuivi", () => {
  const base = {
    statut: "ENVOYE",
    canalEnvoi: "ANTAI",
    decisionAttendueLe: new Date(now - 30 * JOUR_MS),
    decisionRecupereeLe: null,
  };

  it("est éligible après la fenêtre d'attente", () => {
    expect(estEligibleSuivi(base, 21, now)).toBe(true);
  });
  it("n'est pas éligible avant la fenêtre", () => {
    expect(
      estEligibleSuivi(
        { ...base, decisionAttendueLe: new Date(now - 5 * JOUR_MS) },
        21,
        now,
      ),
    ).toBe(false);
  });
  it("refuse un dossier déjà résolu", () => {
    expect(estEligibleSuivi({ ...base, statut: "RESOLU" }, 0, now)).toBe(false);
  });
  it("refuse un canal LRAR (pas de portail)", () => {
    expect(estEligibleSuivi({ ...base, canalEnvoi: "LRAR" }, 0, now)).toBe(false);
  });
  it("refuse une décision déjà récupérée", () => {
    expect(
      estEligibleSuivi(
        { ...base, decisionRecupereeLe: new Date(now - JOUR_MS) },
        0,
        now,
      ),
    ).toBe(false);
  });
  it("refuse sans decisionAttendueLe", () => {
    expect(estEligibleSuivi({ ...base, decisionAttendueLe: null }, 0, now)).toBe(
      false,
    );
  });
});

describe("numRefExtrait", () => {
  it("extrait le num_pv", () => {
    expect(numRefExtrait({ num_pv: "123456789" })).toBe("123456789");
  });
  it("repli sur le numéro de télé-paiement", () => {
    expect(numRefExtrait({ num_telepaiement: "45-1234" })).toBe("45-1234");
  });
  it("renvoie null si aucune référence", () => {
    expect(numRefExtrait({ plaque: "AB-123-CD" })).toBeNull();
  });
});

describe("mapperReponseMock", () => {
  it("normalise une décision", () => {
    const res = mapperReponseMock({
      ok: true,
      statut: "DECISION",
      decision: "ACCEPTE",
      detail: "Requête acceptée",
      reponsePortail: "simulé",
    });
    expect(res).toEqual({
      consulte: true,
      decision: "ACCEPTE",
      detail: "Requête acceptée",
      reponsePortail: "simulé",
    });
  });
  it("normalise une décision en cours", () => {
    const res = mapperReponseMock({
      ok: true,
      statut: "ENCOURS",
      reponsePortail: "en instruction",
    });
    expect(res).toEqual({ consulte: true, decision: null, reponsePortail: "en instruction" });
  });
  it("rejette une réponse illisible (jamais de décision fabriquée)", () => {
    const res = mapperReponseMock({ ok: false } as never);
    expect(res.consulte).toBe(false);
  });
});

describe("lireDecisionDepuisTexte", () => {
  it("identifie une décision acceptée", () => {
    const res = lireDecisionDepuisTexte("Requête acceptée — amende annulée");
    expect(res?.consulte).toBe(true);
    if (res?.consulte) expect(res.decision).toBe("ACCEPTE");
  });
  it("identifie une décision rejetée", () => {
    const res = lireDecisionDepuisTexte("Requête rejetée : la demande est infondée");
    expect(res?.consulte).toBe(true);
    if (res?.consulte) expect(res.decision).toBe("REJETE");
  });
  it("renvoie null sans décision univoque (encours)", () => {
    expect(lireDecisionDepuisTexte("Votre requête a été transmise au service instructeur.")).toBeNull();
  });
  it("renvoie null sur un texte vide", () => {
    expect(lireDecisionDepuisTexte("  ")).toBeNull();
  });
});