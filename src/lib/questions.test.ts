import { describe, expect, it } from "vitest";
import {
  FAILLES_PAR_REPONSE,
  GROUPE_DYNAMIQUE,
  LIBELLES_REPONSES,
  QUESTIONS_CIBLEES,
  faillesDepuisReponses,
  fusionnerQuestionsDynamiques,
  libellesPourDynamiques,
  lireReponses,
  naturesPv,
  normaliserQuestionsDynamiques,
  preuvesPourReponses,
  questionsPour,
  reglesDetectionPourQuestions,
  suggestionsPreuvesClient,
  typePreuvePourIntitule,
  versQuestionsCiblees,
  type QuestionDynamique,
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

  it("AMENDE stationnement : le groupe Stationnement apparaît (5 questions)", () => {
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
      // Lot R3 : marquage effacé (pièce PHOTO_MARQUAGE).
      "marquageEfface",
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

  it("lot R3 : cliché ambigu sur PV radar ; jamais sur suspension ou hors radar", () => {
    const radar = questionsPour({
      type: "AMENDE",
      texte: "Radar laser 96 km/h — infraction photographiée",
    });
    const cliche = radar.find((g) => g.groupe === "Contrôle radar (cliché)");
    expect(cliche?.questions.map((q) => q.cle)).toEqual(["clicheDeuxVehicules"]);
    expect(cliche?.questions[0]?.preuveClient).toBe("CLICHE_ANTAI");

    // Jamais hors AMENDE/radar (cloisonnement par nature et par type).
    const susp = questionsPour({
      type: "SUSPENSION",
      texte: "Radar 96 km/h",
    });
    expect(susp.map((g) => g.groupe)).not.toContain("Contrôle radar (cliché)");
    const stationnement = questionsPour({
      type: "AMENDE",
      texte: textes.stationnement,
    });
    expect(stationnement.map((g) => g.groupe)).not.toContain(
      "Contrôle radar (cliché)",
    );
  });

  it("SUSPENSION : notification + recours toujours, alcool seulement si motif", () => {
    const sansAlcool = questionsPour({
      type: "SUSPENSION",
      texte: "DÉCISION DE SUSPENSION — préfecture — durée 6 mois",
    });
    expect(sansAlcool.map((g) => g.groupe)).toEqual([
      "Notification de la décision",
      "Recours engagés",
      // Lot R1 : le radio d'urgence s'affiche pour toute suspension (pas de
      // filtre docType) ; le SIRET, filtré 3F/48SI, est absent ici.
      "Votre urgence",
      // Lot 5 : l'enclavement du domicile est affiché pour toute suspension
      // (aucun filtre docType) — pertinence indépendante du motif.
      "Accès au domicile",
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

describe("questionsPour — sous-type 3F vs 48SI (filtre docTypes)", () => {
  const texteSusp = "ARRÊTÉ PRÉFECTORAL — suspension du permis de conduire";

  it("3F : groupe Arrêté préfectoral visible, Calcul du solde absent", () => {
    const groupes = questionsPour({
      type: "SUSPENSION",
      texte: texteSusp,
      docType: "3F",
    });
    const noms = groupes.map((g) => g.groupe);
    expect(noms).toContain("Arrêté préfectoral (3F)");
    expect(noms).not.toContain("Calcul du solde de points (48 SI)");
    expect(
      groupes.find((g) => g.groupe === "Arrêté préfectoral (3F)")?.questions,
    ).toHaveLength(1);
  });

  it("48SI : groupe Calcul du solde visible (4 questions), Arrêté préfectoral absent", () => {
    const groupes = questionsPour({
      type: "SUSPENSION",
      texte: texteSusp,
      docType: "48SI",
    });
    const noms = groupes.map((g) => g.groupe);
    expect(noms).toContain("Calcul du solde de points (48 SI)");
    expect(noms).not.toContain("Arrêté préfectoral (3F)");
    expect(
      groupes.find((g) => g.groupe === "Calcul du solde de points (48 SI)")
        ?.questions,
    ).toHaveLength(4);
  });

  it("docType inconnu ou absent : aucune question spécifique, groupes partagés intacts", () => {
    for (const docType of [undefined, null, "BIDON", "AMENDE"]) {
      const groupes = questionsPour({
        type: "SUSPENSION",
        texte: texteSusp,
        docType: docType as string | null | undefined,
      });
      const noms = groupes.map((g) => g.groupe);
      expect(noms).not.toContain("Arrêté préfectoral (3F)");
      expect(noms).not.toContain("Calcul du solde de points (48 SI)");
      expect(noms).toContain("Notification de la décision");
      expect(noms).toContain("Recours engagés");
    }
  });

  it("AMENDE : les groupes spécifiques suspension n'apparaissent jamais", () => {
    const groupes = questionsPour({
      type: "AMENDE",
      texte: "Radar fixe 96 km/h",
      docType: "48SI",
    });
    const noms = groupes.map((g) => g.groupe);
    expect(noms).not.toContain("Arrêté préfectoral (3F)");
    expect(noms).not.toContain("Calcul du solde de points (48 SI)");
  });
});

describe("questionsPour — urgence structurée (lot R1)", () => {
  const texteSusp = "ARRÊTÉ PRÉFECTORAL — suspension du permis de conduire";

  it("3F et 48SI : groupe « Votre urgence » — radio + SIRET", () => {
    for (const docType of ["3F", "48SI"] as const) {
      const groupes = questionsPour({
        type: "SUSPENSION",
        texte: texteSusp,
        docType,
      });
      const urgence = groupes.find((g) => g.groupe === "Votre urgence");
      expect(urgence?.questions.map((q) => q.cle)).toEqual([
        "urgenceSituation",
        "siret",
      ]);
      expect(urgence?.questions[0]?.typeChamp).toBe("radio");
      expect(urgence?.questions[0]?.options?.map((o) => o.valeur)).toEqual([
        "salarie",
        "artisan",
        "enclavement",
        "medical",
      ]);
      expect(urgence?.questions[1]?.typeChamp).toBe("texte");
    }
  });

  it("docType inconnu (droit commun R0) : radio seule, sans SIRET", () => {
    for (const docType of [undefined, "BIDON"]) {
      const groupes = questionsPour({
        type: "SUSPENSION",
        texte: texteSusp,
        docType: docType as string | undefined,
      });
      const urgence = groupes.find((g) => g.groupe === "Votre urgence");
      expect(urgence?.questions.map((q) => q.cle)).toEqual([
        "urgenceSituation",
      ]);
    }
  });

  it("AMENDE : le groupe n'apparaît jamais", () => {
    const amende = questionsPour({
      type: "AMENDE",
      texte: "Radar 96 km/h",
      docType: "3F",
    });
    expect(amende.map((g) => g.groupe)).not.toContain("Votre urgence");
  });
});

describe("questionsPour — enclavement du domicile (lot 5)", () => {
  const texteSusp = "ARRÊTÉ PRÉFECTORAL — suspension du permis de conduire";

  it("SUSPENSION : groupe visible pour tout docType (1 question)", () => {
    for (const docType of [undefined, "3F", "48SI", "BIDON"]) {
      const groupes = questionsPour({
        type: "SUSPENSION",
        texte: texteSusp,
        docType: docType as string | undefined,
      });
      const acces = groupes.find((g) => g.groupe === "Accès au domicile");
      expect(acces?.questions.map((q) => q.cle)).toEqual(["domicileEnclave"]);
      expect(acces?.questions[0]?.typeChamp).toBeUndefined(); // case à cocher
    }
  });

  it("AMENDE : le groupe n'apparaît jamais", () => {
    for (const texte of ["Radar 96 km/h", "stationnement en zone bleue", ""]) {
      const groupes = questionsPour({ type: "AMENDE", texte });
      expect(groupes.map((g) => g.groupe)).not.toContain("Accès au domicile");
    }
  });

  it("lireReponses écrit la case cochée ; non cochée → rien", () => {
    const fd = new FormData();
    fd.set("domicileEnclave", "on");
    expect(lireReponses(fd).domicileEnclave).toBe(true);
    expect(lireReponses(new FormData())).toEqual({});
  });

  it("LIBELLES_REPONSES contient la clé (affichage juriste)", () => {
    expect(LIBELLES_REPONSES.map((q) => q.cle)).toContain("domicileEnclave");
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

  it("champ texte (SIRET) : valeur trimée écrite, vide → rien", () => {
    const fd = new FormData();
    fd.set("siret", "  123 456 789 00012  ");
    const reponses = lireReponses(fd);
    expect(reponses.siret).toBe("123 456 789 00012");

    const vide = new FormData();
    vide.set("siret", "   ");
    expect(lireReponses(vide)).toEqual({});
  });

  it("radio urgenceSituation : option valide → urgencePro posé (pack référé)", () => {
    const fd = new FormData();
    fd.set("urgenceSituation", "salarie");
    const reponses = lireReponses(fd);
    expect(reponses.urgenceSituation).toBe("salarie");
    expect(reponses.urgencePro).toBe(true); // déclencheur pack inchangé
    expect(reponses.domicileEnclave).toBeUndefined();
  });

  it("radio urgenceSituation = enclavement → domicileEnclave couplé (lot 5)", () => {
    const fd = new FormData();
    fd.set("urgenceSituation", "enclavement");
    const reponses = lireReponses(fd);
    expect(reponses.urgenceSituation).toBe("enclavement");
    expect(reponses.urgencePro).toBe(true);
    expect(reponses.domicileEnclave).toBe(true);
  });

  it("radio hors options → rien écrit (anti-fraude formulaire)", () => {
    const fd = new FormData();
    fd.set("urgenceSituation", "hors-registre");
    expect(lireReponses(fd)).toEqual({});
  });

  it("LIBELLES_REPONSES : libellé court + options pour l'affichage juriste", () => {
    const item = LIBELLES_REPONSES.find((q) => q.cle === "urgenceSituation");
    expect(item?.lib).toBe("Situation d'urgence");
    expect(item?.options?.find((o) => o.valeur === "medical")?.libelle).toContain(
      "proche malade",
    );
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

describe("suggestionsPreuvesClient — pièces attendues du client", () => {
  it("une réponse cochée appelle la pièce qui la corrobore", () => {
    expect(suggestionsPreuvesClient({ paiementDejaFait: true })).toEqual([
      { type: "RELEVE_PAIEMENT", raison: "J'ai déjà payé cette amende" },
    ]);
    expect(suggestionsPreuvesClient({ vehiculeCede: true })[0]?.type).toBe(
      "ATTESTATION_CESSION",
    );
    expect(suggestionsPreuvesClient({ vehiculeVole: true })[0]?.type).toBe(
      "ATTESTATION_VOL",
    );
  });

  it("rien de coché → aucune suggestion", () => {
    expect(suggestionsPreuvesClient({})).toEqual([]);
    expect(suggestionsPreuvesClient(null)).toEqual([]);
    expect(suggestionsPreuvesClient(undefined)).toEqual([]);
    expect(suggestionsPreuvesClient({ conditions_meteo: "Pluie" })).toEqual([]);
    // Une preuve externe (N2) ne fabrique pas de pièce à téléverser.
    expect(suggestionsPreuvesClient({ stationnementGene: true })).toEqual([]);
  });

  it("lot R2 : chaque situation d'urgence appelle ses propres pièces", () => {
    expect(
      suggestionsPreuvesClient({ urgenceSituation: "salarie" }).map(
        (s) => s.type,
      ),
    ).toEqual(["CONTRAT_TRAVAIL", "ATTESTATION_EMPLOYEUR"]);
    expect(
      suggestionsPreuvesClient({ urgenceSituation: "enclavement" }).map(
        (s) => s.type,
      ),
    ).toEqual(["JUSTIFICATIF_DOMICILE", "HORAIRES_TRANSPORTS"]);
    expect(
      suggestionsPreuvesClient({ urgenceSituation: "medical" }).map(
        (s) => s.type,
      ),
    ).toEqual(["CERTIFICAT_MEDICAL_PROCHE", "ATTESTATION_HONNEUR"]);
    // Artisan : le Kbis vient de la question SIRET, le bilan de l'option radio
    // — pas de doublon, raison = libellé de l'option choisie.
    expect(
      suggestionsPreuvesClient({
        urgenceSituation: "artisan",
        siret: "35600000066432",
      }),
    ).toEqual([
      {
        type: "BILAN_COMMANDES",
        raison:
          "Artisan / Indépendant / Dirigeant — je risque de perdre mon chiffre d'affaires",
      },
      { type: "KBIS", raison: "SIRET de mon entreprise (facultatif — s'il m'en reste un)" },
    ]);
    // Situation hors options (anti-fraude) → aucune pièce.
    expect(suggestionsPreuvesClient({ urgenceSituation: "bidon" })).toEqual([]);
  });

  it("lot R3 : cliché ambigu et marquage effacé appellent leur pièce", () => {
    expect(
      suggestionsPreuvesClient({ clicheDeuxVehicules: true }),
    ).toEqual([
      {
        type: "CLICHE_ANTAI",
        raison:
          "Sur le cliché du contrôle, deux véhicules figurent sur la même ligne de mesure",
      },
    ]);
    expect(
      suggestionsPreuvesClient({ marquageEfface: true }).map((s) => s.type),
    ).toEqual(["PHOTO_MARQUAGE"]);
    // Pièce déjà versée → plus suggérée (même mécanisme que le reste).
    expect(
      suggestionsPreuvesClient({ clicheDeuxVehicules: true }, ["CLICHE_ANTAI"]),
    ).toEqual([]);
  });

  it("une pièce déjà versée au dossier n'est plus suggérée", () => {
    expect(
      suggestionsPreuvesClient({ paiementDejaFait: true }, ["RELEVE_PAIEMENT"]),
    ).toEqual([]);
    expect(
      suggestionsPreuvesClient(
        { paiementDejaFait: true, vehiculeCede: true },
        ["ATTESTATION_CESSION"],
      ),
    ).toEqual([
      { type: "RELEVE_PAIEMENT", raison: "J'ai déjà payé cette amende" },
    ]);
  });

  it("contentieux contraventionnel → preuve de consignation (non bloquante)", () => {
    const suggestions = suggestionsPreuvesClient({
      voieProcedure: "CONTENTIEUX_CONTRAVENTION",
    });
    expect(suggestions.map((s) => s.type)).toEqual(["CONSIGNATION"]);
    expect(suggestions[0].raison).toMatch(/consignez/i);
    // Déjà versée : plus de suggestion.
    expect(
      suggestionsPreuvesClient(
        { voieProcedure: "CONTENTIEUX_CONTRAVENTION" },
        ["CONSIGNATION"],
      ),
    ).toEqual([]);
    // Amende simple : aucune consignation.
    expect(
      suggestionsPreuvesClient({ voieProcedure: "AMENDE_FORFAITAIRE" }),
    ).toEqual([]);
  });

  it("questions pack 3F/48SI → pièces corroborent le fait déclaré", () => {
    expect(
      suggestionsPreuvesClient({ suspSignataireNonPrefet: true })[0],
    ).toEqual({
      type: "COPIE_DECISION",
      raison:
        "L'arrêté n'est pas signé par le préfet mais par un autre signataire (secrétaire général, sous-préfet)",
    });
    expect(
      suggestionsPreuvesClient({ suspPrecedentsNonRecapitules: true })[0]?.type,
    ).toBe("COPIE_DECISION");
    expect(
      suggestionsPreuvesClient({ suspPointsCumulesJour: true })[0]?.type,
    ).toBe("RELEVE_POINTS");
    expect(
      suggestionsPreuvesClient({ suspStageAvantNotif: true })[0]?.type,
    ).toBe("ATTESTATION_STAGE");
    expect(suggestionsPreuvesClient({ suspSoldeInexact: true })[0]?.type).toBe(
      "RELEVE_POINTS",
    );
    // Dédup : deux réponses appelant la même pièce → une seule suggestion.
    expect(
      suggestionsPreuvesClient({
        suspPrecedentsNonRecapitules: true,
        suspSignataireNonPrefet: true,
      }),
    ).toHaveLength(1);
  });

  it("ne propose jamais un type externe (météo/radar/travaux)", () => {
    const suggestions = suggestionsPreuvesClient({
      paiementDejaFait: true,
      vehiculeCede: true,
      vehiculeVole: true,
    });
    expect(suggestions.map((s) => s.type)).toEqual([
      "RELEVE_PAIEMENT",
      "ATTESTATION_CESSION",
      "ATTESTATION_VOL",
    ]);
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

describe("questions dynamiques (veille 2.0 — fondations)", () => {
  const qBase: QuestionDynamique = {
    id: "signataire_non_prefet",
    libelle: "La décision de suspension n'a pas été signée par le préfet",
    type: "BOOLEAN",
    declencheur: true,
    preuves: [],
  };

  describe("normaliserQuestionsDynamiques", () => {
    it("normalise l'id (minuscules, tirets → _, borné 60) et borne les listes", () => {
      const out = normaliserQuestionsDynamiques([
        { ...qBase, id: "  Signataire-Non-Prefet  ", libelle: "  Question  " },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe("signataire_non_prefet");
      expect(out[0].libelle).toBe("Question");
    });

    it("rejette les formes invalides sans jamais lever", () => {
      expect(normaliserQuestionsDynamiques(null)).toEqual([]);
      expect(normaliserQuestionsDynamiques({})).toEqual([]);
      expect(normaliserQuestionsDynamiques("[]")).toEqual([]);
      expect(
        normaliserQuestionsDynamiques([{ id: "ab", libelle: "trop court" }]),
      ).toEqual([]); // id < 3 car.
      expect(
        normaliserQuestionsDynamiques([
          { id: "question_valide", libelle: "ab" },
        ]),
      ).toEqual([]); // libellé < 5 car.
    });

    it("garde la 1ʳᵉ pièce seulement et déduplique les ids", () => {
      const out = normaliserQuestionsDynamiques([
        qBase,
        { ...qBase, libelle: "Doublon" },
        {
          ...qBase,
          id: "avec_preuve",
          libelle: "Question avec preuve",
          preuves: [
            { intitule: "Relevé de points", argument: "" },
            { intitule: "Autre pièce", argument: "" },
          ],
        },
      ]);
      expect(out.map((q) => q.id)).toEqual([
        "signataire_non_prefet",
        "avec_preuve",
      ]);
      expect(out[1].preuves).toHaveLength(1);
      expect(out[1].preuves[0].intitule).toBe("Relevé de points");
    });

    it("plafonne à 6 questions par liste", () => {
      const brut = Array.from({ length: 10 }, (_, i) => ({
        ...qBase,
        id: `question_${i}`,
      }));
      expect(normaliserQuestionsDynamiques(brut)).toHaveLength(6);
    });

    it("declencheur non booléen → true (jamais TEXT_PRESENT fabriqué)", () => {
      expect(
        normaliserQuestionsDynamiques([{ ...qBase, declencheur: "OUI" }])[0]
          .declencheur,
      ).toBe(true);
      expect(
        normaliserQuestionsDynamiques([{ ...qBase, declencheur: false }])[0]
          .declencheur,
      ).toBe(false);
      expect(
        normaliserQuestionsDynamiques([
          { ...qBase, type: "TEXT", declencheur: "TEXT_PRESENT" },
        ])[0].declencheur,
      ).toBe("TEXT_PRESENT");
    });
  });

  describe("fusionnerQuestionsDynamiques", () => {
    it("fusionne et déduplique par id (première définition gagne)", () => {
      const fusion = fusionnerQuestionsDynamiques([
        [qBase],
        [{ ...qBase, libelle: "Autre libellé" }, {
          ...qBase,
          id: "nouvelle_question",
          libelle: "Nouvelle question",
        }],
        null,
        "invalide",
      ]);
      expect(fusion.map((q) => q.id)).toEqual([
        "signataire_non_prefet",
        "nouvelle_question",
      ]);
      expect(fusion[0].libelle).toBe(qBase.libelle);
    });

    it("plafonne à 12 questions fusionnées", () => {
      const listes = Array.from({ length: 5 }, (_, l) =>
        Array.from({ length: 4 }, (_, i) => ({
          ...qBase,
          id: `q_${l}_${i}`,
          libelle: `Question ${l}-${i}`,
        })),
      );
      expect(fusionnerQuestionsDynamiques(listes)).toHaveLength(12);
    });
  });

  describe("typePreuvePourIntitule", () => {
    it("mappe les intitulés connus vers la whitelist", () => {
      expect(typePreuvePourIntitule("Relevé de points")).toBe("RELEVE_POINTS");
      expect(typePreuvePourIntitule("Attestation de l'employeur")).toBe(
        "CONTRAT_TRAVAIL",
      );
      expect(typePreuvePourIntitule("Certificat médical")).toBe(
        "CERTIFICAT_MEDICAL_PROCHE",
      );
      expect(typePreuvePourIntitule("Extrait Kbis")).toBe("KBIS");
    });

    it("fallback PIECE_LIBRE — jamais de type hors whitelist", () => {
      expect(typePreuvePourIntitule("Document inconnu")).toBe("PIECE_LIBRE");
      expect(typePreuvePourIntitule("")).toBe("PIECE_LIBRE");
    });
  });

  describe("versQuestionsCiblees", () => {
    it("convertit en format registre avec groupe dédié", () => {
      const ciblees = versQuestionsCiblees([qBase]);
      expect(ciblees).toHaveLength(1);
      expect(ciblees[0].groupe).toBe(GROUPE_DYNAMIQUE);
      expect(ciblees[0].typeChamp).toBe("case");
      expect(ciblees[0].types).toEqual(["AMENDE", "SUSPENSION"]);
    });

    it("TEXT → typeChamp texte, preuve → preuveClient + notePreuve", () => {
      const avecPreuve: QuestionDynamique = {
        ...qBase,
        type: "TEXT",
        declencheur: "TEXT_PRESENT",
        preuves: [{ intitule: "Relevé de points", argument: "sur les 12 derniers mois" }],
      };
      const ciblees = versQuestionsCiblees([avecPreuve]);
      expect(ciblees[0].typeChamp).toBe("texte");
      expect(ciblees[0].preuveClient).toBe("RELEVE_POINTS");
      expect(ciblees[0].notePreuve).toContain("Relevé de points");
      expect(ciblees[0].notePreuve).toContain("sur les 12 derniers mois");
    });
  });

  describe("questionsPour avec dynamiques", () => {
    it("ajoute le groupe dynamique en dernier", () => {
      const groupes = questionsPour({
        type: "AMENDE",
        texte: "CONTRAVENTION N° 123 montant 135 €",
        dynamiques: [qBase],
      });
      const noms = groupes.map((g) => g.groupe);
      expect(noms).toContain(GROUPE_DYNAMIQUE);
      expect(noms[noms.length - 1]).toBe(GROUPE_DYNAMIQUE);
      // Le registre reste premier.
      expect(noms[0]).toBe("Contexte (questionnaire ciblé)");
    });

    it("sans dynamiques → aucun groupe vide ajouté", () => {
      const groupes = questionsPour({
        type: "AMENDE",
        texte: "CONTRAVENTION N° 123 montant 135 €",
      });
      expect(groupes.map((g) => g.groupe)).not.toContain(GROUPE_DYNAMIQUE);
    });
  });

  describe("lireReponses avec dynamiques", () => {
    it("écrit une case booléenne (on → true, absente → rien)", () => {
      const fd = new FormData();
      fd.set("signataire_non_prefet", "on");
      const out = lireReponses(fd, [qBase]) as Record<string, unknown>;
      expect(out.signataire_non_prefet).toBe(true);
      expect(lireReponses(new FormData(), [qBase])).toEqual({});
    });

    it("écrit un champ texte non vide, jamais vide", () => {
      const qTexte: QuestionDynamique = {
        ...qBase,
        id: "motif_inexact",
        type: "TEXT",
        declencheur: "TEXT_PRESENT",
      };
      const fd = new FormData();
      fd.set("motif_inexact", "  ");
      expect(lireReponses(fd, [qTexte])).toEqual({});
      fd.set("motif_inexact", "le solde est inexact");
      const out = lireReponses(fd, [qTexte]) as Record<string, unknown>;
      expect(out.motif_inexact).toBe("le solde est inexact");
    });
  });

  describe("suggestionsPreuvesClient avec dynamiques", () => {
    it("propose la pièce de la question cochée (raison = intitulé)", () => {
      const avecPreuve: QuestionDynamique = {
        ...qBase,
        preuves: [{ intitule: "Relevé de points", argument: "" }],
      };
      const suggestions = suggestionsPreuvesClient(
        { signataire_non_prefet: true },
        [],
        [avecPreuve],
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe("RELEVE_POINTS");
      expect(suggestions[0].raison).toContain("Relevé de points");
    });

    it("une pièce déjà versée n'est plus suggérée (dédup type)", () => {
      const avecPreuve: QuestionDynamique = {
        ...qBase,
        preuves: [{ intitule: "Relevé de points", argument: "" }],
      };
      expect(
        suggestionsPreuvesClient({ signataire_non_prefet: true }, ["RELEVE_POINTS"], [avecPreuve]),
      ).toEqual([]);
    });

    it("question non cochée → aucune suggestion", () => {
      const avecPreuve: QuestionDynamique = {
        ...qBase,
        preuves: [{ intitule: "Relevé de points", argument: "" }],
      };
      expect(suggestionsPreuvesClient({}, [], [avecPreuve])).toEqual([]);
    });
  });

  describe("libellesPourDynamiques", () => {
    it("retourne les libellés courts pour l'affichage juriste", () => {
      const libelles = libellesPourDynamiques([qBase]);
      expect(libelles).toHaveLength(1);
      expect(libelles[0].lib).toBe(qBase.libelle);
    });
  });

  describe("reglesDetectionPourQuestions", () => {
    it("BOOLEAN true → reponseVrai, false → reponseFausse, TEXT → reponseTexte", () => {
      const regles = reglesDetectionPourQuestions([
        qBase,
        { ...qBase, id: "question_fausse", declencheur: false },
        {
          ...qBase,
          id: "question_texte",
          type: "TEXT",
          declencheur: "TEXT_PRESENT",
        },
      ]);
      expect(regles).toEqual([
        { type: "reponseVrai", champ: "signataire_non_prefet" },
        { type: "reponseFausse", champ: "question_fausse" },
        { type: "reponseTexte", champ: "question_texte" },
      ]);
    });
  });
});

describe("faillesDepuisReponses — N3 (capteur de fait → candidature)", () => {
  const DISPO = [
    "faille-exoneration-vol-usurpation",
    "faille-stationnement-panneau",
    "faille-48si-defaut-info",
    "faille-48si-plafond-8pts",
  ];

  it("propose la faille ACTIVE correspondant à une case cochée", () => {
    expect(
      faillesDepuisReponses({ vehiculeCede: true }, DISPO),
    ).toEqual(["faille-exoneration-vol-usurpation"]);
    expect(
      faillesDepuisReponses({ suspPrecedentsNonRecapitules: true }, DISPO),
    ).toEqual(["faille-48si-defaut-info"]);
  });

  it("ne propose rien sans case cochée ou hors failles disponibles", () => {
    expect(faillesDepuisReponses({ vehiculeCede: false }, DISPO)).toEqual([]);
    expect(faillesDepuisReponses({ caractereLibre: true }, DISPO)).toEqual([]);
    expect(
      faillesDepuisReponses({ suspPointsCumulesJour: true }, [
        "faille-48si-defaut-info",
      ]),
    ).toEqual([]);
  });

  it("dédoublonne quand deux réponses pointent la même faille", () => {
    expect(
      faillesDepuisReponses(
        { stationnementPanneau: true, marquageEfface: true },
        DISPO,
      ),
    ).toEqual(["faille-stationnement-panneau"]);
  });

  it("ne référence que des failles du catalogue validé", async () => {
    const { CATALOGUE_SOURCES } = await import("./catalogue-sources");
    const ids = new Set(CATALOGUE_SOURCES.map((f) => f.id));
    for (const cible of Object.values(FAILLES_PAR_REPONSE)) {
      for (const id of cible ?? []) expect(ids.has(id)).toBe(true);
    }
  });
});
