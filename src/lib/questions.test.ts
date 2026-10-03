import { describe, expect, it } from "vitest";
import {
  LIBELLES_REPONSES,
  QUESTIONS_CIBLEES,
  lireReponses,
  naturesPv,
  preuvesPourReponses,
  questionsPour,
} from "./questions";

describe("naturesPv — nature du document détectée dans le texte scanné", () => {
  it("détecte stationnement, travaux, radar, visibilité et alcool", () => {
    const natures = naturesPv(
      "Stationnement n° 123 — place de stationnement résidentiel",
    );
    expect(natures).toContain("stationnement");

    expect(naturesPv("Travaux en cours — signalisation temporaire")).toContain(
      "travaux",
    );
    expect(naturesPv("Radar laser à 96 km/h")).toContain("radar");
    expect(naturesPv("La visibilité était réduite par le brouillard")).toContain(
      "visibilite",
    );
    expect(naturesPv("Alcoolémie 0,45 mg/L — éthylomètre")).toContain("alcool");
  });

  it("texte vide ou sans indice → aucune nature", () => {
    expect(naturesPv(null).size).toBe(0);
    expect(naturesPv(undefined).size).toBe(0);
    expect(naturesPv("").size).toBe(0);
    expect(naturesPv("CONTRAVENTION n° 123 montant 135 €").size).toBe(0);
  });

  it("agrège plusieurs sources de texte (PV + motif saisi)", () => {
    const natures = naturesPv("Décision de suspension", "alcool");
    expect(natures).toContain("alcool");
  });
});

describe("questionsPour — affichage dynamique par nature du document", () => {
  const textes = {
    stationnement:
      "AVIS DE CONTRAVENTION — stationnement en zone non autorisée, place de la Gare",
    travaux: "Travaux en cours, signalisation temporaire sur la voie",
    alcool: "DÉCISION DE SUSPENSION — motif : alcoolémie 0,60 mg/L",
    aucun: "CONTRAVENTION N° 123456789 — montant 135 €",
  };

  it("AMENDE sans nature : seul le groupe Contexte (5 questions)", () => {
    const groupes = questionsPour({ type: "AMENDE", texte: textes.aucun });
    expect(groupes.map((g) => g.groupe)).toEqual([
      "Contexte (questionnaire ciblé)",
    ]);
    expect(groupes[0].questions).toHaveLength(5);
  });

  it("AMENDE stationnement : le groupe Stationnement apparaît (4 questions)", () => {
    const groupes = questionsPour({
      type: "AMENDE",
      texte: textes.stationnement,
    });
    const noms = groupes.map((g) => g.groupe);
    expect(noms).toContain("Stationnement");
    expect(noms.indexOf("Contexte (questionnaire ciblé)")).toBeLessThan(
      noms.indexOf("Stationnement"),
    );
    const stationnement = groupes.find((g) => g.groupe === "Stationnement");
    expect(stationnement?.questions.map((q) => q.cle)).toEqual([
      "stationnementPanneau",
      "stationnementGene",
      "stationnementTicket",
      "stationnementLieu",
    ]);
  });

  it("AMENDE travaux : groupe Travaux et signalisation ; visibilité si radar/pluie", () => {
    const groupes = questionsPour({ type: "AMENDE", texte: textes.travaux });
    expect(groupes.map((g) => g.groupe)).toContain("Travaux et signalisation");

    const radar = questionsPour({
      type: "AMENDE",
      texte: "Radar fixe 96 km/h limite 70",
    });
    expect(radar.map((g) => g.groupe)).toContain("Visibilité");
  });

  it("SUSPENSION : notification + recours toujours, alcool seulement si motif", () => {
    const sansAlcool = questionsPour({
      type: "SUSPENSION",
      texte: "DÉCISION DE SUSPENSION — préfecture — durée 6 mois",
    });
    expect(sansAlcool.map((g) => g.groupe)).toEqual([
      "Notification de la décision",
      "Recours engagés",
    ]);

    const avecAlcool = questionsPour({
      type: "SUSPENSION",
      texte: textes.alcool,
    });
    expect(avecAlcool.map((g) => g.groupe)).toContain("Alcool / stupéfiants");
    expect(
      avecAlcool.find((g) => g.groupe === "Alcool / stupéfiants")?.questions,
    ).toHaveLength(2);
  });

  it("les questions d'un type ne fuitent jamais vers l'autre", () => {
    for (const texte of Object.values(textes)) {
      for (const type of ["AMENDE", "SUSPENSION"] as const) {
        const groupes = questionsPour({ type, texte });
        expect(groupes.length).toBeGreaterThan(0);
        // Jamais de groupe vide (échec du questionnaire dynamique du 2026-10-01).
        for (const g of groupes) {
          expect(g.questions.length).toBeGreaterThan(0);
          for (const q of g.questions) expect(q.types).toContain(type);
        }
      }
    }
  });
});

describe("lireReponses — lecture du FormData", () => {
  it("n'écrit que les cases cochées, avec la valeur du registre", () => {
    const fd = new FormData();
    fd.set("paiementDejaFait", "on");
    fd.set("stationnementGene", "on");
    fd.set("conditions_meteo", "on");
    fd.set("suspObservations", "on");
    fd.set("inconnue", "on");

    const reponses = lireReponses(fd);
    expect(reponses.paiementDejaFait).toBe(true);
    expect(reponses.stationnementGene).toBe(true);
    expect(reponses.conditions_meteo).toBe("Pluie");
    expect(reponses.suspObservations).toBe(true);
    expect(reponses).not.toHaveProperty("vehiculeCede");
    expect(reponses).not.toHaveProperty("inconnue");
  });

  it("case non cochée → aucune clé écrite", () => {
    expect(lireReponses(new FormData())).toEqual({});
  });
});

describe("preuvesPourReponses — preuves externes déclenchées (N2)", () => {
  it("travaux/stationnementGene → TRAVAUX ; visibilité → METEO", () => {
    expect(preuvesPourReponses({ travaux_présents: true })).toEqual(
      new Set(["TRAVAUX"]),
    );
    expect(
      preuvesPourReponses({ stationnementGene: true }),
    ).toEqual(new Set(["TRAVAUX"]));
    expect(preuvesPourReponses({ conditions_meteo: "Pluie" })).toEqual(
      new Set(["METEO"]),
    );
  });

  it("rien de coché ou valeur vide → aucune preuve", () => {
    expect(preuvesPourReponses({}).size).toBe(0);
    expect(preuvesPourReponses({ conditions_meteo: "" }).size).toBe(0);
    expect(
      preuvesPourReponses({ paiementDejaFait: true }).size,
    ).toBe(0);
  });
});

describe("garde-fous du registre", () => {
  it("clés de champ uniques et libellés sans article de loi", () => {
    const cles = QUESTIONS_CIBLEES.map((q) => q.cle);
    expect(new Set(cles).size).toBe(cles.length);
    const champs = LIBELLES_REPONSES.map((q) => q.cle);
    expect(new Set(champs).size).toBe(champs.length);

    for (const q of QUESTIONS_CIBLEES) {
      expect(q.libelle.length).toBeGreaterThan(10);
      // Aucune question ne peut afficher un fondement (anti-hallucination).
      expect(q.libelle).not.toMatch(/\bart(?:icle)?\.?\s*[LR]?\.? ?\d/i);
      expect(q.libelle).not.toMatch(/code (de la route|de procédure)/i);
      expect(q.groupe.length).toBeGreaterThan(2);
    }
  });
});
