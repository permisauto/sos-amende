import { describe, it, expect } from "vitest";
import {
  FAILLES_PACK_ACTIVES,
  activerPropositionsCompletes,
  estActivable,
  injecterFaillesPack,
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
    // Cas réel d'une proposition dont la rédaction reste à faire.
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

/**
 * Synchronisation manuelle de l'admin : « Synchroniser et activer » passe en
 * ACTIVE toutes les propositions complètes en un lot — et **seulement** elles.
 */
describe("activerPropositionsCompletes", () => {
  const COMPLETE = {
    id: "faille-complete",
    regle: "L'article impose la notification préalable.",
    templateLettre: "Je conteste pour absence de notification…",
  };
  const INCOMPLETE = {
    id: "faille-stationnement-panneau",
    regle: "Le panneau doit être perceptible.",
    templateLettre: "",
  };

  function fakeDep(proposees: Array<{ id: string; regle: string | null; templateLettre: string | null }>) {
    const updates: Array<{ where: unknown; data: unknown }> = [];
    const dep = {
      failleJuridique: {
        findMany: async () => proposees,
        updateMany: async (args: { where: unknown; data: unknown }) => {
          updates.push(args);
          return { count: 0 };
        },
      },
    };
    return { dep, updates };
  }

  it("active les propositions complètes et laisse les incomplètes", async () => {
    const { dep, updates } = fakeDep([COMPLETE, INCOMPLETE]);
    const bilan = await activerPropositionsCompletes(dep as never);

    expect(bilan.activees).toEqual(["faille-complete"]);
    expect(bilan.ignorees).toBe(1);
    expect(bilan.examinees).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toEqual({ statut: "ACTIVE" });
    expect(updates[0]?.where).toEqual({
      id: { in: ["faille-complete"] },
    });
  });

  it("n'écrit rien quand aucune proposition n'est complète", async () => {
    const { dep, updates } = fakeDep([INCOMPLETE]);
    const bilan = await activerPropositionsCompletes(dep as never);

    expect(bilan.activees).toEqual([]);
    expect(bilan.ignorees).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it("renvoie un bilan à zéro sans appel d'écriture sans proposition", async () => {
    const { dep, updates } = fakeDep([]);
    const bilan = await activerPropositionsCompletes(dep as never);

    expect(bilan).toEqual({ activees: [], ignorees: 0, examinees: 0 });
    expect(updates).toHaveLength(0);
  });
});

/**
 * Exception Pack 3F/48SI : les 4 failles validées produit sont injectées en
 * ACTIVE à chaque synchronisation du catalogue — et **seulement** elles.
 */
describe("injecterFaillesPack (injection pack 3F/48SI)", () => {
  const COMPLET = {
    regle: "La suspension d'urgence doit être prononcée dans les 72 heures.",
    templateLettre: "Je conteste la décision de suspension…",
  };

  function fakeDep(
    proposees: Array<{ id: string; regle: string | null; templateLettre: string | null }>,
  ) {
    const updates: Array<{ where: unknown; data: unknown }> = [];
    const dep = {
      failleJuridique: {
        findMany: async () => proposees,
        updateMany: async (args: { where: unknown; data: unknown }) => {
          updates.push(args);
          return { count: 0 };
        },
      },
    };
    return { dep, updates };
  }

  it("porte exactement les 4 ids validés (les 2 autres restent PROPOSEE)", () => {
    expect([...FAILLES_PACK_ACTIVES].sort()).toEqual([
      "faille-3f-defaut-motivation",
      "faille-3f-delai-retention",
      "faille-48si-defaut-info",
      "faille-48si-plafond-8pts",
    ]);
    expect(FAILLES_PACK_ACTIVES).not.toContain("faille-3f-incompetence");
    expect(FAILLES_PACK_ACTIVES).not.toContain(
      "faille-48si-stage-avant-notification",
    );
  });

  it("n'active que les ids du pack et garde le verrou statut PROPOSEE", async () => {
    const { dep, updates } = fakeDep([
      { id: "faille-3f-delai-retention", ...COMPLET },
      { id: "faille-suspension-sans-contradictoire", ...COMPLET },
    ]);
    const activees = await injecterFaillesPack(dep as never);

    expect(activees).toEqual(["faille-3f-delai-retention"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toEqual({ statut: "ACTIVE" });
    expect(updates[0]?.where).toEqual({
      id: { in: ["faille-3f-delai-retention"] },
      statut: "PROPOSEE",
    });
  });

  it("une faille pack incomplète n'est jamais injectée (même garde-fou)", async () => {
    const { dep, updates } = fakeDep([
      { id: "faille-48si-defaut-info", regle: "…", templateLettre: "   " },
    ]);
    const activees = await injecterFaillesPack(dep as never);

    expect(activees).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  it("rien à promouvoir → aucune écriture (idempotent)", async () => {
    const { dep, updates } = fakeDep([]);
    const activees = await injecterFaillesPack(dep as never);

    expect(activees).toEqual([]);
    expect(updates).toHaveLength(0);
  });
});
