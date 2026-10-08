import { describe, expect, it } from "vitest";
import { extraireDispositif } from "./veille-texte";

const TA_SPACE = `TRIBUNAL ADMINISTRATIF

Vu la requête...

Considérant ce qui suit...

O R D O N N E :
Article 1er : La requête est rejetée.

Délibéré après l'audience publique du 1er septembre 2026.

N° 25DA00862`;

describe("extraireDispositif", () => {
  it("extrait un dispositif à marqueur espacé (typographie TA)", () => {
    const dispo = extraireDispositif(TA_SPACE);
    expect(dispo).not.toBeNull();
    expect(dispo!).toContain("O R D O N N E :");
    expect(dispo!).toContain("Article 1er : La requête est rejetée.");
    expect(dispo!).not.toContain("Délibéré");
    expect(dispo!).not.toContain("Vu la requête");
  });

  it("extrait un dispositif DÉCIDE: sans espacement", () => {
    const texte = `Vu le code de la route.\n\nDÉCIDE :\nArticle 1er : Le permis est suspendu.\n\nDélibéré après l'audience.`;
    const dispo = extraireDispositif(texte);
    expect(dispo).toContain("DÉCIDE :");
    expect(dispo).toContain("Article 1er : Le permis est suspendu.");
    expect(dispo).not.toContain("Délibéré");
  });

  it("coupe à la formule d'exécution La République mande et ordonne", () => {
    const texte = `ORDONNE :\nArticle 1er : La décision est annulée.\n\nLa République mande et ordonne au ministre...`;
    const dispo = extraireDispositif(texte);
    expect(dispo).toContain("ORDONNE :");
    expect(dispo).not.toContain("mande et ordonne");
  });

  it("retourne null sans marqueur fiable", () => {
    expect(extraireDispositif("Un texte sans aucun dispositif.")).toBeNull();
    expect(extraireDispositif("")).toBeNull();
    expect(
      extraireDispositif("DÉCIDE :\ntrop court"),
    ).toBeNull();
  });

  it("retient le premier marqueur quand plusieurs existent", () => {
    const texte = `ARRÊTE :\nArticle 1er : premier dispositif.\n\nDÉCIDE :\nArticle 1er : second.\n\nDélibéré après l'audience.`;
    const dispo = extraireDispositif(texte);
    expect(dispo).toContain("ARRÊTE :");
    expect(dispo).not.toContain("DÉCIDE");
  });
});
