import { afterEach, describe, expect, it, vi } from "vitest";
import { estTransitoire, extrairePv, getOcrProvider, normaliserPv } from "./ocr";

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

describe("normaliserPv — décision de suspension / lettre 48-48s", () => {
  it("extrait préfecture, durée et motif d'une décision de suspension", () => {
    const d = normaliserPv(
      `DÉCISION DE SUSPENSION N° DEC-2026-0421
      Préfecture de la Gironde
      Date: 01/07/2026
      Durée: 6 mois
      Motif: alcoolémie 0,45 mg/L`,
    );

    expect(d.prefecture).toBe("la Gironde");
    expect(d.duree).toBe("6 mois");
    expect(d.motif).toBe("alcoolémie");
  });

  it("extrait la durée d'une lettre 48/48s sans libellé « durée »", () => {
    const d = normaliserPv(
      `NOTIFICATION DE RÉTENTION
      Préfecture des Bouches-du-Rhône
      3 mois de suspension`,
    );

    expect(d.prefecture).toBe("Bouches-du-Rhône");
    expect(d.duree).toBe("3 mois");
  });

  it("ne prend pas un nombre isolé comme durée (pas de hallucination)", () => {
    const d = normaliserPv(
      `DÉCISION DE SUSPENSION
      Préfecture de Paris
      45 000 € d'amende`,
    );

    expect(d.duree).toBeUndefined();
  });

  it("ignore les champs SUSPENSION sur un PV d'amende", () => {
    const d = normaliserPv(
      `CONTRAVENTION N° PV-2026-001
      Plaque AB-123-CD
      15/03/2026
      Montant 135 €`,
    );

    expect(d.prefecture).toBeUndefined();
    expect(d.duree).toBeUndefined();
  });

  it("ne renvoie pas de préfecture si le texte n'en contient pas", () => {
    const d = normaliserPv("DÉCISION DE SUSPENSION\nMotif: vitesse");

    expect(d.prefecture).toBeUndefined();
  });

  it("ne capture pas la suite de la ligne (date, motif) dans la préfecture", () => {
    const d = normaliserPv(
      "DÉCISION DE SUSPENSION\nPréfecture du Rhône - Date 01/07/2026 - Motif alcoolémie",
    );

    expect(d.prefecture).toBe("Rhône");
  });

it("détecte un dossier 48/48s même sans le mot « suspension »", () => {
    const d = normaliserPv(
      "NOTIFICATION\nVous disposez de 48 heures pour demander un examen\n3 mois de rétention",
    );
    expect(d.duree).toBe("3 mois");
  });
});

/** PNG 1×1 — seul l'en-tête compte, le fetch est simulé. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const REPONSE_OK = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              texte: "CONTRAVENTION N° 123456789",
              plaque: "AB-123-CD",
              date: "2026-07-01",
            }),
          },
        ],
      },
    },
  ],
};

function simulerGemini(reponses: Array<{ status: number; body?: unknown }>) {
  const fetchMock = vi.fn(async () => {
    const r = reponses.shift();
    if (!r) throw new Error("aucune réponse simulée restante");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? { error: "boom" }),
      json: async () => r.body ?? {},
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("estTransitoire", () => {
  it("classe les pannes temporaires comme retriables", () => {
    // 503 « high demand » = saturation momentanée du modèle Flash (cas prod observé).
    expect(estTransitoire(503)).toBe(true);
    expect(estTransitoire(429)).toBe(true);
    expect(estTransitoire(502)).toBe(true);
    expect(estTransitoire(504)).toBe(true);
  });

  it("ne retente pas les erreurs permanentes", () => {
    expect(estTransitoire(400)).toBe(false);
    expect(estTransitoire(401)).toBe(false);
    expect(estTransitoire(403)).toBe(false);
  });
});

describe("extrairePv — retry Gemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCR_PROVIDER;
    delete process.env.GEMINI_API_KEY;
  });

  it("réessaie après un 503 et réussit à la tentative suivante", async () => {
    process.env.OCR_PROVIDER = "gemini-flash";
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = simulerGemini([
      { status: 503 },
      { status: 200, body: REPONSE_OK },
    ]);

    const res = await extrairePv(PNG_1PX);

    expect(res?.extrait?.plaque).toBe("AB-123-CD");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abandonne après épuisement des tentatives sans lever", async () => {
    process.env.OCR_PROVIDER = "gemini-flash";
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = simulerGemini([
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);

    await expect(extrairePv(PNG_1PX)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ne retente pas une erreur permanente (clé invalide)", async () => {
    process.env.OCR_PROVIDER = "gemini-flash";
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = simulerGemini([{ status: 403 }]);

    await expect(extrairePv(PNG_1PX)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
