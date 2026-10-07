import { describe, expect, it, vi, afterEach } from "vitest";
import {
  listePiecesJointes,
  typesPreuvesPourFailles,
  faillesPourTypePreuve,
  recupererPreuvesPourDossierId,
} from "./preuves-api";

describe("listePiecesJointes — inventaire des pièces jointes de la contestation", () => {
  it("liste toujours la copie du PV / de la décision avec sa référence", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      numRef: "PV-123",
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de l'avis de contravention n° PV-123"]);
  });

  it("adapte le libellé pour une suspension de permis", () => {
    const pieces = listePiecesJointes({
      type: "SUSPENSION",
      numRef: "DEC-7",
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de la décision de suspension n° DEC-7"]);
  });

  it("rajoute chaque preuve réellement récupérée", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      numRef: "PV-1",
      preuves: [
        { nom: "Fiche radar — MESTA 210C (A6)", type: "RADAR", url: "" },
        { nom: "Travaux — A10 Orléans", type: "TRAVAUX", url: "" },
      ],
    });
    expect(pieces).toHaveLength(3);
    expect(pieces[1]).toContain("MESTA");
    expect(pieces[2]).toContain("A10");
  });

  it("rappelle le relevé météo (conditions_meteo) sur la preuve METEO", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      conditionsMeteo: "Ciel dégagé • 18°/26°C",
      preuves: [{ nom: "Bulletin météo historique", type: "METEO", url: "" }],
    });
    expect(pieces).toHaveLength(2);
    expect(pieces[1]).toBe("Bulletin météo historique — Ciel dégagé • 18°/26°C");
  });

  it("ne cite jamais une preuve absente (garde-fou anti-hallucination)", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      conditionsMeteo: null,
      numRef: null,
      preuves: [],
    });
    expect(pieces).toEqual(["Copie de l'avis de contravention"]);
  });

  it("ignore les preuves sans nom n'ayant pas à être listées", () => {
    const pieces = listePiecesJointes({
      type: "AMENDE",
      preuves: [
        { nom: "  ", type: "METEO", url: "" },
        { nom: "Piece valide", type: "OTHER", url: "/uploads/x.png" },
      ],
    });
    expect(pieces).toContain("Piece valide");
    expect(pieces).not.toContain("");
  });
});

describe("typesPreuvesPourFailles — pertinence faille → preuves externes", () => {
  it("reste vide sans faille pertinente (aucune preuve cherchée)", () => {
    expect(typesPreuvesPourFailles([]).size).toBe(0);
    expect(
      typesPreuvesPourFailles(["faille-prescription-1-an", "faille-erreur-plaque"]).size,
    ).toBe(0);
  });

  it("mappe la faille étalonnage sur la fiche radar uniquement", () => {
    const types = typesPreuvesPourFailles(["faille-certificat-etalonnage"]);
    expect(types.has("RADAR")).toBe(true);
    expect(types.has("METEO")).toBe(false);
    expect(types.has("TRAVAUX")).toBe(false);
  });

  it("mappe la faille travaux sur les chantiers routiers", () => {
    const types = typesPreuvesPourFailles(["faille-panneau-non-conforme"]);
    expect(types.has("TRAVAUX")).toBe(true);
  });

  it("n'expose plus de mapping météo (faille-meteo-visibilite = id fantôme retiré, audit lot 5)", () => {
    expect(faillesPourTypePreuve("METEO")).toEqual([]);
    expect(typesPreuvesPourFailles(["faille-certificat-etalonnage"]).has("METEO")).toBe(false);
  });

  it("fait l'union des types quand plusieurs failles sont pertinentes", () => {
    const types = typesPreuvesPourFailles([
      "faille-certificat-etalonnage",
      "faille-panneau-non-conforme",
    ]);
    expect(types.has("RADAR")).toBe(true);
    expect(types.has("TRAVAUX")).toBe(true);
    expect(types.has("METEO")).toBe(false);
  });
});

describe("faillesPourTypePreuve — inverse : preuve externe → failles pertinentes", () => {
  it("retourne les failles du mapping pour chaque type", () => {
    expect(faillesPourTypePreuve("METEO")).toEqual([]);
    expect(faillesPourTypePreuve("RADAR")).toContain("faille-certificat-etalonnage");
    expect(faillesPourTypePreuve("TRAVAUX")).toContain("faille-panneau-non-conforme");
  });

  it("correspond aux failles qui pointent réellement vers le type", () => {
    const radarFailles = faillesPourTypePreuve("RADAR");
    expect(radarFailles).toContain("faille-homologation-radar");
    // Aucune faille « prescription » ou « plaque » ne déclenche de preuve.
    expect(radarFailles).not.toContain("faille-prescription-1-an");
    expect(radarFailles).not.toContain("faille-erreur-plaque");
  });
});

