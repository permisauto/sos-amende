import { describe, it, expect } from "vitest";
import type { SourceDila } from "@/lib/veille-dila";
import {
  MOTS_CLES_AMBIGUS,
  MOTS_CLES_APPUI,
  MOTS_CLES_CORE,
  SEUIL_PERTINENCE,
  estPertinente,
  extraireCitations,
  normaliser,
  redigerBrouillonRegle,
  resumeSource,
  scorerPertinence,
} from "@/lib/veille-perteinence";

function source(over: Partial<SourceDila> = {}): SourceDila {
  return {
    cle: "ECLI:FR:CEORD:2026:519188.20260914",
    id: "CETATEXT000054841719",
    source: "JADE",
    nature: "Texte",
    titre: "Conseil d'État, Juge des référés, 14/09/2026, 519188",
    juridiction: "Conseil d'État",
    dateDecision: "2026-09-14",
    reference: "519188",
    ecli: "ECLI:FR:CEORD:2026:519188.20260914",
    url: "https://www.legifrance.gouv.fr/juri/id/CETATEXT000054841719",
    contenu: "",
    ...over,
  };
}

/** Texte représentatif d'une décision réellement pertinente (alcoolémie). */
const CONTENU_ALCOOL = `Vu la requête de la société tendant à la suspension de la décision contestée.
Le Code de la route prévoit, en son article R. 233-1, les modalités du contrôle de l'alcoolémie au volant.
Les travaux de l'éthylotest réalisés sur le véhicule établissent un taux d'alcoolémie de 0,84 g/l.
Le vice de procédure allégué, tenant à l'absence de notification, n'est pas établi.
Par ces motifs, la cour annule le jugement et suspended la procédure en cours.`;

/** Texte hors sujet : du droit administratif générique. */
const CONTENU_HORS_SUJET = `Le requérant demande l'annulation d'une décision de refus d'inscription au tableau.
La notification a été adressée par lettre recommandée avec accusé de réception.
Le tribunal administratif a statué après avoir mis en demeure la société de produire des pièces.
La prescription triennale est soulevée d'office. La majoration de la contribution n'est pas due.`;

describe("veille-perteinence — dictionnaire", () => {
  it("n'a aucun terme commun entre core, appui et ambigus (pas de double compte)", () => {
    const core = new Set(MOTS_CLES_CORE.map((m) => m.terme));
    const appui = new Set(MOTS_CLES_APPUI.map((m) => m.terme));
    const tous = [...MOTS_CLES_CORE, ...MOTS_CLES_APPUI, ...MOTS_CLES_AMBIGUS];
    const vus = new Set<string>();
    for (const m of tous) {
      expect(vus.has(m.terme)).toBe(false);
      vus.add(m.terme);
    }
    expect(MOTS_CLES_APPUI.filter((m) => core.has(m.terme))).toEqual([]);
    expect(MOTS_CLES_AMBIGUS.filter((m) => core.has(m.terme) || appui.has(m.terme))).toEqual(
      [],
    );
  });

  it("donne un poids positif à tous les termes", () => {
    for (const m of [...MOTS_CLES_CORE, ...MOTS_CLES_APPUI, ...MOTS_CLES_AMBIGUS]) {
      expect(m.poids).toBeGreaterThan(0);
      expect(m.terme.trim()).toBe(m.terme);
      expect(m.terme.length).toBeGreaterThan(2);
    }
  });
});

describe("veille-perteinence — normalisation", () => {
  it("supprime les accents et uniformise les apostrophes", () => {
    expect(normaliser("Procès-verbal de l'infraction à Éthylotest")).toBe(
      "proces-verbal de l'infraction a ethylotest",
    );
  });
});

