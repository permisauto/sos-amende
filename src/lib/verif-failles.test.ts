import { describe, expect, it } from "vitest";
import {
  faitsDepuisPreuves,
  fusionnerCandidats,
  memesIds,
  type ExistantFaille,
} from "./verif-failles";

describe("faitsDepuisPreuves — pièces versées → faits avérés", () => {
  it("dérive vol / cession / paiement / travaux depuis les pièces", () => {
    const faits = faitsDepuisPreuves({}, [
      { type: "ATTESTATION_VOL", url: "/uploads/vol.png" },
      { type: "ATTESTATION_CESSION", url: "/uploads/cession.png" },
      { type: "RELEVE_PAIEMENT", url: "/uploads/paiement.pdf" },
      { type: "TRAVAUX", url: "" },
    ]);
    expect(faits.vehiculeVole).toBe(true);
    expect(faits.vehiculeCede).toBe(true);
    expect(faits.paiementDejaFait).toBe(true);
    expect(faits.travaux_présents).toBe(true);
  });

  it("ne complète que : ne désactive jamais un fait déjà saisi", () => {
    const faits = faitsDepuisPreuves(
      { vehiculeVole: true, plaqueIncorrecte: true },
      [{ type: "CARTE_GRISE", url: "/uploads/cg.png" }],
    );
    expect(faits.vehiculeVole).toBe(true);
    expect(faits.plaqueIncorrecte).toBe(true);
    expect(faits.vehiculeCede).toBeUndefined();
  });

  it("ignore les types sans fait (météo/radar externes, pièces génériques)", () => {
    const faits = faitsDepuisPreuves({}, [
      { type: "METEO", url: "" },
      { type: "RADAR", url: "" },
      { type: "PHOTO", url: "/uploads/photo.png" },
    ]);
    expect(faits.travaux_présents).toBeUndefined();
    expect(faits.conditions_meteo).toBeUndefined();
  });

  it("ne mutate pas l'entrée", () => {
    const data = { vehiculeVole: true };
    faitsDepuisPreuves(data, [{ type: "ATTESTATION_CESSION", url: "x" }]);
    expect(data).toEqual({ vehiculeVole: true });
  });
});

describe("fusionnerCandidats — détection × décisions du juriste", () => {
  const existants = (l: Array<[string, string]>): ExistantFaille[] =>
    l.map(([failleId, statut]) => ({ failleId, statut }));

  it("conserve les confirmations même si la détection ne les ressort plus", () => {
    const r = fusionnerCandidats(
      existants([["f-conf", "CONFIRMEE"]]),
      ["f-det"],
      [],
      [],
    );
    expect(r.idsLettre).toEqual(["f-det", "f-conf"]);
    expect(r.nouvelles).toEqual(["f-det"]);
  });

  it("ne ressuscite jamais une faille écartée (ni en lettre ni en nouvelle)", () => {
    const r = fusionnerCandidats(
      existants([["f-rej", "REJETEE"]]),
      ["f-rej", "f-det"],
      [],
      [],
    );
    expect(r.idsLettre).toEqual(["f-det"]);
    expect(r.nouvelles).toEqual(["f-det"]);
    expect(r.idsLettre).not.toContain("f-rej");
  });

  it("n'écrit une suggestion IA que sur une ligne existante non écartée", () => {
    const s = (id: string) => ({
      failleId: id,
      suggestionIa: { source: "ia" as const, justification: "fait X du dossier" },
    });
    const r = fusionnerCandidats(
      existants([
        ["f-cand", "CANDIDATE"],
        ["f-rej", "REJETEE"],
      ]),
      ["f-det"],
      [s("f-cand"), s("f-rej"), s("f-inconnu")],
      [],
    );
    expect(r.majs.map((m) => m.failleId)).toEqual(["f-cand"]);
  });

  it("un signalement IA ne remplace pas une suggestion existante, ni une écartée", () => {
    const sig = (id: string) => ({
      failleId: id,
      suggestionIa: { source: "ia" as const, signalement: "fait contradictoire" },
    });
    const sug = {
      failleId: "f-cand",
      suggestionIa: { source: "ia" as const, justification: "fait X" },
    };
    const r = fusionnerCandidats(
      existants([
        ["f-cand", "CANDIDATE"],
        ["f-rej", "REJETEE"],
      ]),
      [],
      [sug],
      [sig("f-cand"), sig("f-rej"), sig("f-autre")],
    );
    expect(r.majs).toHaveLength(1);
    expect(r.majs[0].suggestionIa.justification).toBe("fait X");
  });

  it("idsLettre sans doublon, confirmée déjà détectée non dupliquée", () => {
    const r = fusionnerCandidats(
      existants([["f1", "CONFIRMEE"]]),
      ["f1", "f2"],
      [],
      [],
    );
    expect(r.idsLettre).toEqual(["f1", "f2"]);
  });
});

describe("memesIds", () => {
  it("égalité par ensemble, indépendant de l'ordre", () => {
    expect(memesIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(memesIds(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(memesIds(["a"], ["b"])).toBe(false);
    expect(memesIds([], [])).toBe(true);
  });
});
