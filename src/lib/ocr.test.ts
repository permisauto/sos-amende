import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estTransitoire, extrairePv, fusionnerPrefill, getOcrProvider, normaliserPv } from "./ocr";

const PV_TEXTE = `CONTRAVENTION
N° 123456789
Vous êtes avisé d'une infraction commise le 01/07/2026 à 14h32.
Véhicule : AB-123-CD
Montant : 135 €
N° de télé-paiement 123456789, clé 02`;

/** Extrait réel d'un avis de contravention à couche texte (prod 2026-10-06) :
 * c'est ce document qui révélait le champ « Nom » vide côté client. */
const PV_OFFICIEL = `RÉPUBLIQUE FRANÇAISE
Ministère de l'Intérieur
AVIS DE CONTRAVENTION
Numéro de l'avis : 37592048152634
Date de l'avis : 14/04/2026
1. DESCRIPTION DE L'INFRACTION
Nature : Excès de vitesse inférieur à 20 km/h par conducteur de véhicule à moteur -
Date/Heure : Le 08/04/2026 à 14h23
Lieu : Avenue de la République, Face au n°42 - METZ (57000)
2. DONNÉES TECHNIQUES & MESURES
Vitesse retenue : 59 km/h
Appareil : RADAR TYPE MESTA 210C - N° 1248
3. IDENTIFICATION DU VÉHICULE & TITULAIRE
Immatriculation : AA-123-BB (F)
Titulaire : MARTIN Jean
Adresse : 15 Rue des Lilas, Apt 4B
75011 PARIS
5. MONTANTS DES AMENDES FORFAITAIRES
• Amende Minorée (15 jours max) : 90,00 €`;

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

  it("extrait la date de vérification du cinémomètre (preuve d'entretien annuel)", () => {
    const d = normaliserPv(`${PV_OFFICIEL}\nDate de vérification : 12/05/2022`);
    expect(d.dateVerificationAppareil).toBe("2022-05-12");
  });

  it("gère « Vérification périodique du … » (sans deux-points)", () => {
    expect(
      normaliserPv("Vérification périodique du 12/05/2022\nAppareil n° 1248")
        .dateVerificationAppareil,
    ).toBe("2022-05-12");
  });

  it("n'extrait aucune date de vérification sans libellé explicite", () => {
    // La date d'infraction et la date de l'avis ne doivent jamais être
    // confondues avec la vérification de l'appareil (anti-hallucination).
    expect(normaliserPv(PV_OFFICIEL).dateVerificationAppareil).toBeUndefined();
  });

  it("ignore une « date de vérification » sans date lisible", () => {
    expect(
      normaliserPv("Date de vérification : sans objet").dateVerificationAppareil,
    ).toBeUndefined();
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

/**
 * Simule la Gemini Files API d'un bout à l'autre pour un PDF scanné :
 * start (session resumable + x-goog-upload-url), push (octets → file.uri)
 * puis generateContent (réponse JSON `reponse`).
 */
function simulerGeminiFiles(reponse: unknown) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/upload/v1beta/files")) {
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "x-goog-upload-url" ? "https://upload.test/session" : null) },
        text: async () => "",
        json: async () => ({}),
      };
    }
    if (u.startsWith("https://upload.test/")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => "",
        json: async () => ({ file: { uri: "https://files.test/pv-1" } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(reponse),
      json: async () => reponse,
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
    delete process.env.GEMINI_API_KEY;
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

  it(
    "PDF texte + gemini-flash : lu en local, zéro appel Gemini (régression 503 prod)",
    async () => {
      process.env.OCR_PROVIDER = "gemini-flash";
      process.env.GEMINI_API_KEY = "cle-test";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await extrairePv(PV_PDF);

      expect(res?.texte).toContain("123456789");
      // Avant P1, ce PDF partait en Files API → 503 « high demand » en prod.
      expect(fetchMock).not.toHaveBeenCalled();
    },
    30_000,
  );

  it(
    "PDF scanné + gemini-flash : bien téléversé via la Files API",
    async () => {
      process.env.OCR_PROVIDER = "gemini-flash";
      process.env.GEMINI_API_KEY = "cle-test";
      const fetchMock = simulerGeminiFiles(REPONSE_OK);

      const res = await extrairePv(SCAN_PDF);

      expect(res?.extrait?.plaque).toBe("AB-123-CD");
      // start (session) + push (octets) + generateContent = la Files API.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
    30_000,
  );

  it("renvoie null sur un PDF corrompu sans lever d'exception", async () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_VISION_KEY = "cle-test";
    await expect(extrairePv(PDF_CORROMPU)).resolves.toBeNull();
  });

  it(
    "PDF corrompu + gemini-flash : repli Files API au lieu d'abandonner (perte du canvas en prod)",
    async () => {
      // Reproduit l'incident du 2026-10-05 en prod : pdf-parse refusait de se
      // charger (DOMMatrix undefined) et l'OCR retournait null sans rien
      // tenter. Le repli renvoie le PDF à Gemini comme avant P1.
      process.env.OCR_PROVIDER = "gemini-flash";
      process.env.GEMINI_API_KEY = "cle-test";
      const fetchMock = simulerGeminiFiles(REPONSE_OK);

      const res = await extrairePv(PDF_CORROMPU);

      expect(res?.extrait?.plaque).toBe("AB-123-CD");
      // start (session) + push (octets) + generateContent = la Files API.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
    30_000,
  );

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

describe("normaliserPv — PV officiel à couche texte (prod 2026-10-06)", () => {
  it("extrait le nom près de « Titulaire : »", () => {
    expect(normaliserPv(PV_OFFICIEL).nom).toBe("MARTIN Jean");
  });

  it("n° d'avis sous la forme officielle « Numéro de l'avis » → 14 chiffres", () => {
    expect(normaliserPv(PV_OFFICIEL).num_pv).toBe("37592048152634");
  });

  it("trouve la plaque en section 3 malgré « véhicule » en section 1", () => {
    expect(normaliserPv(PV_OFFICIEL).plaque).toBe("AA-123-BB");
  });

  it("extrait typeRadar et radarId près de « Appareil : »", () => {
    const d = normaliserPv(PV_OFFICIEL);
    expect(d.typeRadar).toBe("RADAR TYPE MESTA 210C");
    expect(d.radarId).toBe("1248");
  });

  it("adresse propre sur deux lignes (sans rubriques voisines)", () => {
    expect(normaliserPv(PV_OFFICIEL).adresse).toBe(
      "15 Rue des Lilas, Apt 4B 75011 PARIS",
    );
  });

  it("nom : aucun libellé → jamais de nom inventé", () => {
    expect(normaliserPv(PV_TEXTE).nom).toBeUndefined();
    expect(normaliserPv("aucune donnée exploitable !").nom).toBeUndefined();
  });
});

describe("fusionnerPrefill (struct Gemini ∪ regex locales)", () => {
  it("sans extrait (PDF à couche texte) → tout vient des regex", () => {
    const f = fusionnerPrefill(undefined, PV_OFFICIEL);
    expect(f.nom).toBe("MARTIN Jean");
    expect(f.plaque).toBe("AA-123-BB");
    expect(f.num_pv).toBe("37592048152634");
  });

  it("le struct garde la priorité et les regex comblent les manquants", () => {
    const f = fusionnerPrefill({ nom: "DUPONT Marie" }, PV_OFFICIEL);
    expect(f.nom).toBe("DUPONT Marie"); // jamais écrasé
    expect(f.num_pv).toBe("37592048152634"); // comblé par regex
    expect(f.plaque).toBe("AA-123-BB"); // comblé par regex
  });

  it("remplace une plaque struct au format invalide par la plaque regex", () => {
    const f = fusionnerPrefill({ plaque: "545526" }, PV_OFFICIEL);
    expect(f.plaque).toBe("AA-123-BB");
  });

  it("conserve une plaque struct valide", () => {
    const f = fusionnerPrefill({ plaque: "BB-999-AA" }, PV_OFFICIEL);
    expect(f.plaque).toBe("BB-999-AA");
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
