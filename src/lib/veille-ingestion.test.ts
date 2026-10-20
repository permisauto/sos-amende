import { describe, it, expect } from "vitest";
import {
  archivesATraiter,
  estCandidatExtraction,
  estPropositionLocale,
  estPropositionPromouvable,
  estRepriseRegeneration,
  estSchemaVeille2,
  listerArchives,
  normaliserTitreProposition,
} from "@/lib/veille-ingestion";

describe("estPropositionLocale — source unique du secours local", () => {
  it("true seulement pour methode = locale", () => {
    expect(estPropositionLocale({ methode: "locale" })).toBe(true);
    expect(estPropositionLocale({ methode: "ia" })).toBe(false);
    // Proposition IA ancienne : methode absent — jamais locale (le filtre
    // « À valider » doit la conserver).
    expect(estPropositionLocale({})).toBe(false);
    expect(estPropositionLocale(null)).toBe(false);
    expect(estPropositionLocale(undefined)).toBe(false);
  });
});

describe("estPropositionPromouvable — pas de faille depuis le secours local", () => {
  // Champs requis par `PropositionVeille` (le reste est optionnel).
  const base = {
    etat: "extrait" as const,
    titre: "TA Nice, ordonnance du 15 septembre 2026",
    typeInfraction: "SUSPENSION" as const,
    articles: ["article L. 224-2 du code de la route"],
    regle: "règle rédigée par l'IA",
    conditions: ["condition d'application"],
    resume: "résumé",
    extraits: ["extrait verbatim"],
    extraitLe: "2026-10-01T00:00:00.000Z",
  };

  it("accepte une extraction IA complète (méthode absente = ia)", () => {
    expect(estPropositionPromouvable(base)).toBe(true);
    expect(estPropositionPromouvable({ ...base, methode: "ia" })).toBe(true);
  });

  it("refuse le secours local : aucune règle dégagée (incident 2026-10-18)", () => {
    expect(estPropositionPromouvable({ ...base, methode: "locale" })).toBe(false);
  });

  it("refuse une décision perdante, une extraction incomplète et l'absence", () => {
    expect(
      estPropositionPromouvable({
        ...base,
        statutAnalyse: "REJETE_AUTOMOBILISTE_PERDANT",
      }),
    ).toBe(false);
    expect(estPropositionPromouvable({ ...base, etat: "incomplet" })).toBe(false);
    expect(estPropositionPromouvable(null)).toBe(false);
  });
});

describe("listerArchives — index DILA", () => {
  it("extrait et trie les archives de la source (ordre chronologique)", () => {
    const listing = `
      <a href="JADE_20261002-214539.tar.gz">JADE_20261002-214539.tar.gz</a>
      <a href="JADE_20261001-214554.tar.gz">JADE_20261001-214554.tar.gz</a>
      <a href="CASS_20260930-215413.tar.gz">autre source</a>
    `;
    expect(listerArchives(listing, "JADE")).toEqual([
      "JADE_20261001-214554.tar.gz",
      "JADE_20261002-214539.tar.gz",
    ]);
  });
});

describe("archivesATraiter — reprise du lot", () => {
  const listing = [
    "JADE_20260930-214539.tar.gz",
    "JADE_20261001-214539.tar.gz",
    "JADE_20261002-214539.tar.gz",
    "JADE_20261003-214539.tar.gz",
    "JADE_20261004-214539.tar.gz",
  ];

  it("au premier passage (sans marqueur), ne prend que la dernière archive", () => {
    expect(archivesATraiter(listing, null)).toEqual(["JADE_20261004-214539.tar.gz"]);
  });

  it("reprend strictement après la dernière archive ingérée", () => {
    expect(archivesATraiter(listing, "JADE_20261001-214539.tar.gz")).toEqual([
      "JADE_20261002-214539.tar.gz",
      "JADE_20261003-214539.tar.gz",
      "JADE_20261004-214539.tar.gz",
    ]);
  });

  it("borne le lot à 3 archives (rattrapage progressif)", () => {
    expect(archivesATraiter(listing, "JADE_20260930-214539.tar.gz")).toHaveLength(3);
  });

  it("retourne un lot vide quand tout est déjà traité", () => {
    expect(archivesATraiter(listing, "JADE_20261004-214539.tar.gz")).toEqual([]);
  });
});