describe("recupererPreuvesPourDossierId — anti-redondance (vérification, pas re-récupération)", () => {
  const dossierSansPreuve = {
    id: "d1",
    statut: "EN_ATTENTE_VALIDATION",
    type: "AMENDE",
    conditions_meteo: null,
    extractedData: {
      date: "2026-05-10",
      latitude: 48.8,
      longitude: 2.3,
      radarId: "7576",
      adresse: "12 rue de la Paix 75001 PARIS",
    },
  };

  function mockFetch(weathercode: number = 61) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("archive-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            daily: {
              weathercode: [weathercode],
              temperature_2m_max: [12],
              temperature_2m_min: [8],
              precipitation_sum: [5],
            },
          }),
        );
      }
      if (url.includes("radars.csv")) {
        return new Response(
          [
            "id,departement,latitude,longitude,type,route,emplacement,date_installation,direction,equipement,vitesse_vehicules_legers_kmh",
            "7576,75,48.8,2.3,radar fixe,A6,km 42,2020-01-01,Tout sens,MESTA 210C,90",
          ].join("\n"),
        );
      }
      if (url.includes("data.sarthe.fr")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                loc_txt: "RD 100",
                nature_trvx: "Chaussée",
                date_debut: "2026-01-01",
                date_fin: "2026-12-31",
              },
            ],
          }),
        );
      }
      return new Response("{}", { status: 404 });
    }));
  }

  function depAvecExistant(existantes: Array<{ type: string; nom: string }>) {
    const creates: Array<{ type: string; nom: string }> = [];
    return {
      dossier: {
        findUnique: vi.fn(async () => dossierSansPreuve),
        update: vi.fn(async () => ({})),
      },
      preuve: {
        findMany: vi.fn(async () => existantes),
        create: vi.fn(async (args: { data: { type: string; nom: string } }) => {
          creates.push({ type: args.data.type, nom: args.data.nom });
          return args.data;
        }),
      },
      __creates: creates,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("ajoute chaque preuve non encore identifiée (météo, radar, travaux)", async () => {
    mockFetch();
    const dep = depAvecExistant([]);
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    expect(res.verifiees).toEqual([]);
    expect(res.alertes).toEqual([]);
    expect(res.ajoutees.some((a) => a.startsWith("météo"))).toBe(true);
    expect(res.ajoutees.some((a) => a.startsWith("radar"))).toBe(true);
    expect(res.ajoutees.some((a) => a.startsWith("travaux"))).toBe(true);
    const types = dep.__creates.map((c) => c.type);
    expect(types).toContain("METEO");
    expect(types).toContain("RADAR");
    expect(types).toContain("TRAVAUX");
  });

  it("fiche radar enrichie : équipement et limite VL issus du CSV officiel", async () => {
    mockFetch();
    const dep = depAvecExistant([]);
    await recupererPreuvesPourDossierId(dep as never, "d1");
    const radar = dep.__creates.find((c) => c.type === "RADAR");
    expect(radar?.nom).toContain("MESTA 210C");
    expect(radar?.nom).toContain("A6");
  });

  it("météo à l'heure de l'infraction : relevé horaire quand la journée était clémente", async () => {
    // Heure de l'infraction = 14h32 ; à 14h pluie (code 61) alors que le
    // journalier est clair (code 0). La preuve est versée car la condition
    // défavorable a eu lieu à l'heure exacte du PV.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("archive-api.open-meteo.com")) {
        const hourlyCode = Array(24).fill(0);
        hourlyCode[14] = 61;
        return new Response(
          JSON.stringify({
            daily: { weathercode: [0], temperature_2m_max: [18], temperature_2m_min: [10] },
            hourly: {
              weathercode: hourlyCode,
              temperature_2m: Array(24).fill(15).map((_, i) => (i === 14 ? 14 : 15)),
              precipitation: Array(24).fill(0).map((_, i) => (i === 14 ? 5 : 0)),
            },
          }),
        );
      }
      if (url.includes("radars.csv")) {
        return new Response(
          [
            "id,departement,latitude,longitude,type,route,emplacement,date_installation",
            "7576,75,48.8,2.3,radar fixe,A6,km 42,2020-01-01",
          ].join("\n"),
        );
      }
      return new Response("{}", { status: 404 });
    }));
    const dep = depAvecExistant([]);
    dep.dossier.findUnique.mockImplementation(async () => ({
      ...dossierSansPreuve,
      extractedData: { ...dossierSansPreuve.extractedData, heure: "14h32" },
    }));
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    const meteo = dep.__creates.find((c) => c.type === "METEO");
    expect(meteo).toBeDefined();
    expect(res.ajoutees.some((a) => a.startsWith("météo (14h"))).toBe(true);
    expect(
      res.verifiees.some((v) => v.includes("conditions non défavorables")),
    ).toBe(false);
  });

  it("ne recrée JAMAIS une preuve déjà identifiée : révision seulement", async () => {
    mockFetch();
    const dep = depAvecExistant([
      { type: "METEO", nom: "Bulletin météo historique" },
      { type: "TRAVAUX", nom: "Travaux — RD 100" },
    ]);
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    // La météo et les travaux existent déjà : rien de changé pour eux.
    expect(dep.__creates.map((c) => c.type)).toEqual(["RADAR"]);
    expect(res.ajoutees.map((a) => a)).toEqual(["radar (radar fixe)"]);
    expect(res.verifiees).toContain("météo déjà identifiée (revérifiée)");
    expect(res.verifiees).toContain("travaux déjà identifiés (revérifiés)");
  });

  it("n'atteste JAMAIS une météo clémente : preuve non caractérisante écartée", async () => {
    // weathercode 0 = ciel dégagé : une belle journée ne prouve rien pour la
    // faille « visibilité » — aucune preuve METEO créée, message informatif.
    mockFetch(0);
    const dep = depAvecExistant([]);
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    expect(dep.__creates.map((c) => c.type)).not.toContain("METEO");
    expect(res.ajoutees.some((a) => a.startsWith("météo"))).toBe(false);
    expect(
      res.verifiees.some((v) => v.includes("conditions non défavorables")),
    ).toBe(true);
  });

  it("travaux multi-départements : interroge plusieurs bases et déduplique", async () => {
    // Deux bases OpendataSoft listent le même chantier « RD 100 » : il ne doit
    // être créé qu'une seule fois, les autres étant ajoutés.
    vi.stubEnv(
      "TRAVAUX_OPENDATA_BASES",
      "https://data.sarthe.fr/api/explore/v2.1/catalog/datasets/sarthe,https://data.angers.fr/api/explore/v2.1/catalog/datasets/angers",
    );
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("archive-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            daily: { weathercode: [0], temperature_2m_max: [12], temperature_2m_min: [8] },
          }),
        );
      }
      if (url.includes("radars.csv")) {
        return new Response(
          [
            "id,departement,latitude,longitude,type,route,emplacement,date_installation",
            "7576,75,48.8,2.3,radar fixe,A6,km 42,2020-01-01",
          ].join("\n"),
        );
      }
      if (url.includes("data.angers.fr")) {
        return new Response(
          JSON.stringify({
            results: [
              { loc_txt: "RD 100", nature_trvx: "Chaussée" },
              { loc_txt: "BF 45", nature_trvx: "Grue" },
            ],
          }),
        );
      }
      if (url.includes("data.sarthe.fr")) {
        return new Response(
          JSON.stringify({
            results: [{ loc_txt: "RD 100", nature_trvx: "Chaussée" }],
          }),
        );
      }
      return new Response("{}", { status: 404 });
    }));
    const dep = depAvecExistant([]);
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    const travaux = dep.__creates.filter((c) => c.type === "TRAVAUX");
    expect(travaux).toHaveLength(2);
    expect(travaux.map((t) => t.nom)).toContain("Travaux — RD 100");
    expect(travaux.map((t) => t.nom)).toContain("Travaux — BF 45");
    expect(res.ajoutees.some((a) => a.startsWith("travaux (2"))).toBe(true);
  });
});

