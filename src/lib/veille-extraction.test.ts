import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_EXTRACTION,
  SCORE_SEUIL_EXTRACTION,
  composerRegleProposition,
  construirePromptExtraction,
  contenuVerbatim,
  extraireProposition,
  extractionDispo,
  extractionMock,
  lignesListe,
  normaliserPourComparaison,
  parserExtraction,
  propositionDepuisFormulaire,
  refPropositionDepuisSource,
  type PublicationVeille,
} from "./veille-extraction";

const CONTENU = [
  "Le Tribunal administratif de Nice statue sur la contestation d'un avis de contravention",
  "dressé au titre de l'article L. 224-16 du code de la route pour excès de vitesse constaté",
  "par un cinémomètre fixe dont le certificat de vérification périodique avait expiré",
  "le 12 janvier 2026, l'autorité n'ayant pas justifié du contrôle d'étalonnage en vigueur",
  "au moment des faits du 3 mars 2026.",
].join(" ");

const PUB: PublicationVeille = {
  titre: "Excès de vitesse — absence de certificat d'étalonnage en vigueur",
  juridiction: "TA de Nice",
  dateSource: "2026-09-15",
  ecli: "ECLI:TA:NI:2026:1234",
  url: "https://www.legifrance.gouv.fr/juri/id/123",
  source: "TA",
  contenu: CONTENU,
  citations: [CONTENU.slice(0, 180) + "…"],
};

describe("normaliserPourComparaison / contenuVerbatim", () => {
  it("compare sans tenir compte des accents, de la casse ni des espaces", () => {
    expect(normaliserPourComparaison("État d'IVRESSE")).toBe(
      "etat d'ivresse",
    );
    expect(contenuVerbatim(CONTENU, "un cinemomètre FIXE")).toBe(true);
  });

  it("accepte les citations tronquées « … » de la veille, refuse l'absent et le trop court", () => {
    expect(contenuVerbatim(CONTENU, CONTENU.slice(0, 120) + "…")).toBe(true);
    expect(contenuVerbatim(CONTENU, "article L. 415-2 du code des impôts")).toBe(
      false,
    );
    expect(contenuVerbatim(CONTENU, "trop court")).toBe(false);
  });
});

describe("construirePromptExtraction", () => {
  it("impose le JSON, l'anti-invention d'articles et borne le texte", () => {
    const p = construirePromptExtraction(PUB);
    expect(p).toContain("Réponds UNIQUEMENT par un objet JSON");
    expect(p).toContain("Jamais d'article inventé");
    expect(p).toContain("citations VERBATIM");
    expect(p).toContain("conditions d'application");
    expect(p).toContain("Excès de vitesse");
    expect(p).toContain("=== TEXTE INTÉGRAL ===");
    expect(construirePromptExtraction({ ...PUB, contenu: "x".repeat(20_000) }))
      .toContain("x".repeat(12_000).slice(0, 50));
  });
});

