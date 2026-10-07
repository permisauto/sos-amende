import { afterEach, describe, expect, it, vi } from "vitest";
import {
  construirePrompt,
  parserReponseIa,
  reponseIaMock,
  verifierAvecIa,
  type CatalogueIa,
} from "./verif-ia";

const catalogue: CatalogueIa[] = [
  {
    id: "faille-prescription-1-an",
    titreFaille: "Prescription de l'action publique",
    articleLoi: "art. 9 CPP",
    regle: "Délai d'un an écoulé",
  },
  {
    id: "faille-erreur-plaque",
    titreFaille: "Erreur de plaque",
    articleLoi: "art. 530-1 CPP",
  },
];

describe("construirePrompt", () => {
  it("contient les faits, le catalogue et les règles anti-hallucination", () => {
    const prompt = construirePrompt({ plaque: "AB-123-CD" }, catalogue);
    expect(prompt).toContain("AB-123-CD");
    expect(prompt).toContain("faille-prescription-1-an");
    expect(prompt).toContain("Règles absolues");
    expect(prompt).toContain("n'invente jamais");
  });
});

describe("parserReponseIa", () => {
  it("parse un JSON valide (avec fences éventuelles)", () => {
    const brut =
      '```json\n{"suggestions":[{"id":"faille-erreur-plaque","pertinence":"forte","justification":"La plaque du PV ne correspond pas au véhicule"}],"signalements":[]}\n```';
    const r = parserReponseIa(
      brut,
      catalogue.map((c) => c.id),
    );
    expect(r?.reponse.suggestions).toHaveLength(1);
    expect(r?.idsIgnores).toBe(0);
  });

  it("filtre toute id hors catalogue (jamais écrite en base)", () => {
    const brut = JSON.stringify({
      suggestions: [
        { id: "faille-inventee-18-51", pertinence: "forte", justification: "article 18-51 inventé par le modèle" },
        { id: "faille-erreur-plaque", pertinence: "moyenne", justification: "fait avéré sur ce dossier" },
      ],
      signalements: [{ id: "faille-avec-trop-longue-histoire-xx", motif: "id inventée aussi" }],
    });
    const r = parserReponseIa(
      brut,
      catalogue.map((c) => c.id),
    );
    expect(r?.reponse.suggestions.map((s) => s.id)).toEqual(["faille-erreur-plaque"]);
    expect(r?.reponse.signalements).toHaveLength(0);
    expect(r?.idsIgnores).toBe(2);
  });

  it("rejette un JSON illisible ou un schéma invalide", () => {
    expect(parserReponseIa("ce n'est pas du json", [])).toBeNull();
    expect(
      parserReponseIa(
        JSON.stringify({
          suggestions: [{ id: "faille-erreur-plaque", pertinence: "certaine", justification: "x" }],
        }),
        ["faille-erreur-plaque"],
      ),
    ).toBeNull();
  });

  it("écarte les justifications trop courtes et déduplique", () => {
    const brut = JSON.stringify({
      suggestions: [
        { id: "faille-erreur-plaque", pertinence: "forte", justification: "court" },
        { id: "faille-erreur-plaque", pertinence: "forte", justification: "justification suffisamment longue ici" },
        { id: "faille-erreur-plaque", pertinence: "moyenne", justification: "doublon écarté ici même id" },
      ],
      signalements: [],
    });
    const r = parserReponseIa(brut, ["faille-erreur-plaque"]);
    expect(r?.reponse.suggestions).toHaveLength(1);
    expect(r?.reponse.suggestions[0].justification).toContain("suffisamment");
  });

  it("une suggestion prime sur un signalement de même id", () => {
    const brut = JSON.stringify({
      suggestions: [
        { id: "faille-erreur-plaque", pertinence: "forte", justification: "justification suffisamment longue" },
      ],
      signalements: [
        { id: "faille-erreur-plaque", motif: "signalement contradictoire assez long" },
      ],
    });
    const r = parserReponseIa(brut, ["faille-erreur-plaque"]);
    expect(r?.reponse.suggestions).toHaveLength(1);
    expect(r?.reponse.signalements).toHaveLength(0);
  });
});

describe("reponseIaMock", () => {
  it("suggère tout le catalogue avec une trace « mock »", () => {
    const r = reponseIaMock(catalogue);
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[0].justification).toContain("mock");
    expect(r.signalements).toHaveLength(0);
  });
});

