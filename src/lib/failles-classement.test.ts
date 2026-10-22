import { describe, expect, it } from "vitest";
import {
  bonusHistorique,
  classerCandidats,
  detecterContradictions,
  MAX_MOYENS_LETTRE,
  principaleProposee,
  selectionnerMoyens,
  type CandidatAclasser,
  type HistoriqueFaille,
} from "./failles-classement";
import { faitsDepuisPreuves } from "./verif-failles";

const c = (
  failleId: string,
  score: number,
  extra: Partial<CandidatAclasser> = {},
): CandidatAclasser => ({ failleId, score, active: true, ...extra });

describe("bonusHistorique", () => {
  it("neutre sans historique", () => {
    expect(bonusHistorique(undefined)).toBe(0);
  });

  it("neutre sous l'échantillon minimum", () => {
    const h: HistoriqueFaille = { failleId: "x", gagnes: 1, perdus: 0 };
    expect(bonusHistorique(h)).toBe(0);
  });

  it("bonus positif borné pour un bon taux", () => {
    const h: HistoriqueFaille = { failleId: "x", gagnes: 3, perdus: 0 };
    expect(bonusHistorique(h)).toBe(8); // taux 1 → borné à +8
  });

  it("malus borné pour un mauvais taux", () => {
    const h: HistoriqueFaille = { failleId: "x", gagnes: 0, perdus: 3 };
    expect(bonusHistorique(h)).toBe(-8);
  });

  it("neutre à 50 %", () => {
    const h: HistoriqueFaille = { failleId: "x", gagnes: 2, perdus: 2 };
    expect(bonusHistorique(h)).toBe(0);
  });
});

describe("detecterContradictions", () => {
  it("aucune alerte si faits absents", () => {
    expect(detecterContradictions({})).toEqual([]);
  });

  it("signale véhicule volé ⟂ conducteur différent", () => {
    const out = detecterContradictions({
      vehiculeVole: true,
      conducteurDifferent: true,
    });
    expect(out.map((a) => a.cle)).toEqual(["vehicule-vole-vs-conducteur"]);
  });

  it("signale véhicule cédé ⟂ conducteur différent", () => {
    const out = detecterContradictions({
      vehiculeCede: true,
      conducteurDifferent: true,
    });
    expect(out.map((a) => a.cle)).toEqual(["vehicule-cede-vs-conducteur"]);
  });

  it("aucune alerte pour un fait isolé", () => {
    expect(detecterContradictions({ vehiculeVole: true })).toEqual([]);
  });
});

describe("classerCandidats", () => {
  it("classe par score décroissant", () => {
    const out = classerCandidats([c("a", 10), c("b", 50), c("c", 30)]);
    expect(out.sort((x, y) => x.rangOrdre - y.rangOrdre).map((r) => r.failleId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("les confirmées passent devant, même à score inférieur", () => {
    const out = classerCandidats([c("a", 50), c("b", 10, { confirmee: true })]);
    expect(principaleProposee(out)).toBe("b");
  });

  it("exclut les rejetées et les non-ACTIVE du classement", () => {
    const out = classerCandidats([
      c("a", 50),
      c("b", 90, { rejetee: true }),
      c("c", 80, { active: false }),
    ]);
    expect(out.filter((r) => r.rangOrdre >= 0).map((r) => r.failleId)).toEqual(["a"]);
    expect(out.find((r) => r.failleId === "b")!.rangOrdre).toBe(-1);
    expect(out.find((r) => r.failleId === "c")!.rangOrdre).toBe(-1);
  });

  it("repli déterministe sur l'ordre d'entrée à score égal", () => {
    const out = classerCandidats([c("a", 20), c("b", 20), c("c", 20)]);
    expect(out.sort((x, y) => x.rangOrdre - y.rangOrdre).map((r) => r.failleId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("l'historique module le rang sans écraser la corroboration", () => {
    const histo: HistoriqueFaille[] = [
      { failleId: "a", gagnes: 3, perdus: 0 }, // +8
      { failleId: "b", gagnes: 0, perdus: 3 }, // -8
    ];
    const out = classerCandidats([c("a", 40), c("b", 50)], histo);
    // a : 48, b : 42 → a passe devant malgré un score brut inférieur.
    expect(principaleProposee(out)).toBe("a");
  });
});

describe("selectionnerMoyens", () => {
  it("retient tous les moyens si sous le plafond", () => {
    const candidats = [c("a", 50), c("b", 30)];
    const out = selectionnerMoyens(classerCandidats(candidats), candidats);
    expect(out.retenus).toEqual(["a", "b"]);
    expect(out.ecartes).toEqual([]);
  });

  it("plafonne à MAX_MOYENS_LETTRE et signale les écartés", () => {
    const candidats = [c("a", 50), c("b", 40), c("c", 30), c("d", 20)];
    const out = selectionnerMoyens(classerCandidats(candidats), candidats);
    expect(out.retenus).toEqual(["a", "b", "c"]);
    expect(out.ecartes).toEqual(["d"]);
    expect(out.retenus.length).toBe(MAX_MOYENS_LETTRE);
  });

  it("la faille confirmée par le juriste reste la principale des moyens retenus", () => {
    const candidats = [
      c("a", 90),
      c("b", 20, { confirmee: true }),
      c("c", 60),
      c("d", 50),
    ];
    const out = selectionnerMoyens(classerCandidats(candidats), candidats);
    // b est confirmée : elle passe devant tout le classement.
    expect(out.retenus[0]).toBe("b");
    expect(out.retenus).toHaveLength(MAX_MOYENS_LETTRE);
  });
});

describe("cohérence faits / pièces / questionnaire", () => {
  it("une pièce versée (vol) contredit la case « conducteur différent »", () => {
    // Le client a déclaré un conducteur différent, mais une attestation de vol
    // est versée : les deux faits sont incompatibles → alerte au juriste.
    const faits = faitsDepuisPreuves(
      { conducteurDifferent: true },
      [{ type: "ATTESTATION_VOL", url: "/uploads/attestation-vol.png" }],
    );
    expect(faits.vehiculeVole).toBe(true);
    const alertes = detecterContradictions(faits);
    expect(alertes.map((a) => a.cle)).toEqual(["vehicule-vole-vs-conducteur"]);
  });

  it("aucune contradiction si les pièces confirment le conducteur différent", () => {
    const faits = faitsDepuisPreuves(
      { conducteurDifferent: true },
      [{ type: "ATTESTATION_CESSION", url: "/uploads/cession.png" }],
    );
    expect(faits.vehiculeCede).toBe(true);
    // Cession + conducteur différent : alerte (un seul des deux peut fonder
    // la contestation) — signalée, jamais tranchée automatiquement.
    expect(detecterContradictions(faits)).toHaveLength(1);
  });
});