describe("parserExtraction", () => {
  const brut = JSON.stringify({
    titre: "Étalonnage expiré — excès de vitesse contesté",
    typeInfraction: "AMENDE",
    articles: ["article L. 224-16 du code de la route"],
    regle: "Le constat d'infraction ne peut être reçu si le certificat d'étalonnage de l'appareil était expiré au moment des faits, l'autorité devant justifier du contrôle en vigueur.",
    conditions: [
      "certificat de vérification périodique avait expiré le 12 janvier 2026",
      "l'autorité n'ayant pas justifié du contrôle d'étalonnage en vigueur",
    ],
    resume: "Contestation d'un avis fondé sur un cinémomètre au certificat expiré.",
    extraits: [CONTENU.slice(0, 200) + "…"],
  });

  it("retient une proposition complète quand tout est verbatim", () => {
    const p = parserExtraction(brut, CONTENU);
    expect(p).not.toBeNull();
    expect(p!.etat).toBe("extrait");
    expect(p!.articles).toEqual(["article L. 224-16 du code de la route"]);
    expect(p!.extraits).toHaveLength(1);
    expect(p!.conditions.length).toBeGreaterThanOrEqual(1);
    expect(p!.motif).toBeUndefined();
  });

  it("accepte les fences ```json autour de la réponse", () => {
    const p = parserExtraction("```json\n" + brut + "\n```", CONTENU);
    expect(p?.etat).toBe("extrait");
  });

  it("retire tout article absent du texte (jamais d'article inventé)", () => {
    const p = parserExtraction(
      JSON.stringify({
        ...JSON.parse(brut),
        articles: ["article L. 224-16 du code de la route", "article L. 415-2 du code des impôts"],
      }),
      CONTENU,
    );
    expect(p!.articles).toEqual(["article L. 224-16 du code de la route"]);
  });

  it("marque incomplet (motif explicite) sans article ou sans extrait verbatim", () => {
    const sansArticle = parserExtraction(
      JSON.stringify({ ...JSON.parse(brut), articles: ["article L. 999-1 inexistant"] }),
      CONTENU,
    );
    expect(sansArticle!.etat).toBe("incomplet");
    expect(sansArticle!.articles).toEqual([]);
    expect(sansArticle!.motif).toContain("aucun article");

    const sansExtrait = parserExtraction(
      JSON.stringify({ ...JSON.parse(brut), extraits: ["Ce passage n'existe pas dans le texte publié, il est inventé."] }),
      CONTENU,
    );
    expect(sansExtrait!.etat).toBe("incomplet");
    expect(sansExtrait!.motif).toContain("extrait");
  });

  it("exige au moins une condition d'application textuelle", () => {
    const sansCondition = parserExtraction(
      JSON.stringify({ ...JSON.parse(brut), conditions: [] }),
      CONTENU,
    );
    expect(sansCondition!.etat).toBe("incomplet");
    expect(sansCondition!.motif).toContain("condition");

    const conditionInventee = parserExtraction(
      JSON.stringify({
        ...JSON.parse(brut),
        conditions: ["Le conducteur était en état d'ivresse au moment du constat"],
      }),
      CONTENU,
    );
    expect(conditionInventee!.conditions).toEqual([]);
    expect(conditionInventee!.etat).toBe("incomplet");
  });

  it("déduplique articles et extraits", () => {
    const p = parserExtraction(
      JSON.stringify({
        ...JSON.parse(brut),
        articles: ["article L. 224-16 du code de la route", "ARTICLE L. 224-16 DU CODE DE LA ROUTE"],
        extraits: [CONTENU.slice(0, 200) + "…", CONTENU.slice(0, 200) + "…"],
      }),
      CONTENU,
    );
    expect(p!.articles).toHaveLength(1);
    expect(p!.extraits).toHaveLength(1);
  });

  it("rejette un JSON illisible ou un schéma invalide", () => {
    expect(parserExtraction("{pas du json", CONTENU)).toBeNull();
    expect(
      parserExtraction(
        JSON.stringify({ titre: "ok", typeInfraction: "PANNEAU", articles: [], regle: "", resume: "", extraits: [] }),
        CONTENU,
      ),
    ).toBeNull();
  });
});

describe("extractionMock", () => {
  it("produit une proposition exploitable via le même parser (articles regex)", () => {
    const brut = extractionMock(PUB);
    const p = parserExtraction(brut, CONTENU);
    expect(p).not.toBeNull();
    expect(p!.etat).toBe("extrait");
    expect(p!.articles.length).toBeGreaterThan(0);
    expect(p!.regle).toContain("Simulation (mock)");
    expect(p!.typeInfraction).toBe("AMENDE");
  });

  it("bascule en SUSPENSION quand le titre porte sur le permis, incomplet sans article", () => {
    const pub: PublicationVeille = {
      ...PUB,
      titre: "Suspension du permis de conduire — excès de vitesse",
      contenu: "Aucun article de loi n'est cité dans ce texte qui ne contient aucune référence légale.",
      citations: [],
    };
    const p = parserExtraction(extractionMock(pub), pub.contenu);
    expect(p!.typeInfraction).toBe("SUSPENSION");
    expect(p!.etat).toBe("incomplet");
  });
});

describe("extraireProposition — providers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("mock : déterministe, sans réseau", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "mock");
    expect(extractionDispo()).toBe("mock");
    const r = await extraireProposition(PUB);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposition.etat).toBe("extrait");
  });

  it("off : désactivé, jamais d'appel", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "off");
    const r = await extraireProposition(PUB);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain("désactivée");
  });

  it("sans clé : indisponible", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(extractionDispo()).toBe("absent");
    const r = await extraireProposition(PUB);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain("GEMINI_API_KEY");
  });
});

describe("bornes du lot automatique", () => {
  it("garde le budget et le seuil d'ingestion cohérents avec la page veille", () => {
    expect(SCORE_SEUIL_EXTRACTION).toBe(12);
    // Budget élargi (lot O) : le cron rejoue les candidats restants à chaque
    // passage — la boîte de temps reste le garde-fou réel.
    expect(BUDGET_EXTRACTION).toBe(40);
  });
});

describe("lignesListe — listes saisies une par ligne", () => {
  it("découpe CRLF/LF, trime et ignore les lignes vides", () => {
    expect(lignesListe("C. route, art. L. 121-1\r\n\n  C. route, art. R. 417-2  \n")).toEqual([
      "C. route, art. L. 121-1",
      "C. route, art. R. 417-2",
    ]);
    expect(lignesListe("   ")).toEqual([]);
  });
});

