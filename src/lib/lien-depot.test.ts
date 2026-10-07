import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lienDepot: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    dossier: { update: vi.fn() },
    dossierEvent: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock("./notifications", () => ({
  notifierLienDepot: vi.fn().mockResolvedValue(false),
  notifierStatut: vi.fn().mockResolvedValue(false),
}));

import { createHash } from "crypto";
import { prisma } from "./prisma";
import { notifierLienDepot, notifierStatut } from "./notifications";
import {
  LIEN_DEPOT_DUREE_JOURS,
  LIEN_DEPOT_PURGE_JOURS,
  activerDepotEnLigne,
  confirmerDepotSurPortail,
  creerLienDepot,
  dateSeuilPurgeLiens,
  hashToken,
  peutActiverDepotEnLigne,
  purgerLiensDepotExpires,
  verifierLienDepot,
} from "./lien-depot";

const MOCK_TOKEN = "token-24-octets-base64url";
const MOCK_HASH_CODE = createHash("sha256").update(MOCK_TOKEN).digest("hex");

const lienEnBase: {
  id: string;
  dossierId: string;
  tokenHash: string;
  canal: string;
  expireLe: Date;
  consommeLe: Date | null;
  createdAt: Date;
} = {
  id: "lien-1",
  dossierId: "dossier-1",
  tokenHash: MOCK_HASH_CODE,
  canal: "ANTAI",
  expireLe: new Date(Date.now() + 1000 * 60 * 60),
  consommeLe: null,
  createdAt: new Date(),
};

