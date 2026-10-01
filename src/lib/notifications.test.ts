import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Notifications : le contrat important est le comportement « défensif » —
 * sans AUTH_RESEND_KEY aucun e-mail n'est envoyé et la fonction renvoie false
 * sans lever d'erreur (les transitions de dossier ne doivent jamais planter).
 */
type DossierRow = {
  id: string;
  statut: string;
  extractedData: unknown;
  lettreGeneree: string | null;
  motifRejet: string | null;
  decisionOmp: string | null;
  decisionDetail: string | null;
  prix: unknown;
  type: "AMENDE" | "SUSPENSION";
  user: { email: string; name: string | null };
};

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { dossier: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const send = vi.fn().mockResolvedValue({ id: "msg-1" });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => send(...a) };
  },
}));

const dossierBase: DossierRow = {
  id: "dossier-1",
  statut: "EN_ATTENTE_PAIEMENT",
  extractedData: { num_pv: "1234567" },
  lettreGeneree: "Lettre…",
  motifRejet: null,
  decisionOmp: null,
  decisionDetail: null,
  prix: 39,
  type: "AMENDE",
  user: { email: "client@test.local", name: "Alex Martin" },
};

/** Recharge le module avec un environnement Resend donné (avant import). */
async function charger(env: { key?: string; from?: string }) {
  vi.resetModules();
  if (env.key === undefined) delete process.env.AUTH_RESEND_KEY;
  else process.env.AUTH_RESEND_KEY = env.key;
  if (env.from === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = env.from;
  return import("./notifications");
}

beforeEach(() => {
  findUnique.mockReset();
  send.mockClear();
  send.mockResolvedValue({ id: "msg-1" });
});

afterEach(() => {
  delete process.env.AUTH_RESEND_KEY;
  delete process.env.EMAIL_FROM;
});

describe("notifierStatut — sans AUTH_RESEND_KEY", () => {
  it("renvoie false sans toucher la base ni le réseau", async () => {
    const { notifierStatut } = await charger({ key: undefined });
    expect(await notifierStatut("dossier-1")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("notifierStatut — avec AUTH_RESEND_KEY", () => {
  it("envoie l'e-mail de paiement au client", async () => {
    const { notifierStatut } = await charger({ key: "re_test", from: "test@example.org" });
    findUnique.mockResolvedValue(dossierBase);

    expect(await notifierStatut("dossier-1")).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe("client@test.local");
    expect(arg.subject).toContain("paiement");
    expect(arg.html).toContain("Alex Martin");
    expect(arg.html).toContain("PV n° 1234567");
  });

  it("repli sur le tarif de base du type quand dossier.prix est vide", async () => {
    const { notifierStatut } = await charger({ key: "re_test" });
    findUnique.mockResolvedValue({ ...dossierBase, prix: null, type: "SUSPENSION" });

    expect(await notifierStatut("dossier-1")).toBe(true);
    const arg = send.mock.calls[0][0] as { html: string };
    expect(arg.html).toContain("59");
  });

  it("renvoie false si le dossier n'existe pas", async () => {
    const { notifierStatut } = await charger({ key: "re_test" });
    findUnique.mockResolvedValue(null);

    expect(await notifierStatut("inconnu")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("n'envoie rien pour un statut sans e-mail associé", async () => {
    const { notifierStatut } = await charger({ key: "re_test" });
    findUnique.mockResolvedValue({ ...dossierBase, statut: "BROUILLON" });

    expect(await notifierStatut("dossier-1")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("notifierLienDepot", () => {
  it("renvoie false sans clé Resend", async () => {
    const { notifierLienDepot } = await charger({ key: undefined });
    expect(
      await notifierLienDepot({
        dossierId: "dossier-1",
        url: "http://localhost/recours/finaliser?token=x",
        expireLe: new Date("2026-12-31"),
      }),
    ).toBe(false);
  });

  it("envoie le lien de dépôt avec le bon destinataire", async () => {
    const { notifierLienDepot } = await charger({ key: "re_test" });
    findUnique.mockResolvedValue({
      type: "AMENDE",
      canalEnvoi: "ANTAI",
      extractedData: { num_pv: "7654321" },
      user: { email: "client@test.local", name: "Alex Martin" },
    });

    expect(
      await notifierLienDepot({
        dossierId: "dossier-1",
        url: "http://localhost/recours/finaliser?token=secret",
        expireLe: new Date("2026-12-31"),
      }),
    ).toBe(true);
    const arg = send.mock.calls[0][0] as { html: string };
    expect(arg.html).toContain("token=secret");
  });
});
