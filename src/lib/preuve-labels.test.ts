import { describe, expect, it } from "vitest";
import { PREUVE_CLIENT_TYPES, QUESTIONS_CIBLEES } from "./questions";
import { TYPE_LABELS, libellePreuve } from "./preuve-labels";

describe("libellés des pièces", () => {
  it("chaque pièce appelée par le questionnaire a un libellé affichable", () => {
    const cibles = QUESTIONS_CIBLEES.filter((q) => q.preuveClient);
    expect(cibles.length).toBeGreaterThan(0);
    for (const q of cibles) {
      const lib = TYPE_LABELS[q.preuveClient as string];
      expect(lib, `libellé manquant pour ${q.preuveClient}`).toBeTruthy();
      expect(lib).not.toBe(q.preuveClient);
    }
  });

  it("chaque type téléversable (PREUVE_CLIENT_TYPES) a un libellé affichable", () => {
    expect(PREUVE_CLIENT_TYPES.length).toBeGreaterThanOrEqual(16);
    for (const type of PREUVE_CLIENT_TYPES) {
      const lib = TYPE_LABELS[type];
      expect(lib, `libellé manquant pour ${type}`).toBeTruthy();
      expect(lib).not.toBe(type);
    }
  });

  it("lot R2 : chaque pièce d'une option radio a un libellé affichable", () => {
    let total = 0;
    for (const q of QUESTIONS_CIBLEES) {
      for (const types of Object.values(q.preuvesOption ?? {})) {
        for (const type of types ?? []) {
          total += 1;
          const lib = TYPE_LABELS[type];
          expect(lib, `libellé manquant pour ${type}`).toBeTruthy();
          expect(lib).not.toBe(type);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(7);
  });

  it("aucun libellé vide dans la table", () => {
    for (const [type, lib] of Object.entries(TYPE_LABELS)) {
      expect(lib.trim().length, `libellé vide pour ${type}`).toBeGreaterThan(0);
    }
  });

  it("type inconnu → la clé telle quelle (jamais de crash d'affichage)", () => {
    expect(libellePreuve("TYPE_INCONNU")).toBe("TYPE_INCONNU");
    expect(libellePreuve("RELEVE_PAIEMENT")).toBe("Relevé de paiement");
  });
});