function mockFindUnique(overrides: Partial<typeof lienEnBase> = {}) {
  (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
    { ...lienEnBase, ...overrides },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

describe("peutActiverDepotEnLigne", () => {
  it("limite aux canaux en ligne (jamais LRAR)", () => {
    expect(peutActiverDepotEnLigne("ANTAI")).toBe(true);
    expect(peutActiverDepotEnLigne("TELERECOURS")).toBe(true);
    expect(peutActiverDepotEnLigne("LRAR")).toBe(false);
    expect(peutActiverDepotEnLigne(null)).toBe(false);
  });
});

describe("hashToken", () => {
  it("produit un sha256 hexa déterministe de longueur 64", () => {
    expect(hashToken("token-24-octets-base64url")).toBe(MOCK_HASH_CODE);
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("creerLienDepot", () => {
  it("upsert : hash en base, token clair retourné, expiration 7 j", async () => {
    (prisma.lienDepot.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "lien-1",
      dossierId: "dossier-1",
    });

    const lien = await creerLienDepot({ dossierId: "dossier-1", canal: "ANTAI" });

    expect(lien.token).toBeTruthy();
    expect(lien.url).toBe(
      `https://app.test/recours/finaliser?token=${encodeURIComponent(lien.token)}`,
    );
    const dureeMs = lien.expireLe.getTime() - Date.now();
    expect(dureeMs).toBeGreaterThan(LIEN_DEPOT_DUREE_JOURS * 24 * 60 * 60 * 1000 - 5000);
    expect(dureeMs).toBeLessThanOrEqual(LIEN_DEPOT_DUREE_JOURS * 24 * 60 * 60 * 1000);

    const [opts] = (prisma.lienDepot.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    // Le token est stocké HACHÉ — jamais en clair en base.
    expect(opts.create.tokenHash).toBe(hashToken(lien.token));
    expect(opts.create.tokenHash).not.toBe(lien.token);
    expect(opts.create.canal).toBe("ANTAI");
    expect(opts.update.consommeLe).toBeNull();
  });
});

describe("verifierLienDepot", () => {
  it("retourne null si le lien n'existe pas", async () => {
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await verifierLienDepot("nimporte")).toBeNull();
  });

  it("retourne null si le lien est consommé", async () => {
    mockFindUnique({ consommeLe: new Date() });
    expect(await verifierLienDepot(MOCK_TOKEN)).toBeNull();
  });

  it("retourne null si le lien est expiré", async () => {
    mockFindUnique({ expireLe: new Date(Date.now() - 1000) });
    expect(await verifierLienDepot(MOCK_TOKEN)).toBeNull();
  });

  it("extrait numéro, plaque, montant et indicateur radar (extractedData)", async () => {
    mockFindUnique();
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: {
        id: "dossier-1",
        type: "AMENDE",
        statut: "PRET",
        extractedData: {
          num_pv: "PC12345678",
          plaque: "AB-123-CD",
          montant: "68",
          radarId: "R165",
        },
        user: { name: "Alex Martin" },
      },
    });

    const res = await verifierLienDepot(MOCK_TOKEN);
    expect(res).not.toBeNull();
    expect(res?.dossier.numRef).toBe("PC12345678");
    expect(res?.dossier.plaque).toBe("AB-123-CD");
    expect(res?.dossier.montant).toBe(68);
    expect(res?.dossier.radar).toBe(true);
  });

  it("expose le statut réel (page adaptative : PRET, en attente, transmis)", async () => {
    mockFindUnique();
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: {
        id: "dossier-1",
        type: "SUSPENSION",
        statut: "EN_ATTENTE_PRE_SIGNATURE",
        extractedData: { num_telepaiement: "S123" },
        user: { name: "Marie" },
      },
    });

    const res = await verifierLienDepot(MOCK_TOKEN);
    expect(res?.dossier.statut).toBe("EN_ATTENTE_PRE_SIGNATURE");
  });

  it("expose les fichiers téléchargeables : lettre signée, PV et preuves (courtiers triés, URL vides exclues)", async () => {
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: {
        id: "dossier-1",
        type: "AMENDE",
        statut: "PRET",
        pvUrl: "/uploads/pv.png",
        extractedData: { num_pv: "PC123" },
        user: { name: "Alex" },
        courriers: [
          {
            id: "c1",
            dossierId: "dossier-1",
            pdfUrl: "/uploads/lettre-avant.png",
            signatureUrl: null,
            preuveDepotUrl: null,
            createdAt: new Date(Date.now() - 10 * 60 * 1000),
          },
          {
            id: "c2",
            dossierId: "dossier-1",
            pdfUrl: "/uploads/lettre-soumise.pdf",
            signatureUrl: "/uploads/sig.png",
            preuveDepotUrl: null,
            createdAt: new Date(),
          },
        ],
        preuves: [
          { id: "p1", dossierId: "dossier-1", url: "/uploads/carte-grise.png", nom: "Carte grise", type: "CARTE_GRISE", createdAt: new Date() },
          { id: "p2", dossierId: "dossier-1", url: "", nom: "Météo", type: "METEO", createdAt: new Date() },
        ],
      },
    });

    const res = await verifierLienDepot(MOCK_TOKEN);
    expect(res?.dossier.fichiers.lettrePdf).toBe("/uploads/lettre-soumise.pdf");
    expect(res?.dossier.fichiers.pv).toBe("/uploads/pv.png");
    expect(res?.dossier.fichiers.preuves).toEqual([
      { id: "p1", nom: "Carte grise", type: "CARTE_GRISE" },
    ]);
    // Aucun pack sur ce dossier : les 3 champs restent nuls (jamais fabriqués).
    expect(res?.dossier.fichiers.pack).toEqual({
      requete: null,
      refere: null,
      bordereau: null,
    });
  });

  it("expose le pack Télérecours depuis le dernier courrier qui en porte", async () => {
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: {
        id: "dossier-1",
        type: "SUSPENSION",
        statut: "PRET",
        pvUrl: "/uploads/pv.png",
        extractedData: { num_pv: "D123" },
        user: { name: "Marie" },
        courriers: [
          {
            id: "c1",
            dossierId: "dossier-1",
            pdfUrl: "/uploads/lettre-signee.pdf",
            signatureUrl: "/uploads/sig.png",
            preuveDepotUrl: null,
            packUrls: {
              requete: "/uploads/pack-requete.pdf",
              refere: "/uploads/pack-refere.pdf",
              bordereau: "/uploads/pack-bordereau.pdf",
            },
            createdAt: new Date(Date.now() - 60_000),
          },
          {
            id: "c2",
            dossierId: "dossier-1",
            pdfUrl: "/uploads/lettre-plus-recente.pdf",
            signatureUrl: null,
            preuveDepotUrl: null,
            packUrls: null,
            createdAt: new Date(),
          },
        ],
        preuves: [],
      },
    });

    const res = await verifierLienDepot(MOCK_TOKEN);
    expect(res?.dossier.fichiers.pack).toEqual({
      requete: "/uploads/pack-requete.pdf",
      refere: "/uploads/pack-refere.pdf",
      bordereau: "/uploads/pack-bordereau.pdf",
    });
    // La lettre reste celle du courrier le plus récent.
    expect(res?.dossier.fichiers.lettrePdf).toBe("/uploads/lettre-plus-recente.pdf");
  });

  it("ne renvoie aucune preuve quand aucune n'a de fichier stocké", async () => {
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: {
        id: "dossier-1",
        type: "AMENDE",
        statut: "PRET",
        extractedData: {},
        user: { name: "Alex" },
        preuves: [
          { id: "p2", dossierId: "dossier-1", url: "", nom: "Météo", type: "METEO", createdAt: new Date() },
        ],
      },
    });

    const res = await verifierLienDepot(MOCK_TOKEN);
    expect(res?.dossier.fichiers.preuves).toEqual([]);
    expect(res?.dossier.fichiers.lettrePdf).toBeNull();
    expect(res?.dossier.fichiers.pv).toBeNull();
  });
});

