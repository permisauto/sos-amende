import { describe, expect, it } from "vitest";
import {
  CHAMPS_DETECTION,
  champsIncertains,
  libelleChamp,
  provenanceChamps,
} from "./confiance-ocr";

const PV = `CONTRAVENTION
Titulaire : MARTIN Jean
Véhicule : AB-123-CD
Montant : 68 €
N° de télé-paiement 123456789, clé 02`;

describe("provenanceChamps", () => {
  it("le champ structuré (provider) prime sur la regex", () => {
    const p = provenanceChamps({ num_pv: "999" }, PV);
    expect(p.num_pv).toBe("structure");
  });

  it("champ lu par la regex locale = regex", () => {
    const p = provenanceChamps(undefined, PV);
    expect(p.plaque).toBe("regex");
    expect(p.montant).toBe("regex");
  });

  it("champ absent (ni struct ni regex) = absent", () => {
    const p = provenanceChamps(undefined, PV);
    // Le PV ci-dessus n'a pas de date d'émission ni de mesure.
    expect(p.dateEmission).toBe("absent");
    expect(p.mesure).toBe("absent");
  });

  it("texte null/undefined → tout absent", () => {
    const p = provenanceChamps(undefined, null);
    for (const champ of CHAMPS_DETECTION) {
      expect(p[champ]).toBe("absent");
    }
  });

  it("respecte la liste blanche (aucun champ inventé hors liste)", () => {
    const p = provenanceChamps(undefined, PV);
    for (const k of Object.keys(p)) {
      expect(CHAMPS_DETECTION).toContain(k);
    }
  });
});

describe("champsIncertains", () => {
  it("liste les champs absents en ordre stable", () => {
    const p = provenanceChamps(undefined, PV);
    const incertains = champsIncertains(p);
    expect(incertains).toContain("dateEmission");
    expect(incertains).toContain("dateVerificationAppareil");
  });
});

describe("libelleChamp", () => {
  it("rend un libellé français", () => {
    expect(libelleChamp("numTelePaiement")).toBe("n° de télépaiement");
    expect(libelleChamp("plaque")).toBe("plaque d'immatriculation");
  });
});