describe("veille-perteinence — scoring", () => {
  it("ne trouve aucun terme qualifiant dans une publication hors sujet", () => {
    const p = scorerPertinence(source({ contenu: CONTENU_HORS_SUJET }));
    expect(p.matchsCore).toEqual([]);
    // Les termes d'appui contribuent au score mais ne qualifient jamais seuls.
    expect(estPertinente(p)).toBe(false);
  });

  it("reconnaît un texte réellement pertinent", () => {
    const p = scorerPertinence(source({ contenu: CONTENU_ALCOOL }));
    expect(p.matchsCore).toContain("code de la route");
    // « éthylotest » est ambigu : il appuie et pèse, mais ne qualifie pas seul.
    expect(p.matchsCore).not.toContain("éthylotest");
    expect(p.matchsAppui).toContain("éthylotest");
    expect(p.matchsAppui).toContain("vice de procédure");
    expect(p.score).toBeGreaterThanOrEqual(SEUIL_PERTINENCE);
  });

  it("distingue core et appui", () => {
    const p = scorerPertinence(source({ contenu: CONTENU_HORS_SUJET }));
    expect(p.matchsAppui.length).toBeGreaterThan(0);
    expect(p.matchsCore).toHaveLength(0);
  });

  it("compte les réoccurrences sans les multiplier indéfiniment", () => {
    const une = scorerPertinence(source({ contenu: "Code de la route. " + "x ".repeat(60) }));
    const dix = scorerPertinence(
      source({ contenu: "Code de la route. " + "code de la route ".repeat(40) }),
    );
    // le plafond de +2 par occurrence (3 max) borne l'effet de la répétition
    expect(dix.score).toBeLessThan(une.score + 40);
    expect(dix.score).toBeGreaterThan(une.score);
  });

  it("reconnaît les variantes orthographiques (accents, casse)", () => {
    const p = scorerPertinence(source({ contenu: "CODE DE LA ROUTE — ÉTHYLOTEST" }));
    expect(p.matchsCore).toContain("code de la route");
    expect(p.matchsAppui).toContain("éthylotest");
  });
});

describe("veille-perteinence — termes ambigus (régression réelle)", () => {
  /**
   * Régression issue d'une vraie publication JADE du 30/09/2026
   * (CAA de Douai, 25DA00480) qui remontait dans la veille alors qu'elle
   * relève du droit du travail : un contrôle d'alcoolémie consécutif à une
   * faute professionnelle, dans un litige de licenciement devant le CSE.
   * Aucun terme routier n'y figure. Elle ne doit plus être retenue.
   */
  const CONTENU_TRAVAIL = `La société Airbus Atlantic a demandé au tribunal administratif
d'Amiens d'annuler la décision de l'inspection du travail qui a rejeté sa demande
d'autorisation de licencier M. Le contrôle d'alcoolémie qu'il a subi a méconnu les
dispositions de l'article 11 du règlement intérieur dès lors que son comportement
ne laissait pas supposer une consommation d'alcool et que l'éthylotest utilisé
n'était pas fiable. L'emportement dont il a fait preuve est justifié par les
circonstances dans lesquelles le contrôle d'alcoolémie s'est déroulé après deux
heures d'attente et par l'attitude de la responsable des ressources humaines.
La notification de la décision a été adressée au salarié, qui en a demandé le
retrait devant le tribunal administratif.`;

  it("écarte une publication de droit du travail qui parle d'alcoolémie", () => {
    const p = scorerPertinence(
      source({
        titre: "CAA de DOUAI, 3ème chambre, 17/09/2026, 25DA00480",
        juridiction: "CAA de DOUAI",
        contenu: CONTENU_TRAVAIL,
      }),
    );
    // Les termes contextuels sont bien détectés…
    expect(p.matchsAppui).toContain("éthylotest");
    expect(p.matchsAppui).toContain("alcoolémie");
    expect(p.matchsAppui).toContain("notification");
    // …mais aucun terme qualifiant du domaine routier n'est présent.
    expect(p.matchsCore).toEqual([]);
    expect(estPertinente(p)).toBe(false);
  });

  it("ne laisse pas un terme ambigu atteindre le seuil seul", () => {
    const p = scorerPertinence(
      source({ titre: "", juridiction: "", contenu: CONTENU_TRAVAIL }),
    );
    // L'ancien calcul laissait « éthylotest + alcoolémie » frôler le seuil ;
    // il doit rester nettement en deçà, et surtout ne pas qualifier.
    expect(p.score).toBeLessThan(SEUIL_PERTINENCE);
  });

  it("retient en revanche un vrai contentieux d'ivresse au volant", () => {
    const p = scorerPertinence(
      source({
        titre: "CAA de Bordeaux, 2ème chambre, 12/09/2026, 24BX00123",
        juridiction: "CAA de BORDEAUX",
        contenu:
          "Le conducteur a fait l'objet d'un procès-verbal de constatation d'infraction " +
          "pour conduite sous l'emprise de l'alcool après un contrôle de l'agent " +
          "verbalisateur sur le code de la route. L'éthylotest a mesuré 0,94 g/l. " +
          "Le tribunal retient que le délai de contestation n'était pas respecté.",
      }),
    );
    expect(p.matchsCore).toContain("code de la route");
    expect(p.matchsCore).toContain("conduite sous l'emprise");
    expect(estPertinente(p)).toBe(true);
  });
});