describe("recupererPreuvesPourDossierId — alertes : source injoignable ≠ rien trouvé", () => {
  const dossier = {
    id: "d1",
    statut: "EN_ATTENTE_VALIDATION",
    type: "AMENDE",
    conditions_meteo: null,
    extractedData: {
      date: "2026-05-10",
      latitude: 48.8,
      longitude: 2.3,
      radarId: "7576",
      adresse: "12 rue de la Paix 75001 PARIS",
    },
  };

  function dep(existantes: Array<{ type: string; nom: string }> = []) {
    const creates: Array<{ type: string; nom: string }> = [];
    return {
      dossier: {
        findUnique: vi.fn(
          async (): Promise<Record<string, unknown>> => dossier,
        ),
        update: vi.fn(async () => ({})),
      },
      preuve: {
        findMany: vi.fn(async () => existantes),
        create: vi.fn(async (args: { data: { type: string; nom: string } }) => {
          creates.push({ type: args.data.type, nom: args.data.nom });
          return args.data;
        }),
      },
      __creates: creates,
    };
  }

  /** Routage des appels : `overrides` (substring → handler) sinon défaut OK. */
  function routerFetch(overrides: Record<string, () => Response>) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [cle, handler] of Object.entries(overrides)) {
        if (url.includes(cle)) return handler();
      }
      if (url.includes("archive-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            daily: {
              weathercode: [61],
              temperature_2m_max: [12],
              temperature_2m_min: [8],
              precipitation_sum: [5],
            },
          }),
        );
      }
      if (url.includes("radars.csv")) {
        return new Response(
          [
            "id,departement,latitude,longitude,type,route,emplacement,date_installation",
            "7576,75,48.8,2.3,radar fixe,A6,km 42,2020-01-01",
          ].join("\n"),
        );
      }
      if (url.includes("data.sarthe.fr")) {
        return new Response(JSON.stringify({ results: [] }));
      }
      return new Response("{}", { status: 404 });
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("chemin sain : aucune alerte (rien trouvé reste un résultat, pas une panne)", async () => {
    vi.stubGlobal("fetch", routerFetch({}));
    const res = await recupererPreuvesPourDossierId(dep() as never, "d1");
    expect(res.alertes).toEqual([]);
  });

  it("météo injoignable (HTTP 503) : alerte explicite, pas de preuve, les autres sources continuent", async () => {
    vi.stubGlobal(
      "fetch",
      routerFetch({
        "archive-api.open-meteo.com": () =>
          new Response("{}", { status: 503 }),
      }),
    );
    const d = dep();
    const res = await recupererPreuvesPourDossierId(d as never, "d1");
    expect(res.alertes.some((a) => a.includes("Météo") && a.includes("503"))).toBe(true);
    expect(d.__creates.map((c) => c.type)).not.toContain("METEO");
    // radar et travaux ne sont pas impactés par la panne météo : le radar est
    // créé, le chemin travaux s'exécute (0 chantier dans la zone = vérifié,
    // sans aucune alerte travaux).
    expect(d.__creates.map((c) => c.type)).toContain("RADAR");
    expect(res.alertes.filter((a) => a.includes("Travaux"))).toEqual([]);
    expect(res.verifiees.some((v) => v.includes("travaux"))).toBe(true);
  });

  it("toutes les bases travaux injoignables : alerte « aucun chantier vérifié »", async () => {
    vi.stubGlobal(
      "fetch",
      routerFetch({
        "data.sarthe.fr": () => new Response("{}", { status: 500 }),
      }),
    );
    const d = dep();
    const res = await recupererPreuvesPourDossierId(d as never, "d1");
    expect(
      res.alertes.some(
        (a) => a.includes("Travaux") && a.includes("aucun chantier vérifié"),
      ),
    ).toBe(true);
    expect(d.__creates.map((c) => c.type)).not.toContain("TRAVAUX");
  });

  it("BAN injoignable : alerte géocodage, météo/travaux abandonnés, radar toujours vérifié", async () => {
    vi.stubGlobal(
      "fetch",
      routerFetch({
        "api-adresse.data.gouv.fr": () => new Response("{}", { status: 503 }),
      }),
    );
    const d = dep();
    d.dossier.findUnique.mockImplementation(async () => ({
      ...dossier,
      extractedData: { date: "2026-05-10", radarId: "7576", adresse: "12 rue de la Paix 75001 PARIS" },
    }));
    const res = await recupererPreuvesPourDossierId(d as never, "d1");
    expect(res.alertes.some((a) => a.includes("Géocodage (BAN)"))).toBe(true);
    const types = d.__creates.map((c) => c.type);
    expect(types).toEqual(["RADAR"]);
  });

  it("adresse absente du dossier : alerte explicite (pas de silence)", async () => {
    vi.stubGlobal("fetch", routerFetch({}));
    const d = dep();
    d.dossier.findUnique.mockImplementation(async () => ({
      ...dossier,
      extractedData: { date: "2026-05-10", radarId: "7576" },
    }));
    const res = await recupererPreuvesPourDossierId(d as never, "d1");
    expect(res.alertes.some((a) => a.includes("Adresse absente du dossier"))).toBe(true);
  });

  it("radar sans correspondance : « rien trouvé » tracé comme vérification, pas comme panne", async () => {
    vi.stubGlobal("fetch", routerFetch({}));
    const d = dep();
    d.dossier.findUnique.mockImplementation(async () => ({
      ...dossier,
      extractedData: {
        date: "2026-05-10",
        latitude: 41.4,
        longitude: 9.2,
        radarId: "9999",
        adresse: "Ajaccio",
      },
    }));
    const res = await recupererPreuvesPourDossierId(d as never, "d1");
    expect(d.__creates.map((c) => c.type)).not.toContain("RADAR");
    expect(
      res.verifiees.some((v) => v.includes("aucune fiche correspondante")),
    ).toBe(true);
    expect(res.alertes.filter((a) => a.includes("radars"))).toEqual([]);
  });
});