describe("propositionDepuisFormulaire — correction admin (lot O)", () => {
  const complet = {
    titre: "Défaut de motivation — annulation de l'avis",
    typeInfraction: "AMENDE" as const,
    articles: "C. route, art. L. 121-1",
    regle:
      "L'avis de contravention doit être motivé à peine de nullité, la juridiction annulant l'avis régulièrement contesté faute de motivation suffisante.",
    conditions:
      "L'avis de contravention contesté ne comporte pas de motif mentionnant les raisons du contrôle.",
    resume: "Annulation pour défaut de motivation de l'arrêté attaqué.",
  };

  it("construit une proposition complète et datée avec les extraits conservés", () => {
    const r = propositionDepuisFormulaire(complet, {
      extraits: ["la juridiction annule l'avis faute de motivation"],
      extraitLe: "2026-10-01T10:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition.etat).toBe("extrait");
    expect(r.proposition.extraitLe).toBe("2026-10-01T10:00:00.000Z");
    expect(r.proposition.corrigeLe).toBeTruthy();
    expect(r.proposition.extraits).toEqual([
      "la juridiction annule l'avis faute de motivation",
    ]);
    expect(r.proposition.motif).toBeUndefined();
  });

  it("déduplique les articles/conditions et bascule en SUSPENSION", () => {
    const r = propositionDepuisFormulaire({
      ...complet,
      typeInfraction: "SUSPENSION",
      articles: "C. route, art. L. 224-16\nC. route, art. L. 224-16",
      conditions: `${complet.conditions}\n${complet.conditions}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition.articles).toHaveLength(1);
    expect(r.proposition.conditions).toHaveLength(1);
    expect(r.proposition.typeInfraction).toBe("SUSPENSION");
  });

  it("refuse un titre trop court ou un article mal formé (jamais acceptés)", () => {
    const tropCourt = propositionDepuisFormulaire({ ...complet, titre: "ok" });
    expect(tropCourt.ok).toBe(false);
    if (!tropCourt.ok) expect(tropCourt.erreur).toContain("Titre trop court");

    const articleInvalide = propositionDepuisFormulaire({
      ...complet,
      articles: "X",
    });
    expect(articleInvalide.ok).toBe(false);
    if (!articleInvalide.ok) expect(articleInvalide.erreur).toContain("Article invalide");

    const conditionCourte = propositionDepuisFormulaire({
      ...complet,
      conditions: "trop courte",
    });
    expect(conditionCourte.ok).toBe(false);
    if (!conditionCourte.ok) expect(conditionCourte.erreur).toContain("Condition invalide");
  });

  it("sauvegarde tolère l'incomplet (motif explicite) pour un brouillon", () => {
    const sansArticle = propositionDepuisFormulaire({
      ...complet,
      articles: "",
      conditions: "",
    });
    expect(sansArticle.ok).toBe(true);
    if (!sansArticle.ok) return;
    expect(sansArticle.proposition.etat).toBe("incomplet");
    expect(sansArticle.proposition.motif).toContain("aucun article");
    expect(sansArticle.proposition.motif).toContain("aucune condition");
  });

  it("une règle trop courte rend la proposition incomplète (validable après correction)", () => {
    const r = propositionDepuisFormulaire({ ...complet, regle: "trop court" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition.etat).toBe("incomplet");
    expect(r.proposition.motif).toContain("règle dégagée");
  });

  it("les extraits verbatim ne bloquent plus la validation après correction", () => {
    const r = propositionDepuisFormulaire(complet, { extraits: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition.extraits).toEqual([]);
    expect(r.proposition.etat).toBe("extrait");
  });
});

describe("composerRegleProposition — format partagé (validation + auto-proposition)", () => {
  const p = parserExtraction(extractionMock(PUB), CONTENU)!;

  it("assemble la règle et le bloc « Conditions d'application »", () => {
    const regle = composerRegleProposition({
      ...p,
      regle: "Règle X",
      conditions: ["cond A", "cond B"],
    });
    expect(regle).toBe(
      "Règle X\n\nConditions d'application :\n- cond A\n- cond B",
    );
  });

  it("sans condition, retourne la règle seule", () => {
    expect(composerRegleProposition({ ...p, regle: "Règle Y", conditions: [] })).toBe(
      "Règle Y",
    );
  });
});

describe("refPropositionDepuisSource — référence au format base juridique", () => {
  const p = parserExtraction(extractionMock(PUB), CONTENU)!;
  const source = {
    ecli: "ECLI:TA:NI:2026:1234",
    reference: null,
    idDila: "DILA00001",
    juridiction: "TA de Nice",
    source: "JADE",
    dateSource: new Date("2026-09-15"),
    url: "https://www.legifrance.gouv.fr/juri/id/123",
  };

  it("n'est jamais vérifiée sans confirmation humaine", () => {
    const ref = refPropositionDepuisSource(source, p);
    expect(ref.verifiee).toBe(false);
    expect(ref.reference).toContain("ECLI:TA:NI:2026:1234");
    expect(ref.url).toBe("https://www.legifrance.gouv.fr/juri/id/123");
    expect(ref.date).toBe("2026-09-15");
    expect(ref.resume).toBeTruthy();
  });

  it("replie sur l'id DILA sans ecli ni référence", () => {
    const ref = refPropositionDepuisSource({ ...source, ecli: null, reference: null }, p);
    expect(ref.reference).toBe("DILA00001");
  });
});
