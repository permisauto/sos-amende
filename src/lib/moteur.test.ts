import { describe, expect, it } from "vitest";
import {
  FAILLE_IDS,
  dateLimitePv,
  datePrescrite,
  detecterFaille,
  detecterFailles,
  etalonnageExpire,
  joursRestants,
  remplirTemplate,
  scoreFaille,
  type ExtractedData,
  type RegleDetection,
} from "./moteur";

const failles = Object.values(FAILLE_IDS).map((id) => ({ id }));

describe("datePrescrite", () => {
  it("prescrit une amende datée de plus d'un an", () => {
    expect(datePrescrite("2023-01-15")).toBe(true);
  });

  it("ne prescrit pas un PV récent", () => {
    expect(datePrescrite("2026-07-01")).toBe(false);
  });

  it("refuse une date absente ou invalide", () => {
    expect(datePrescrite(undefined)).toBe(false);
    expect(datePrescrite("pas-une-date")).toBe(false);
  });
});

describe("dateLimitePv", () => {
  it("applique 45 jours pour une amende", () => {
    const limite = dateLimitePv("2026-08-01", "AMENDE");
    expect(limite?.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("applique 2 mois pour une suspension", () => {
    const limite = dateLimitePv("2026-08-01", "SUSPENSION");
    expect(limite?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("retourne null sans date", () => {
    expect(dateLimitePv(undefined, "AMENDE")).toBeNull();
  });
});

describe("joursRestants", () => {
  it("donne 0 restant à la date limite", () => {
    const limite = new Date();
    expect(joursRestants(limite)).toBe(0);
  });

  it("gère l'absence de date", () => {
    expect(joursRestants(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("detecterFaille", () => {
  it("priorise la prescription", () => {
    const faille = detecterFaille({ date: "2024-01-01" }, failles);
    expect(faille?.id).toBe(FAILLE_IDS.prescription);
  });

  it("détecte une erreur de plaque", () => {
    const faille = detecterFaille(
      { plaqueIncorrecte: true, numTelePaiement: "X", cle: "1" },
      failles,
    );
    expect(faille?.id).toBe(FAILLE_IDS.erreurPlaque);
  });

  it("détecte les mentions obligatoires manquantes", () => {
    expect(
      detecterFaille({ numTelePaiement: "" }, failles)?.id,
    ).toBe(FAILLE_IDS.mentions);
    expect(detecterFaille({ numTelePaiement: "X" }, failles)?.id).toBe(
      FAILLE_IDS.mentions,
    );
  });

  it("n'utilise plus le certificat d'étalonnage sans indice (exigence d'une preuve)", () => {
    expect(
      detecterFaille({ numTelePaiement: "X", cle: "1" }, failles),
    ).toBeNull();
  });

  it("détecte l'étalonnage quand le certificat du radar était expiré", () => {
    const faille = detecterFaille(
      { date: "2026-06-15", numTelePaiement: "X", cle: "1" },
      failles,
      { dateExpirationEtalonnage: "2026-01-01T00:00:00Z" },
    );
    expect(faille?.id).toBe(FAILLE_IDS.etalonnage);
  });

  it("ignore les failles absentes de la base", () => {
    expect(detecterFaille({ numTelePaiement: "X", cle: "1" }, [])).toBeNull();
  });
});

describe("detecterFailles (base juridique auto-alimentée)", () => {
  type FailleTest = { id: string; reglesDetection: RegleDetection[] };

  it("retourne toutes les failles candidates par règles, dans l'ordre de priorité", () => {
    const base: FailleTest[] = [
      {
        id: FAILLE_IDS.mentions,
        reglesDetection: [{ type: "champAbsent", champ: "cle" }],
      },
      {
        id: "faille-texte",
        reglesDetection: [{ type: "texteContient", motif: "radar" }],
      },
    ];
    expect(
      detecterFailles({ numTelePaiement: "X" }, "radar automatique MESTA", base),
    ).toEqual([FAILLE_IDS.mentions, "faille-texte"]);
  });

  it("une faille est candidate si l'une au moins de ses règles matche (OU)", () => {
    const base: FailleTest[] = [
      {
        id: "faille-ou",
        reglesDetection: [
          { type: "champAbsent", champ: "a" },
          { type: "champAbsent", champ: "b" },
        ],
      },
    ];
    expect(
      detecterFailles({ a: "présent" } as ExtractedData, null, base),
    ).toEqual(["faille-ou"]);
  });

  it("texteAbsent : la faille matche quand le motif est absent du texte scanné", () => {
    const base: FailleTest[] = [
      {
        id: "faille-absente",
        reglesDetection: [{ type: "texteAbsent", motif: "minorée" }],
      },
    ];
    expect(detecterFailles({}, "avis de contravention", base)).toEqual([
      "faille-absente",
    ]);
  });

  it("texteContient : la faille matche quand le motif est présent dans le texte", () => {
    const base: FailleTest[] = [
      {
        id: "faille-vitesse",
        reglesDetection: [{ type: "texteContient", motif: "exces de vitesse" }],
      },
    ];
    expect(
      detecterFailles({}, "PV pour exces de vitesse constaté", base),
    ).toEqual(["faille-vitesse"]);
  });

  it("les règles explicites priment sur les prédicats hérités", () => {
    const base: FailleTest[] = [
      {
        id: FAILLE_IDS.prescription,
        reglesDetection: [{ type: "texteContient", motif: "prescrit" }],
      },
    ];
    // date ancienne mais texte sans le mot : la règle explicite ne matche pas
    expect(
      detecterFailles({ date: "2024-01-01" }, "avis de contravention", base),
    ).toEqual([]);
  });
});

describe("etalonnageExpire", () => {
  it("détecte un certificat expiré le jour de l'infraction", () => {
    expect(
      etalonnageExpire("2026-01-01T00:00:00Z", "2026-06-15"),
    ).toBe(true);
  });

  it("valide un certificat encore en cours", () => {
    expect(
      etalonnageExpire("2026-12-31T00:00:00Z", "2026-06-15"),
    ).toBe(false);
  });

  it("refuse des entrées absentes ou invalides", () => {
    expect(etalonnageExpire(null, "2026-06-15")).toBe(false);
    expect(etalonnageExpire("2026-01-01", undefined)).toBe(false);
    expect(etalonnageExpire("pas-une-date", "2026-06-15")).toBe(false);
  });
});

describe("remplirTemplate", () => {
  it("remplace toutes les variables connues", () => {
    const template =
      "Je soussigné {nom}, véhicule {plaque}, conteste le PV {num_pv}.";
    const lettre = remplirTemplate(template, {
      nom: "DUPONT",
      plaque: "AB-123-CD",
      num_pv: "123456",
    });
    expect(lettre).toBe(
      "Je soussigné DUPONT, véhicule AB-123-CD, conteste le PV 123456.",
    );
  });

  it("laisse les variables inconnues intactes", () => {
    expect(remplirTemplate("PV {num_pv} motif {inconnu}", {})).toBe(
      "PV {num_pv} motif {inconnu}",
    );
  });
});

describe("scoreFaille", () => {
  it("retourne null si aucune règle ne matche (faille non candidate)", () => {
    expect(
      scoreFaille(
        {
          id: "faille-x",
          reglesDetection: [
            { type: "texteContient", motif: "introuvable" },
          ],
        },
        {},
        "texte sans motif",
      ),
    ).toBeNull();
  });

  it("score 100% si la seule règle matche", () => {
    expect(
      scoreFaille(
        { id: "faille-x", reglesDetection: [{ type: "champAbsent", champ: "cle" }] },
        {},
        null,
      ),
    ).toEqual({ matchees: 1, total: 1, score: 100 });
  });

  it("score proportionnel au nombre de règles matchées", () => {
    expect(
      scoreFaille(
        {
          id: "faille-x",
          reglesDetection: [
            { type: "texteContient", motif: "vitesse" },
            { type: "texteContient", motif: "introuvable" },
          ],
        },
        {},
        "excès de vitesse constaté",
      ),
    ).toEqual({ matchees: 1, total: 2, score: 50 });
  });

  it("évalue le prédicat hérité pour une faille connue sans règles", () => {
    expect(
      scoreFaille(
        { id: FAILLE_IDS.prescription },
        { date: "2020-01-01" },
        null,
      ),
    ).toEqual({ matchees: 1, total: 1, score: 100 });
  });
});