describe("estCandidatExtraction — reprise automatique (lot O)", () => {
  it("une publication sans proposition est toujours extraite", () => {
    expect(estCandidatExtraction(null)).toBe(true);
  });

  it("un échec est repris à chaque passage", () => {
    expect(estCandidatExtraction({ etat: "echec", tentatives: 9 })).toBe(true);
  });

  it("un incomplet n'est repris automatiquement qu'une seule fois", () => {
    expect(estCandidatExtraction({ etat: "incomplet" })).toBe(true);
    expect(estCandidatExtraction({ etat: "incomplet", tentatives: 0 })).toBe(true);
    expect(estCandidatExtraction({ etat: "incomplet", tentatives: 1 })).toBe(false);
  });

  it("une proposition complète n'est plus retouchée par le cron", () => {
    expect(estCandidatExtraction({ etat: "extrait", tentatives: 3 })).toBe(false);
  });
});

describe("normaliserTitreProposition — dédup des auto-propositions", () => {
  it("ignore la casse, les espaces multiples et les espaces de bord", () => {
    expect(normaliserTitreProposition("  Excès   de Vitesse ")).toBe(
      "excès de vitesse",
    );
    expect(normaliserTitreProposition("Excès de Vitesse")).toBe(
      normaliserTitreProposition("EXCÈS DE VITESSE"),
    );
  });

  it("différencie deux titres réellement distincts", () => {
    expect(normaliserTitreProposition("Prescription de l'action")).not.toBe(
      normaliserTitreProposition("Étiquetage des appareils"),
    );
  });
});

describe("estSchemaVeille2 — ciblage du retraitement des analyses héritées", () => {
  it("une analyse au format Veille 2.0 (marqueur 2) n'est pas régénérée", () => {
    expect(estSchemaVeille2({ schemaVeille: 2 })).toBe(true);
  });

  it("une analyse héritée sans marqueur est ciblée", () => {
    expect(estSchemaVeille2({})).toBe(false);
  });

  it("une proposition absente n'est pas une analyse hérite à régénérer", () => {
    expect(estSchemaVeille2(null)).toBe(false);
  });

  it("un marqueur d'une autre version n'est pas confondu avec le v2", () => {
    expect(estSchemaVeille2({ schemaVeille: 1 })).toBe(false);
  });
});

describe("estRepriseRegeneration — analyses v2 non abouties", () => {
  it("reprend l'incomplet v2 jamais retenté (cas du pilote : 7/9)", () => {
    expect(estRepriseRegeneration({ etat: "incomplet" })).toBe(true);
    expect(
      estRepriseRegeneration({ etat: "incomplet", tentatives: 4 }),
    ).toBe(true);
  });

  it("n'accorde qu'une seule reprise (anti ping-pong)", () => {
    expect(estRepriseRegeneration({ etat: "incomplet", regenTentatives: 0 })).toBe(true);
    expect(estRepriseRegeneration({ etat: "incomplet", regenTentatives: 1 })).toBe(false);
    expect(estRepriseRegeneration({ etat: "incomplet", regenTentatives: 4 })).toBe(false);
  });

  it("reprend un échec à chaque passage, comme estCandidatExtraction", () => {
    expect(estRepriseRegeneration({ etat: "echec" })).toBe(true);
    expect(estRepriseRegeneration({ etat: "echec", regenTentatives: 5 })).toBe(true);
  });

  it("ne reprend JAMAIS une analyse v2 aboutie", () => {
    expect(estRepriseRegeneration({ etat: "extrait" })).toBe(false);
    expect(estRepriseRegeneration({ etat: "extrait", regenTentatives: 0 })).toBe(false);
  });

  it("la correction manuelle prime sur toute reprise", () => {
    expect(
      estRepriseRegeneration({
        etat: "incomplet",
        corrigeLe: "2026-10-17T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      estRepriseRegeneration({
        etat: "echec",
        corrigeLe: "2026-10-17T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("une proposition absente n'est pas une reprise", () => {
    expect(estRepriseRegeneration(null)).toBe(false);
  });
});
