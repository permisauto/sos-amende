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
  // Référé-suspension du pack 3F/48SI (urgence art. L. 521-2 CJA) — effacées
  // par nettoyerLettre si le client n'a rien saisi.
  "{metier}",
  "{entreprise}",
  "{risque_licenciement}",
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

  it("aucune entrée du catalogue n'est bloquée à l'activation", () => {
    // Depuis le 2026-10-03, les 3 propositions de stationnement sont sourcées
    // (articles empruntés aux failles voisines) et lettrées : plus rien n'est
    // marqué `aCompleter` dans le catalogue, donc « Synchroniser et activer »
    // peut tout passer en ACTIVE. Les promotions de veille restent vides —
    // mais elles ne figurent pas dans CATALOGUE_SOURCES.
    const incompletes = CATALOGUE_SOURCES.filter((f) => f.aCompleter);
    expect(incompletes).toEqual([]);

    // Et les trois propositions de stationnement sont bien complètes :
    for (const id of [
      "faille-stationnement-panneau",
      "faille-stationnement-travaux",
      "faille-stationnement-lieu",
    ]) {
      const f = CATALOGUE_SOURCES.find((e) => e.id === id);
      expect(f, id).toBeDefined();
      if (!f) continue;
      expect(f.articleLoi.length).toBeGreaterThan(3);
      expect(f.templateLettre.length).toBeGreaterThan(50);
      expect(f.regle.length).toBeGreaterThan(20);
      expect(f.jurisprudence).toHaveLength(0);
    }
  });

  it("chaque règle de détection est d'un type connu", () => {
    const types = new Set<RegleDetection["type"]>([
      "champAbsent",
      "datePrescrite",
      "plaqueIncorrecte",
      "etalonnageExpire",
      "texteContient",
      "texteAbsent",
      // Pack 3F/48SI (types additifs)
      "delaiDepasse",
      "datePrealable",
      "valeurSuperieure",
      "et",
      // Chantier 1 (2026-10-10) : marges arithmétiques
      "margeTechniqueVitesse",
      "margeEthylometre",
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
        if (regle.type === "delaiDepasse") {
          expect(regle.limiteHeures).toBeGreaterThan(0);
          expect(regle.limiteHeures).toBeLessThanOrEqual(168);
        }
        if (regle.type === "valeurSuperieure") {
          expect(regle.seuil).toBeGreaterThan(0);
        }
        if (regle.type === "et") {
          expect(regle.regles.length).toBeGreaterThan(0);
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

  it("pack 3F/48SI : 6 failles complètes, modèle de référé L. 521-2, aucun L. 521-1", () => {
    const pack = CATALOGUE_SOURCES.filter(
      (f) => f.id.startsWith("faille-3f-") || f.id.startsWith("faille-48si-"),
    );
    expect(pack.map((f) => f.id).sort()).toEqual([
      "faille-3f-defaut-motivation",
      "faille-3f-delai-retention",
      "faille-3f-incompetence",
      "faille-48si-defaut-info",
      "faille-48si-plafond-8pts",
      "faille-48si-stage-avant-notification",
    ]);
    for (const f of pack) {
      expect(f.typeInfraction).toBe("SUSPENSION");
      expect(f.templateRefere).toContain("L. 521-2");
      expect(f.templateLettre.length).toBeGreaterThan(50);
      expect(f.reglesDetection.length).toBeGreaterThan(0);
      // Chaque règle de pack est cloisonnée par docType (3F ≠ 48SI)
      for (const regle of f.reglesDetection as RegleDetection[]) {
        expect(regle).toHaveProperty("docType");
      }
    }
    // Le référé-suspension relève de l'article L. 521-2 CJA — plus aucune
    // occurrence de l'ancienne (fausse) référence L. 521-1 (référé-liberté).
    const tout = JSON.stringify(CATALOGUE_SOURCES);
    expect(tout).not.toContain("L. 521-1");
    expect(tout).not.toContain("L.521-1");
  });
});