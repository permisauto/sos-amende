import { describe, expect, it } from "vitest";
import { CATALOGUE_SOURCES, type FailleSourcee } from "./catalogue-sources";
import type { RegleDetection } from "./moteur";

const VARIABLES_AUTORISEES = [
  "{nom}",
  "{plaque}",
  "{num_pv}",
  "{date}",
  "{montant}",
  "{radarId}",
  "{lieu}",
  "{duree}",
  "{adresse}",
  "{prefecture}",
  "{motif}",
  "{conditions_meteo}",
];

function variablesDuTemplate(template: string): string[] {
  return Array.from(template.matchAll(/\{(\w+)\}/g), (m) => `{${m[1]}}`);
}

describe("catalogue-sources (garde-fou anti-hallucination)", () => {
  it.each(CATALOGUE_SOURCES.map((f) => [f.id, f] as const))(
    "%s : type, règles et template valides",
    (_id, faille: FailleSourcee) => {
      expect(["AMENDE", "SUSPENSION"]).toContain(faille.typeInfraction);
      expect(faille.titreFaille.length).toBeGreaterThan(10);
      expect(faille.reglesDetection.length).toBeGreaterThan(0);

      if (faille.aCompleter) {
        // Proposition incomplète : aucun fondement ni aucune jurisprudence
        // inventés — bloquée à l'activation tant que l'admin n'a pas sourcé
        // article et template.
        expect(faille.articleLoi).toBe("");
        expect(faille.templateLettre).toBe("");
        expect(faille.jurisprudence).toHaveLength(0);
        expect(faille.source).toContain("à sourcer");
      } else {
        expect(faille.articleLoi.length).toBeGreaterThan(3);
        expect(faille.templateLettre.length).toBeGreaterThan(50);

        const variables = variablesDuTemplate(faille.templateLettre);
        for (const v of variables) {
          expect(VARIABLES_AUTORISEES).toContain(v);
        }
      }
    },
  );

  it("les propositions incomplètes sont bien marquées et restent minoritaires", () => {
    const incompletes = CATALOGUE_SOURCES.filter((f) => f.aCompleter);
    expect(incompletes.length).toBeGreaterThanOrEqual(3);
    expect(incompletes.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "faille-stationnement-panneau",
        "faille-stationnement-travaux",
        "faille-stationnement-lieu",
      ]),
    );
    // Rien d'autre n'a le droit d'être vide.
    expect(incompletes.length).toBeLessThan(CATALOGUE_SOURCES.length);
  });

  it("chaque règle de détection est d'un type connu", () => {
    const types = new Set<RegleDetection["type"]>([
      "champAbsent",
      "datePrescrite",
      "plaqueIncorrecte",
      "etalonnageExpire",
      "texteContient",
      "texteAbsent",
    ]);
    for (const faille of CATALOGUE_SOURCES) {
      for (const regle of faille.reglesDetection as RegleDetection[]) {
        expect(types).toContain(regle.type);
        if (regle.type === "champAbsent") {
          expect(regle).toHaveProperty("champ");
        }
        if (
          regle.type === "texteContient" ||
          regle.type === "texteAbsent"
        ) {
          expect((regle as { motif: string }).motif).toBeTruthy();
        }
      }
    }
  });

  it("chaque jurisprudence citée porte une référence et un drapeau verifiee", () => {
    for (const faille of CATALOGUE_SOURCES) {
      for (const j of faille.jurisprudence) {
        expect(j.reference.length).toBeGreaterThan(10);
        expect(typeof j.verifiee).toBe("boolean");
      }
    }
  });

  it("les propositions SUSPENSION couvrent 3 motifs distincts", () => {
    const suspension = CATALOGUE_SOURCES.filter(
      (f) => f.typeInfraction === "SUSPENSION",
    );
    expect(suspension.length).toBeGreaterThanOrEqual(3);
    const ids = suspension.map((f) => f.id);
    expect(ids).toContain("faille-suspension-sans-contradictoire");
    expect(ids).toContain("faille-suspension-marge-erreur-ethylometre");
    expect(ids).toContain("faille-suspension-notification-irreguliere");
  });
});