describe("confirmerDepotSurPortail", () => {
  it("marque ENVOYE + événement + consomme le lien quand le dossier est PRET", async () => {
    mockFindUnique();
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: { id: "dossier-1", statut: "PRET" },
    });

    const res = await confirmerDepotSurPortail(MOCK_TOKEN);
    expect(res.ok).toBe(true);

    expect(prisma.dossier.update).toHaveBeenCalledWith({
      where: { id: "dossier-1" },
      data: {
        statut: "ENVOYE",
        decisionAttendueLe: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(prisma.dossierEvent.create).toHaveBeenCalledWith({
      data: {
        dossierId: "dossier-1",
        type: "ENVOI",
        detail: expect.stringContaining("lien assisté"),
      },
    });
    expect(prisma.lienDepot.update).toHaveBeenCalledWith({
      where: { id: "lien-1" },
      data: { consommeLe: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifierStatut).toHaveBeenCalledWith("dossier-1");
  });

  it("refuse si le dossier n'est pas PRET", async () => {
    mockFindUnique();
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: { id: "dossier-1", statut: "EN_ATTENTE_PRE_SIGNATURE" },
    });

    const res = await confirmerDepotSurPortail(MOCK_TOKEN);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("pas encore prête");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse si déjà transmis (ENVOYE)", async () => {
    mockFindUnique();
    (prisma.lienDepot.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...lienEnBase,
      dossier: { id: "dossier-1", statut: "ENVOYE" },
    });

    const res = await confirmerDepotSurPortail(MOCK_TOKEN);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("déjà été transmise");
  });

  it("refuse un lien expiré sans toucher au dossier", async () => {
    mockFindUnique({ expireLe: new Date(Date.now() - 1000) });
    const res = await confirmerDepotSurPortail(MOCK_TOKEN);
    expect(res.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("activerDepotEnLigne", () => {
  it("crée le lien puis notifie le client (défensif : sans clé, le lien reste créé)", async () => {
    (prisma.lienDepot.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "lien-1",
    });

    const res = await activerDepotEnLigne({ dossierId: "dossier-1", canal: "TELERECOURS" });

    expect(prisma.lienDepot.upsert).toHaveBeenCalled();
    expect(notifierLienDepot).toHaveBeenCalledTimes(1);
    const [opts] = (notifierLienDepot as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.dossierId).toBe("dossier-1");
    expect(opts.url).toContain("/recours/finaliser?token=");
    expect(res?.url).toContain("/recours/finaliser?token=");
  });
});

describe("purge RGPD des liens expirés", () => {
  it("dateSeuilPurgeLiens recule de LIEN_DEPOT_PURGE_JOURS (30 j)", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const seuil = dateSeuilPurgeLiens(now);
    expect(LIEN_DEPOT_PURGE_JOURS).toBe(30);
    expect(seuil.toISOString()).toBe("2026-09-05T12:00:00.000Z");
  });

  it("purgerLiensDepotExpires supprime les liens expirés avant le seuil et retourne le compte", async () => {
    (prisma.lienDepot.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });

    const now = new Date("2026-10-05T12:00:00Z");
    const nb = await purgerLiensDepotExpires(now);

    expect(nb).toBe(3);
    expect(prisma.lienDepot.deleteMany).toHaveBeenCalledWith({
      where: { expireLe: { lt: dateSeuilPurgeLiens(now) } },
    });
  });
});