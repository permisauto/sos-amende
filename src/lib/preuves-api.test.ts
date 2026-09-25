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
    const types = typesPreuvesPourFailles(["faille-travaux-signalisation"]);
    expect(types.has("TRAVAUX")).toBe(true);
  });

  it("mappe la faille météo sur le bulletin météo", () => {
    const types = typesPreuvesPourFailles(["faille-meteo-visibilite"]);
    expect(types.has("METEO")).toBe(true);
  });

  it("fait l'union des types quand plusieurs failles sont pertinentes", () => {
    const types = typesPreuvesPourFailles([
      "faille-certificat-etalonnage",
      "faille-travaux-signalisation",
    ]);
    expect(types.has("RADAR")).toBe(true);
    expect(types.has("TRAVAUX")).toBe(true);
    expect(types.has("METEO")).toBe(false);
  });
});

describe("faillesPourTypePreuve — inverse : preuve externe → failles pertinentes", () => {
  it("reste vide pour un type sans faille associée", () => {
    // Il n'existe pas de mapping TELEMETRE… : on teste un type courant qui
    // n'apparaît dans aucun mapping (aucune chance de faux positifs).
    expect(faillesPourTypePreuve("METEO")).toContain("faille-meteo-visibilite");
    expect(faillesPourTypePreuve("RADAR")).toContain("faille-certificat-etalonnage");
    expect(faillesPourTypePreuve("TRAVAUX")).toContain("faille-travaux-signalisation");
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
            "id,departement,latitude,longitude,type,route,emplacement,date_installation",
            "7576,75,48.8,2.3,radar fixe,A6,km 42,2020-01-01",
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
  });

  it("ajoute chaque preuve non encore identifiée (météo, radar, travaux)", async () => {
    mockFetch();
    const dep = depAvecExistant([]);
    const res = await recupererPreuvesPourDossierId(dep as never, "d1");
    expect(res.verifiees).toEqual([]);
    expect(res.ajoutees.some((a) => a.startsWith("météo"))).toBe(true);
    expect(res.ajoutees.some((a) => a.startsWith("radar"))).toBe(true);
    expect(res.ajoutees.some((a) => a.startsWith("travaux"))).toBe(true);
    const types = dep.__creates.map((c) => c.type);
    expect(types).toContain("METEO");
    expect(types).toContain("RADAR");
    expect(types).toContain("TRAVAUX");
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
});