describe("verifierAvecIa — providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("mock : réponse déterministe sans réseau", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "mock");
    const r = await verifierAvecIa({}, catalogue);
    expect(r.source).toBe("mock");
    if (r.source === "mock") expect(r.reponse.suggestions).toHaveLength(2);
  });

  it("off : désactivé même avec une clé", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "off");
    vi.stubEnv("GEMINI_API_KEY", "cle");
    const r = await verifierAvecIa({}, catalogue);
    expect(r.source).toBe("indisponible");
  });

  it("sans clé : indisponible (fallback règles)", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const r = await verifierAvecIa({}, catalogue);
    expect(r.source).toBe("indisponible");
    if (r.source === "indisponible") expect(r.motif).toContain("règles");
  });

  it("gemini : appel réseau + parse de la réponse JSON", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "cle-test");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      suggestions: [
                        {
                          id: "faille-prescription-1-an",
                          pertinence: "forte",
                          justification: "La date du PV dépasse le délai d'un an",
                        },
                      ],
                      signalements: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await verifierAvecIa({ date: "2024-01-01" }, catalogue);
    expect(r.source).toBe("ia");
    if (r.source === "ia") {
      expect(r.reponse.suggestions[0].id).toBe("faille-prescription-1-an");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain("faille-prescription-1-an");
    expect(body).toContain("2024-01-01");
  });

  it("erreur HTTP : jamais d'exception, retour indisponible", async () => {
    vi.stubEnv("VERIF_IA_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "cle-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const r = await verifierAvecIa({}, catalogue);
    expect(r.source).toBe("indisponible");
  });
});

describe("motifsNonCouverts — propositions hors catalogue", () => {
  it("parse un motif non couvert complet (titre, observation, articleCite)", () => {
    const brut = JSON.stringify({
      suggestions: [],
      signalements: [],
      motifsNonCouverts: [
        {
          titre: "Mention du stage obligatoire absente",
          observation:
            "Le document ne comporte aucune mention du stage de sensibilisation alors que l'article le prévoit.",
          articleCite: "art. R. 232-14",
        },
      ],
    });
    const r = parserReponseIa(brut, []);
    expect(r?.reponse.motifsNonCouverts).toHaveLength(1);
    expect(r?.reponse.motifsNonCouverts[0].titre).toContain("stage");
    expect(r?.reponse.motifsNonCouverts[0].articleCite).toBe(
      "art. R. 232-14",
    );
  });

  it("borne les entrées (titre/observation trop courts écartés) et plafonne à 3", () => {
    const motifs = Array.from({ length: 5 }, (_, i) => ({
      titre: `Motif anormal numéro ${i} sur le document`,
      observation: `Constat factuel suffisamment détaillé numéro ${i} pour être retenu.`,
    }));
    motifs.push({ titre: "court", observation: "trop court" });
    const brut = JSON.stringify({ suggestions: [], signalements: [], motifsNonCouverts: motifs });
    const r = parserReponseIa(brut, []);
    expect(r?.reponse.motifsNonCouverts).toHaveLength(3);
  });

  it("déduplique les titres identiques (casse/accents)", () => {
    const brut = JSON.stringify({
      suggestions: [],
      signalements: [],
      motifsNonCouverts: [
        {
          titre: "Défaut de motivation de l'arrêté",
          observation: "Constat factuel suffisamment long sur la motivation absente.",
        },
        {
          titre: "DEFaut de motivation de l'arrete",
          observation: "Doublon avec accent différent mais même constat ici.",
        },
      ],
    });
    const r = parserReponseIa(brut, []);
    expect(r?.reponse.motifsNonCouverts).toHaveLength(1);
  });

  it("n'accepte jamais un articleCite trop long (anti-flood)", () => {
    const brut = JSON.stringify({
      suggestions: [],
      signalements: [],
      motifsNonCouverts: [
        {
          titre: "Motif avec article anormalement long",
          observation: "Constat factuel suffisamment long pour être retenu.",
          articleCite: "x".repeat(200),
        },
      ],
    });
    const r = parserReponseIa(brut, []);
    expect(r?.reponse.motifsNonCouverts[0].articleCite).toBeUndefined();
  });

  it("mock : aucun motif simulé (le catalogue n'est jamais pollué en base)", () => {
    const r = reponseIaMock(catalogue);
    expect(r.motifsNonCouverts).toEqual([]);
  });
});
