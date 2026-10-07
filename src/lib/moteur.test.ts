import { describe, expect, it } from "vitest";
import {
  FAILLE_IDS,
  dateLimitePv,
  datePrescrite,
  detecterFaille,
  detecterFailles,
  echeanceVerificationRadar,
  etalonnageExpire,
  joursRestants,
  meteoDefavorable,
  remplirLettreMulti,
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

describe("echeanceVerificationRadar", () => {
  const jour = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

  it("+1 an par défaut (vérification annuelle obligatoire)", () => {
    expect(jour(echeanceVerificationRadar("2023-05-12"))).toBe("2024-05-12");
  });

  it("exception poste fixe : +2 ans quand la vérification suit la mise en service (≤ 26 mois)", () => {
    expect(
      jour(echeanceVerificationRadar("2023-05-12", "2022-06-01T00:00:00Z")),
    ).toBe("2025-05-12");
  });

  it("+1 an passé les 26 mois (vérifications suivantes redevenues annuelles)", () => {
    expect(
      jour(echeanceVerificationRadar("2025-05-12", "2022-06-01T00:00:00Z")),
    ).toBe("2026-05-12");
  });

  it("accepte le format français dd/mm/yyyy l'OCR peut produire", () => {
    expect(jour(echeanceVerificationRadar("12/05/2023"))).toBe("2024-05-12");
  });

  it("refuse les dates absentes ou illisibles (jamais de date fabriquée)", () => {
    expect(echeanceVerificationRadar(null)).toBeNull();
    expect(echeanceVerificationRadar(undefined)).toBeNull();
    expect(echeanceVerificationRadar("pas-une-date")).toBeNull();
    expect(echeanceVerificationRadar("2023-13-45")).toBeNull();
  });
});

describe("meteoDefavorable", () => {
  it("retient les conditions connues pour nuire à la visibilité", () => {
    expect(meteoDefavorable("Pluie forte • 8/12°C")).toBe(true);
    expect(meteoDefavorable("Bruine modérée")).toBe(true);
    expect(meteoDefavorable("Brouillard • 3/6°C")).toBe(true);
    expect(meteoDefavorable("Neige modérée")).toBe(true);
    expect(meteoDefavorable("Verglas")).toBe(true);
    expect(meteoDefavorable("Averses de pluie modérées")).toBe(true);
    expect(meteoDefavorable("Orages avec grêle légère")).toBe(true);
    expect(meteoDefavorable("Tempête")).toBe(true);
  });

  it("retient des rafales fortes même sans mot-clé de condition", () => {
    expect(meteoDefavorable("Ciel dégagé • 9/15°C • Rafales: 80 km/h")).toBe(
      true,
    );
    expect(meteoDefavorable("Rafales: 70 km/h")).toBe(true);
  });

  it("écarte une journée clémente ou de simples rafales faibles", () => {
    expect(meteoDefavorable("Ciel dégagé • 9/15°C")).toBe(false);
    expect(meteoDefavorable("Partiellement nuageux • 12/18°C • Rafales: 25 km/h")).toBe(
      false,
    );
    expect(meteoDefavorable("Principalement clair")).toBe(false);
  });

  it("refuse une valeur absente", () => {
    expect(meteoDefavorable(null)).toBe(false);
    expect(meteoDefavorable(undefined)).toBe(false);
    expect(meteoDefavorable("")).toBe(false);
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

  it("écrit les dates en toutes lettres (qualité rédaction française)", () => {
    const lettre = remplirTemplate(
      "J'ai reçu le PV {num_pv} en date du {date}.",
      { num_pv: "123", date: "2026-05-01" },
    );
    expect(lettre).toContain("en date du 1er mai 2026");
    expect(lettre).not.toContain("2026-05-01");
  });

  it("retire les variables inconnues et leurs artefacts (jamais {x} brut)", () => {
    expect(remplirTemplate("PV {num_pv} motif {inconnu}", {})).toBe(
      "PV motif",
    );
    expect(remplirTemplate("cinémomètre n° {radarId}", {})).toBe(
      "cinémomètre",
    );
  });

  it("nettoie les espaces et la ponctuation résiduels", () => {
    expect(remplirTemplate("Texte  avec   des   espaces .", {})).toBe(
      "Texte avec des espaces.",
    );
  });

  it("préserve la typographie française (espace avant « : » « ; » « ! » « ? »)", () => {
    const lettre = remplirTemplate(
      "infraction : celui-ci ne m'a pas été notifié ; l'amende est, dès lors, inopposable !",
      {},
    );
    expect(lettre).toContain("infraction : celui-ci");
    expect(lettre).toContain("notifié ; l'amende");
    expect(lettre).toContain("inopposable !");
  });
});

describe("remplirLettreMulti", () => {
  const data: ExtractedData = {
    nom: "DUPONT",
    plaque: "AB-123-CD",
    num_pv: "123",
  };
  const prescription = {
    id: FAILLE_IDS.prescription,
    titreFaille: "Prescription de l'action publique",
    articleLoi: "Art. 9 CPP",
    templateLettre:
      "Je soussigné {nom}, conteste le PV {num_pv}.\n\nLa prescription est acquise après un an.\n\nJe demande l'annulation.",
  };
  const erreurPlaque = {
    id: FAILLE_IDS.erreurPlaque,
    titreFaille: "Erreur de plaque",
    articleLoi: "Art. 530-1 CPP",
    templateLettre:
      "Je soussigné {nom}, véhicule {plaque}.\n\nLa plaque ne correspond pas à mon véhicule.",
  };

  it("retourne le template unique tel quel quand une seule faille", () => {
    expect(remplirLettreMulti([prescription], data)).toBe(
      remplirTemplate(prescription.templateLettre, data),
    );
  });

  it("fond toutes les failles en une lettre fluide, sans étiquette ni répétition de l'identification", () => {
    const lettreOk = remplirLettreMulti([prescription, erreurPlaque], data)!;
    expect(lettreOk).not.toContain("Argument n°");
    // pas de sous-titre « — titre (article) »
    expect(lettreOk).not.toContain("Prescription de l'action publique");
    expect(lettreOk).not.toContain("Erreur de plaque");
    // identification portée une seule fois (première faille)
    expect(lettreOk).toContain("Je soussigné DUPONT, conteste le PV 123.");
    // la 2e faille ne répète pas l'identification (« véhicule AB-123-CD »)
    expect(lettreOk).not.toContain("véhicule AB-123-CD");
    // ses arguments s'enchaînent naturellement
    expect(lettreOk).toContain("La prescription est acquise après un an.");
    expect(lettreOk).toContain("Je demande l'annulation.");
    expect(lettreOk).toContain("La plaque ne correspond pas à mon véhicule.");
  });

  it("garde le texte entier d'une faille monopharagraphique (pas d'en-tête détachable)", () => {
    const une = {
      id: "faille-x",
      titreFaille: "Faille X",
      articleLoi: "",
      templateLettre: "En-tête de {nom}.",
    };
    const lettre = remplirLettreMulti([prescription, une], data)!;
    expect(lettre).not.toContain("Argument n°");
    expect(lettre).toContain("En-tête de DUPONT.");
  });

  it("ne conclut qu'une seule fois : les conclusions redondantes des autres failles sont retirées", () => {
    const conclusionDeux = {
      id: "faille-y",
      titreFaille: "Faille Y",
      articleLoi: "Art. X",
      templateLettre:
        "Je soussigné {nom}, conteste aussi le PV {num_pv}.\n\nLe lieu est imprécis.\n\nEn conséquence, je vous demande de bien vouloir annuler la contravention.",
    };
    const lettre = remplirLettreMulti([prescription, conclusionDeux], data)!;
    // l'argument des deux failles est présent
    expect(lettre).toContain("Le lieu est imprécis.");
    expect(lettre).toContain("La prescription est acquise après un an.");
    // une seule conclusion finale (celle retenue), jamais répétée au milieu
    const occurrencesEnConsequence =
      lettre.split("En conséquence").length - 1;
    expect(occurrencesEnConsequence).toBe(1);
    expect(lettre.trim().endsWith("En conséquence, je vous demande de bien vouloir annuler la contravention.")).toBe(
      true,
    );
  });

  it("retourne null sans faille", () => {
    expect(remplirLettreMulti([], data)).toBeNull();
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

  it("plafonne une faille de catalogue à score non calibré", () => {
    // Une règle unique prouve la candidature, pas la réussite : pas de 98 %.
    expect(
      scoreFaille(
        { id: "faille-x", reglesDetection: [{ type: "champAbsent", champ: "cle" }] },
        {},
        null,
      ),
    ).toEqual({ matchees: 1, total: 1, score: 45, calibree: false });
  });

  it("respecte la calibration d'une faille calibrée à règle unique", () => {
    // Étalonnage : base 82 + 13 (certificat expiré) = 95, calibration juriste.
    expect(
      scoreFaille(
        {
          id: FAILLE_IDS.etalonnage,
          reglesDetection: [{ type: "etalonnageExpire" }],
        },
        { radarId: "1248", date: "2026-07-01" },
        null,
        { dateExpirationEtalonnage: "2020-01-01" },
      ),
    ).toMatchObject({ matchees: 1, total: 1, score: 95, calibree: true });
  });

  it("plafonne à 45 une faille de catalogue même avec une règle sur deux", () => {
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
    ).toEqual({ matchees: 1, total: 2, score: 45, calibree: false });
  });

  it("une faille calibrée à 1 règle sur 2 reste plafonnée à 60", () => {
    expect(
      scoreFaille(
        {
          id: FAILLE_IDS.mentions,
          reglesDetection: [
            { type: "texteContient", motif: "vitesse" },
            { type: "texteContient", motif: "introuvable" },
          ],
        },
        {},
        "excès de vitesse constaté",
      ),
    ).toEqual({ matchees: 1, total: 2, score: 60, calibree: true });
  });

  it("deux règles corroborantes débloquent le plafond de 98", () => {
    expect(
      scoreFaille(
        {
          id: FAILLE_IDS.mentions,
          reglesDetection: [
            { type: "texteContient", motif: "vitesse" },
            { type: "texteContient", motif: "constat" },
          ],
        },
        {},
        "excès de vitesse constaté sur le radar",
      ),
    ).toEqual({ matchees: 2, total: 2, score: 92, calibree: true });
  });

  it("évalue le prédicat hérité pour une faille connue sans règles", () => {
    expect(
      scoreFaille(
        { id: FAILLE_IDS.prescription },
        { date: "2020-01-01" },
        null,
      ),
    ).toEqual({ matchees: 1, total: 1, score: 88, calibree: true });
  });
});

describe("FAILLE_IDS — synchronisation seed (audit lot 5)", () => {
  it("ne contient que les 4 failles AMENDE seedées (aucun id fantôme)", () => {
    expect([...Object.values(FAILLE_IDS)].sort()).toEqual(
      [
        "faille-certificat-etalonnage",
        "faille-erreur-plaque",
        "faille-mentions-obligatoires",
        "faille-prescription-1-an",
      ].sort(),
    );
  });
});
describe("règles du pack 3F/48SI (types additifs)", () => {
  const uneSeule = (id: string, regle: unknown) => [
    { id, reglesDetection: [regle as RegleDetection] },
  ];
  const PACK_ID = "faille-3f-delai-retention";

  it("delaiDepasse : horodatage contrôle → signature (72 h)", () => {
    const faillesPack = uneSeule(PACK_ID, { type: "delaiDepasse", limiteHeures: 72 });
    // 97 h entre le contrôle et la signature de l'arrêté → dépassé.
    expect(
      detecterFailles(
        { date: "2026-07-01", heure: "08:00", dateSignatureArrete: "2026-07-05", heureSignatureArrete: "09:00" },
        null,
        faillesPack,
      ),
    ).toEqual([PACK_ID]);
    // 26 h → dans les délais.
    expect(
      detecterFailles(
        { date: "2026-07-01", heure: "08:00", dateSignatureArrete: "2026-07-02", heureSignatureArrete: "09:00" },
        null,
        faillesPack,
      ),
    ).toEqual([]);
    // Date de signature absente → aucun horodatage fabriqué.
    expect(
      detecterFailles(
        { date: "2026-07-01", heure: "08:00" },
        null,
        faillesPack,
      ),
    ).toEqual([]);
    expect(
      detecterFailles(
        { dateSignatureArrete: "2026-07-05", heureSignatureArrete: "09:00" },
        null,
        faillesPack,
      ),
    ).toEqual([]);
  });

  it("delaiDepasse : siChamp conditionne le délai au motif (72 h vitesse)", () => {
    const faillesPack = uneSeule(PACK_ID, {
      type: "delaiDepasse",
      limiteHeures: 72,
      siChamp: { champ: "motif", valeur: "vitesse" },
    });
    const base = { date: "2026-07-01", heure: "08:00", dateSignatureArrete: "2026-07-05", heureSignatureArrete: "09:00" };
    expect(detecterFailles({ ...base, motif: "excès de vitesse" }, null, faillesPack)).toEqual([PACK_ID]);
    expect(detecterFailles({ ...base, motif: "alcoolémie" }, null, faillesPack)).toEqual([]);
    expect(detecterFailles(base, null, faillesPack)).toEqual([]);
  });

  it("datePrealable : stage effectué avant la notification (48SI)", () => {
    const faillesPack = uneSeule("faille-48si-stage-avant-notification", {
      type: "datePrealable",
      champ: "dateStage",
      reference: "dateNotification",
    });
    expect(
      detecterFailles({ dateStage: "2026-06-01", dateNotification: "2026-06-15" }, null, faillesPack),
    ).toEqual(["faille-48si-stage-avant-notification"]);
    // Stage postérieur à la notification → pas de candidature.
    expect(
      detecterFailles({ dateStage: "2026-06-20", dateNotification: "2026-06-15" }, null, faillesPack),
    ).toEqual([]);
    expect(
      detecterFailles({ dateStage: "2026-06-01" }, null, faillesPack),
    ).toEqual([]);
  });

  it("valeurSuperieure : cumul de points, en nombre ou en chaîne", () => {
    const faillesPack = uneSeule("faille-48si-plafond-8pts", {
      type: "valeurSuperieure",
      champ: "pointsRetiresMemesDate",
      seuil: 8,
    });
    expect(detecterFailles({ pointsRetiresMemesDate: 9 }, null, faillesPack)).toEqual(["faille-48si-plafond-8pts"]);
    expect(detecterFailles({ pointsRetiresMemesDate: "9" }, null, faillesPack)).toEqual(["faille-48si-plafond-8pts"]);
    expect(detecterFailles({ pointsRetiresMemesDate: "9,5" }, null, faillesPack)).toEqual(["faille-48si-plafond-8pts"]);
    // Seuil strict : 8 n'est pas supérieur à 8.
    expect(detecterFailles({ pointsRetiresMemesDate: 8 }, null, faillesPack)).toEqual([]);
    expect(detecterFailles({ pointsRetiresMemesDate: "" }, null, faillesPack)).toEqual([]);
    expect(detecterFailles({}, null, faillesPack)).toEqual([]);
  });

  it("et : toutes les sous-règles doivent matcher (sinon OU entre règles d'une faille)", () => {
    const faillesPack = uneSeule("faille-48si-plafond-8pts", {
      type: "et",
      regles: [
        { type: "valeurSuperieure", champ: "pointsRetiresMemesDate", seuil: 8 },
        { type: "champAbsent", champ: "dateNotification" },
      ],
    });
    expect(detecterFailles({ pointsRetiresMemesDate: 9 }, null, faillesPack)).toEqual(["faille-48si-plafond-8pts"]);
    expect(detecterFailles({ pointsRetiresMemesDate: 9, dateNotification: "2026-06-15" }, null, faillesPack)).toEqual([]);
    expect(detecterFailles({ dateNotification: "2026-06-15" }, null, faillesPack)).toEqual([]);
  });

  it("cloisonnement docType : une règle 3F ne matche jamais sur une 48SI (ni sans classement)", () => {
    const faillesPack = uneSeule(PACK_ID, {
      type: "texteContient",
      motif: "vitesse",
      docType: "3F",
    });
    expect(detecterFailles({ docType: "3F" }, "avis pour excès de vitesse", faillesPack)).toEqual([PACK_ID]);
    expect(detecterFailles({ docType: "48SI" }, "avis pour excès de vitesse", faillesPack)).toEqual([]);
    expect(detecterFailles({ docType: "AMENDE" }, "avis pour excès de vitesse", faillesPack)).toEqual([]);
    expect(detecterFailles({}, "avis pour excès de vitesse", faillesPack)).toEqual([]);
  });

  it("les failles pack passent après les 4 failles seedées, les autres après", () => {
    const faillesOrdre = [
      { id: PACK_ID, reglesDetection: [{ type: "texteContient", motif: "vitesse" } as RegleDetection] },
      { id: FAILLE_IDS.prescription },
      { id: "faille-autre-suspension", reglesDetection: [{ type: "texteContient", motif: "vitesse" } as RegleDetection] },
    ];
    expect(
      detecterFailles({ date: "2024-01-01" }, "avis pour excès de vitesse", faillesOrdre),
    ).toEqual([FAILLE_IDS.prescription, PACK_ID, "faille-autre-suspension"]);
  });
});
