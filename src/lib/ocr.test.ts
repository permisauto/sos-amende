import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estTransitoire, extrairePv, getOcrProvider, normaliserPv } from "./ocr";

const PV_TEXTE = `CONTRAVENTION
N° 123456789
Vous êtes avisé d'une infraction commise le 01/07/2026 à 14h32.
Véhicule : AB-123-CD
Montant : 135 €
N° de télé-paiement 123456789, clé 02`;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OCR_PROVIDER;
  delete process.env.GOOGLE_VISION_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.OCR_TIMEOUT_MS;
  delete process.env.OCR_HTTP_TIMEOUT_MS;
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

/** PDF fixture (couche texte réelle, 1,7 Ko) — généré une fois, versionné. */
const PV_PDF = readFileSync(
  fileURLToPath(new URL("./__fixtures__/pv-texte.pdf", import.meta.url)),
);
/** PDF dont la page n'est qu'une image (aucune couche texte) — cas du scan. */
const SCAN_PDF = readFileSync(
  fileURLToPath(new URL("./__fixtures__/pv-scan.pdf", import.meta.url)),
);

/** PDF qui n'est pas un PDF : pdf-parse doit échouer sans jamais lever. */
const PDF_CORROMPU = Buffer.from("%PDF-1.7\nceci n'est pas un pdf");

describe("extrairePv — PDF (couche texte locale, jamais envoyé aux API images)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCR_PROVIDER;
    delete process.env.GOOGLE_VISION_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  it(
    "lit un PDF texte sans appeler l'API d'OCR",
    async () => {
      process.env.OCR_PROVIDER = "google-vision";
      process.env.GOOGLE_VISION_KEY = "cle-test";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await extrairePv(PV_PDF);

      expect(res?.texte).toContain("123456789");
      // Régression du bug : le PDF partait en image.content de images:annotate.
      expect(fetchMock).not.toHaveBeenCalled();
    },
    30_000,
  );

  it("renvoie null sur un PDF corrompu sans lever d'exception", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    await expect(extrairePv(PDF_CORROMPU)).resolves.toBeNull();
  });

  it(
    "PDF scanné (aucun texte) : extrait les images intégrées et les OCRise en image",
    async () => {
      process.env.OCR_PROVIDER = "google-vision";
      process.env.GOOGLE_VISION_KEY = "cle-test";
      const fetchMock = simulerVision([
        { status: 200, body: { responses: [{ fullTextAnnotation: { text: "PLAQUE AB-123-CD" } }] } },
      ]);

      const res = await extrairePv(SCAN_PDF);

      expect(res?.texte).toBe("PLAQUE AB-123-CD");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const corps = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      // La preuve que le PDF n'est plus envoyé tel quel : c'est un PNG en base64.
      expect(corps.requests[0].image.content.startsWith("iVBOR")).toBe(true);
    },
    30_000,
  );

  it("provider absent : null sans lecture du fichier", async () => {
    await expect(extrairePv(PDF_CORROMPU)).resolves.toBeNull();
  });
});

function simulerVision(reponses: Array<{ status: number; body?: unknown }>) {
  const fetchMock = vi.fn<
    (url: RequestInfo | URL, init?: RequestInit) => Promise<unknown>
  >(async () => {
    const r = reponses.shift();
    if (!r) throw new Error("aucune réponse simulée restante");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? { erreur: "boom" }),
      json: async () => r.body ?? {},
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("extrairePv — Google Vision (log, retry, erreur cachée dans le corps)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCR_PROVIDER;
    delete process.env.GOOGLE_VISION_KEY;
  });

  it("lit une image et utilise DOCUMENT_TEXT_DETECTION", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    const fetchMock = simulerVision([
      { status: 200, body: { responses: [{ fullTextAnnotation: { text: "PV lu par Vision" } }] } },
    ]);

    const res = await extrairePv(PNG_1PX);

    expect(res?.texte).toBe("PV lu par Vision");
    const corps = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(corps.requests[0].features[0].type).toBe("DOCUMENT_TEXT_DETECTION");
  });

  it("réessaie sur une erreur gRPC renvoyée en HTTP 200 (quota = code 8)", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    const fetchMock = simulerVision([
      { status: 200, body: { responses: [{ error: { code: 8, message: "RESOURCE_EXHAUSTED" } }] } },
      { status: 200, body: { responses: [{ fullTextAnnotation: { text: "deuxième essai ok" } }] } },
    ]);

    const res = await extrairePv(PNG_1PX);

    expect(res?.texte).toBe("deuxième essai ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("n'envoie jamais un buffer non image (garde-fou format)", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    const fetchMock = simulerVision([]);

    const res = await extrairePv(Buffer.from("pas une image du tout"));

    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normaliserPv — dates : toutes lettres, ISO, validation", () => {
  it("date en toutes lettres → ISO", () => {
    expect(normaliserPv("infraction commise le 1er juillet 2026").date).toBe(
      "2026-07-01",
    );
    expect(normaliserPv("PV établi le 15 févr. 2026").date).toBe("2026-02-15");
  });

  it("date ISO déjà formatée (sortie Gemini)", () => {
    expect(normaliserPv("Date : 2026-07-01").date).toBe("2026-07-01");
  });

  it("date impossible (mois 45) → absente, jamais fabriquée", () => {
    expect(normaliserPv("infraction commise le 13/45/2026").date).toBeUndefined();
  });
});