describe("veille-perteinence — filtre de pertinence", () => {
  it("écarte la jurisprudence administrative générique (le vrai piège)", () => {
    // Regression : avant la séparation core/appui, ce texte passait le filtre
    // (notification + mise en demeure + prescription + TA dépassaient le seuil).
    const p = scorerPertinence(source({ contenu: CONTENU_HORS_SUJET }));
    expect(estPertinente(p)).toBe(false);
  });

  it("retient un texte sur le code de la route", () => {
    expect(estPertinente(scorerPertinence(source({ contenu: CONTENU_ALCOOL })))).toBe(
      true,
    );
  });

  it("écarte un texte qui n'a que des termes d'appui, même très haut", () => {
    const p = {
      score: 999,
      matchsCore: [] as string[],
      matchsAppui: ["contestation"] as string[],
      matchs: ["contestation"] as string[],
      citations: ["une phrase assez longue pour être retenue par le filtre"],
    };
    expect(estPertinente(p)).toBe(false);
  });

  it("écarte une publication pertinente en score mais sans passage citable", () => {
    const p = scorerPertinence(source({ contenu: "code de la route" }));
    expect(p.matchsCore.length).toBeGreaterThan(0);
    expect(estPertinente(p)).toBe(false);
  });
});

describe("veille-perteinence — citations verbatim", () => {
  it("ne renvoie que des fragments présents mot pour mot dans la source", () => {
    const citations = extraireCitations(CONTENU_ALCOOL, ["code de la route", "éthylotest"]);
    expect(citations.length).toBeGreaterThan(0);
    for (const c of citations) {
      expect(CONTENU_ALCOOL).toContain(c.replace(/…$/, ""));
    }
  });

  it("ignore les fragments trop courts pour être du contenu", () => {
    expect(extraireCitations("code de la route", ["code de la route"])).toEqual([]);
  });

  it("respecte la limite demandée", () => {
    const citations = extraireCitations(CONTENU_ALCOOL, ["le"], 2);
    expect(citations.length).toBeLessThanOrEqual(2);
  });

  it("tronque proprement les passages très longs", () => {
    const long = `${"a".repeat(600)} code de la route`;
    const [c] = extraireCitations(long, ["code de la route"], 1);
    expect(c!.length).toBeLessThanOrEqual(421);
    expect(c!.endsWith("…")).toBe(true);
  });

  it("renvoie une liste vide si aucun terme ne correspond", () => {
    expect(extraireCitations(CONTENU_ALCOOL, ["pêche à la ligne"])).toEqual([]);
  });
});

describe("veille-perteinence — brouillon de règle", () => {
  const s = source({ contenu: CONTENU_ALCOOL, titre: "CAA de Marseille, 18/09/2026, 25MA02143" });
  const p = scorerPertinence(s);
  const brouillon = redigerBrouillonRegle(s, p);

  it("reprend les métadonnées sourcées", () => {
    expect(brouillon).toContain("CAA de Marseille");
    expect(brouillon).toContain("ECLI:FR:CEORD:2026:519188.20260914");
    expect(brouillon).toContain("14/09/2026");
    expect(brouillon).toContain(s.url!);
  });

  it("cite les passages verbatim", () => {
    for (const c of p.citations) {
      expect(brouillon).toContain(c);
    }
  });

  it("laisse le champ d'articulation juridique VIDE (garde-fou)", () => {
    // Point critique : la machine ne doit jamais remplir la règle elle-même.
    expect(brouillon).toContain("**Règle dégagée — À RÉDIGER**");
    const apres = brouillon.split("**Règle dégagée — À RÉDIGER**")[1]!;
    const ligneOuverture = apres.split("\n").find((l) => l.trim().length > 0)!;
    expect(ligneOuverture.trim()).toMatch(/^\[À compléter\s*:/);
  });

  it("s'annonce comme brouillon automatique", () => {
    expect(brouillon).toContain("Brouillon automatique");
  });

  it("produit un résumé lisible pour l'UI et le digest", () => {
    const r = resumeSource(s, p);
    expect(r).toContain("14/09/2026");
    expect(r).toContain(p.citations[0]!);
  });
});
