import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossier: { findMany: vi.fn() },
    rappel: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  RAPPEL_TYPES,
  rappelDue,
  relancePreuvesDue,
  dateSeuilRelancePreuves,
  chercherRappelsPreuves,
  RAPPEL_TYPE_PREUVES,
} from "./rappels";

/** Date limite placée dans `jours` jours (positif = recours encore ouvert). */
function limiteDans(jours: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d;
}

describe("rappelDue", () => {
  it("J10 : dû entre 4 et 10 jours restants", () => {
    expect(rappelDue(limiteDans(10), "J10")).toBe(true);
    expect(rappelDue(limiteDans(7), "J10")).toBe(true);
    expect(rappelDue(limiteDans(4), "J10")).toBe(true);
  });

  it("J10 : pas dû au-delà de 10 jours ni à 3 jours ou moins", () => {
    expect(rappelDue(limiteDans(11), "J10")).toBe(false);
    expect(rappelDue(limiteDans(30), "J10")).toBe(false);
    expect(rappelDue(limiteDans(3), "J10")).toBe(false);
  });

  it("J3 : dû entre 1 et 3 jours restants", () => {
    expect(rappelDue(limiteDans(3), "J3")).toBe(true);
    expect(rappelDue(limiteDans(1), "J3")).toBe(true);
  });

  it("J3 : pas dû au-delà de 3 jours ni une fois échu", () => {
    expect(rappelDue(limiteDans(4), "J3")).toBe(false);
    expect(rappelDue(limiteDans(-1), "J3")).toBe(false);
  });

  it("J0 : dû uniquement une fois le délai dépassé", () => {
    expect(rappelDue(limiteDans(0), "J0")).toBe(true);
    expect(rappelDue(limiteDans(-5), "J0")).toBe(true);
    expect(rappelDue(limiteDans(5), "J0")).toBe(false);
  });

  it("les fenêtres J10/J3/J0 ne se chevauchent pas", () => {
    for (const jours of [-1, 0, 1, 3, 4, 10, 11, 45]) {
      const dus = RAPPEL_TYPES.filter((t) => rappelDue(limiteDans(jours), t));
      expect(dus.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("relancePreuvesDue", () => {
  it("due dès qu'une pièce manque et que le dossier est en cours", () => {
    expect(relancePreuvesDue(1, "A_VERIFIER")).toBe(true);
    expect(relancePreuvesDue(2, "EN_ANALYSE")).toBe(true);
    expect(relancePreuvesDue(1, "PRET")).toBe(true);
  });

  it("pas due sans pièce manquante", () => {
    expect(relancePreuvesDue(0, "A_VERIFIER")).toBe(false);
  });

  it("jamais sur un dossier déposé ou clôturé", () => {
    for (const statut of [
      "BROUILLON",
      "ENVOYE",
      "REJETE",
      "ERREUR_TECHNIQUE",
      "RESOLU",
      "ANNULE",
    ]) {
      expect(relancePreuvesDue(1, statut)).toBe(false);
    }
  });
});

describe("dateSeuilRelancePreuves (démarrage progressif)", () => {
  it("défaut : date de mise en service de la relance", () => {
    const attendu = new Date("2026-10-03T00:00:00.000Z");
    expect(dateSeuilRelancePreuves(undefined)).toEqual(attendu);
    expect(dateSeuilRelancePreuves("")).toEqual(attendu);
    expect(dateSeuilRelancePreuves("pas-une-date")).toEqual(attendu);
  });

  it("RAPPEL_PREUVES_DEPUIS étend ou restreint le périmètre", () => {
    expect(dateSeuilRelancePreuves("2020-01-01")).toEqual(
      new Date("2020-01-01T00:00:00.000Z"),
    );
    expect(dateSeuilRelancePreuves(" 2026-11-01 ")).toEqual(
      new Date("2026-11-01T00:00:00.000Z"),
    );
  });
});

describe("chercherRappelsPreuves", () => {
  function dossierAvec(extra: Record<string, unknown>) {
    return {
      id: "dos-1",
      statut: "A_VERIFIER",
      extractedData: { paiementDejaFait: true },
      rappels: [],
      user: { email: "client@test.local", name: "Client" },
      preuves: [],
      ...extra,
    };
  }

  it("relance une fois quand une pièce suggérée manque (dédup via PREUVES)", async () => {
    vi.mocked(prisma.dossier.findMany).mockResolvedValue([
      dossierAvec({}),
      dossierAvec({ id: "dos-2", rappels: [{ type: RAPPEL_TYPE_PREUVES }] }),
      dossierAvec({ id: "dos-3", extractedData: {} }),
      dossierAvec({ id: "dos-4", preuves: [{ type: "RELEVE_PAIEMENT" }] }),
    ] as never);
    vi.mocked(prisma.rappel.create).mockClear();

    const resultats = await chercherRappelsPreuves();

    expect(resultats).toHaveLength(1);
    expect(resultats[0]).toMatchObject({
      dossierId: "dos-1",
      libelles: ["Relevé de paiement"],
    });
    expect(prisma.rappel.create).toHaveBeenCalledTimes(1);
    expect(prisma.rappel.create).toHaveBeenCalledWith({
      data: { dossierId: "dos-1", type: RAPPEL_TYPE_PREUVES },
    });
  });

  it("ignore les dossiers déjà relancés, sans pièce manquante ou déposés", async () => {
    vi.mocked(prisma.dossier.findMany).mockResolvedValue([
      dossierAvec({ id: "dos-5", statut: "ENVOYE" }),
      dossierAvec({ id: "dos-6", extractedData: {} }),
      dossierAvec({ id: "dos-7", rappels: [{ type: RAPPEL_TYPE_PREUVES }] }),
    ] as never);
    vi.mocked(prisma.rappel.create).mockClear();

    expect(await chercherRappelsPreuves()).toHaveLength(0);
    expect(prisma.rappel.create).not.toHaveBeenCalled();
  });
});
