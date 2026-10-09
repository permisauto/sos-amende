import { describe, it, expect } from "vitest";
import {
  archivesATraiter,
  estCandidatExtraction,
  listerArchives,
  normaliserTitreProposition,
} from "@/lib/veille-ingestion";

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