describe("normaliserPv — n° d'avis contextuel", () => {
  it("privilégie le n° d'avis au n° de télépaiement", () => {
    const out = normaliserPv(
      `Règlement par télépaiement n° 99887766554433
Avis de contravention n° 37592048152634 en date du 01/07/2026`,
    );
    expect(out.num_pv).toBe("37592048152634");
  });

  it("n° près de « n° d'avis » sans libellé « avis de contravention »", () => {
    const out = normaliserPv("N° d'avis: 45678912345678\nMontant : 135 €");
    expect(out.num_pv).toBe("45678912345678");
  });

  it("conserve le repli historique (groupe de chiffres)", () => {
    const out = normaliserPv("CONTRAVENTION\n9876 543 210\n01/07/2026");
    expect(out.num_pv).toBe("9876543210");
  });
});

describe("normaliserPv — télépaiement", () => {
  it("extrait numéro et clé près du libellé", () => {
    const out = normaliserPv(PV_TEXTE);
    expect(out.numTelePaiement).toBe("123456789");
    expect(out.cle).toBe("02");
  });

  it("ne fabrique ni numéro ni clé sans libellé", () => {
    const out = normaliserPv("CONTRAVENTION\nN° 123456789\nMontant : 135 €");
    expect(out.numTelePaiement).toBeUndefined();
    expect(out.cle).toBeUndefined();
  });
});

describe("normaliserPv — plaques (confusions d'OCR)", () => {
  it("répare 0/O et 1/I en contexte véhicule", () => {
    expect(normaliserPv("Véhicule : AB-I23-CD\n01/07/2026").plaque).toBe(
      "AB-123-CD",
    );
    expect(normaliserPv("Véhicule : AB-123-C0\n01/07/2026").plaque).toBe(
      "AB-123-CO",
    );
    expect(normaliserPv("Véhicule immatriculé I234 AB 75\n01/07/2026").plaque).toBe(
      "1234-AB-75",
    );
  });

  it("ne cherche pas de plaque sans contexte véhicule", () => {
    expect(normaliserPv("Contrôle à 12h30 le 01/07/2026").plaque).toBeUndefined();
  });
});

describe("extrairePv — garde-fous temporels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OCR_PROVIDER;
    delete process.env.GOOGLE_VISION_KEY;
    delete process.env.OCR_TIMEOUT_MS;
    delete process.env.OCR_HTTP_TIMEOUT_MS;
  });

  it("watchdog : rend null quand l'OCR dépasse OCR_TIMEOUT_MS", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    process.env.OCR_TIMEOUT_MS = "30";
    process.env.OCR_HTTP_TIMEOUT_MS = "200";
    vi.stubGlobal("fetch", () => new Promise(() => {})); // pend à vie

    const t = Date.now();
    await expect(extrairePv(PNG_1PX)).resolves.toBeNull();
    expect(Date.now() - t).toBeLessThan(2_000);
  });

  it("timeout HTTP → 504 transitoire → 3 tentatives puis null", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    const fetchMock = vi.fn(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(extrairePv(PNG_1PX)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);
});
