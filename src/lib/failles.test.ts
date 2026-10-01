import { describe, it, expect } from "vitest";
import {
  estActivable,
  manquantsPourActivation,
  messageActivationBloquee,
} from "@/lib/failles";

/**
 * Le garde-fou d'activation protège le moteur ET les lettres : une faille
 * ACTIVE sans règle dégagée ni template produirait une lettre vide.
 */
describe("failles — activation", () => {
  const COMPLETE = {
    regle: "L'article L. 224-16 impose la notification de l'avis de contravention.",
    templateLettre: "Madame {nom}, votre avis de contravention n'a pas été notifié…",
  };

  it("accepte une faille complète", () => {
    expect(manquantsPourActivation(COMPLETE)).toEqual([]);
    expect(estActivable(COMPLETE)).toBe(true);
    expect(messageActivationBloquee(COMPLETE)).toBeNull();
  });

  it("refuse une proposition de veille (règle et template vides)", () => {
    // Cas réel produit par `promouvoirSource` : seuls titre/source sont repris.
    const veille = { regle: null, templateLettre: "" };
    expect(manquantsPourActivation(veille)).toEqual(["regle", "templateLettre"]);
    expect(estActivable(veille)).toBe(false);
    expect(messageActivationBloquee(veille)).toMatch(/règle dégagée et template/i);
  });

  it("refuse une règle manquante alors que le template existe", () => {
    const f = { regle: null, templateLettre: COMPLETE.templateLettre };
    expect(manquantsPourActivation(f)).toEqual(["regle"]);
    expect(messageActivationBloquee(f)).toMatch(/règle/i);
    expect(messageActivationBloquee(f)).not.toMatch(/template de lettre absent/i);
  });

  it("refuse un template manquant alors que la règle existe", () => {
    const f = { regle: COMPLETE.regle, templateLettre: "   " };
    expect(manquantsPourActivation(f)).toEqual(["templateLettre"]);
    expect(messageActivationBloquee(f)).toMatch(/template de lettre absent/i);
  });

  it("traite les espaces seuls comme un champ vide", () => {
    expect(manquantsPourActivation({ regle: "   ", templateLettre: "\n\t" })).toEqual([
      "regle",
      "templateLettre",
    ]);
  });

  it("ne signale que les champs réellement vides", () => {
    const f = { regle: "règle complète", templateLettre: "lettre complète" };
    expect(estActivable(f)).toBe(true);
  });
});
