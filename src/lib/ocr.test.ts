import { afterEach, describe, expect, it } from "vitest";
import { getOcrProvider, normaliserPv } from "./ocr";

const PV_TEXTE = `CONTRAVENTION
N° 123456789
Vous êtes avisé d'une infraction commise le 01/07/2026 à 14h32.
Véhicule : AB-123-CD
Montant : 135 €
N° de télé-paiement 123456789, clé 02`;

afterEach(() => {
  delete process.env.OCR_PROVIDER;
  delete process.env.GOOGLE_VISION_KEY;
});

describe("normaliserPv", () => {
  it("extrait plaque, date, heure, montant et n° PV", () => {
    expect(normaliserPv(PV_TEXTE)).toMatchObject({
      plaque: "AB-123-CD",
      date: "2026-07-01",
      heure: "14h32",
      montant: "135,00 €",
      num_pv: "123456789",
    });
  });

  it("gère les plaques au format ancien 1234 AB 75", () => {
    const out = normaliserPv("Véhicule 1234 AB 75, le 12/08/2026");
    expect(out.plaque).toBe("1234-AB-75");
  });

  it("gère le format de date sans année complète", () => {
    expect(normaliserPv("commise le 05-03-26 à 9h05").date).toBe("2026-03-05");
  });

  it("renvoie un objet vide sur un texte illisible", () => {
    expect(normaliserPv("aucune donnée exploitable !")).toEqual({});
  });
});

describe("getOcrProvider", () => {
  it("par défaut : aucun provider", () => {
    expect(getOcrProvider()).toBe("aucun");
  });

  it("active le provider mock explicite", () => {
    process.env.OCR_PROVIDER = "mock";
    expect(getOcrProvider()).toBe("mock");
  });

  it("Google Vision exige une clé", () => {
    process.env.OCR_PROVIDER = "google-vision";
    expect(getOcrProvider()).toBe("aucun");
    process.env.GOOGLE_VISION_KEY = "cle-test";
    expect(getOcrProvider()).toBe("google-vision");
  });

  it("Mistral OCR (hébergement UE) exige une clé", () => {
    process.env.OCR_PROVIDER = "mistral-ocr";
    expect(getOcrProvider()).toBe("aucun");
    process.env.MISTRAL_API_KEY = "cle-test";
    expect(getOcrProvider()).toBe("mistral-ocr");
  });

  it("Tesseract.js (local) ne requiert pas de clé", () => {
    process.env.OCR_PROVIDER = "tesseract";
    expect(getOcrProvider()).toBe("tesseract");
  });
});