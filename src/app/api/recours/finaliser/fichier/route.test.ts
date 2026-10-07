import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/lien-depot", () => ({
  verifierLienDepot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    preuve: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/storage", () => ({
  storageRead: vi.fn(),
}));

import { verifierLienDepot } from "@/lib/lien-depot";
import { prisma } from "@/lib/prisma";
import { storageRead } from "@/lib/storage";
import { GET } from "./route";

const dossierBase = {
  id: "dossier-1",
  type: "AMENDE",
  statut: "PRET",
  numRef: "PC123",
  plaque: "AB-123-CD",
  canal: "ANTAI",
  montant: 68,
  radar: false,
  nomClient: "Alex Martin",
  fichiers: {
    lettrePdf: "/uploads/lettre.pdf",
    pv: "/uploads/pv.png",
    preuves: [{ id: "p1", nom: "Carte grise", type: "CARTE_GRISE" }],
  },
};

function mockLien(overrides: Partial<typeof dossierBase> = {}) {
  (verifierLienDepot as ReturnType<typeof vi.fn>).mockResolvedValue({
    dossier: { ...dossierBase, ...overrides },
    expireLe: new Date(Date.now() + 60_000),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

function req(token: string, extra = ""): Request {
  return new Request(
    `http://localhost/api/recours/finaliser/fichier?token=${encodeURIComponent(token)}${extra}`,
  );
}

describe("GET /api/recours/finaliser/fichier", () => {
  it("refuse un lien invalide/expiré (403)", async () => {
    (verifierLienDepot as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req("mauvais-token"));
    expect(res.status).toBe(403);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("refuse un document inconnu (400)", async () => {
    mockLien();
    const res = await GET(req("token-ok", "&doc=autre"));
    expect(res.status).toBe(400);
  });

  it("sert la lettre signée en PDF avec les bons en-têtes", async () => {
    mockLien();
    (storageRead as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.from("PDF-BYTES"),
    );

    const res = await GET(req("token-ok", "&doc=lettre"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("lettre-contestation.pdf");
    expect(await res.text()).toBe("PDF-BYTES");
  });

  it("sert la copie du PV (nom adapté à SUSPENSION)", async () => {
    mockLien({ type: "SUSPENSION" });
    (storageRead as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.from("IMG"),
    );

    const res = await GET(req("token-ok", "&doc=pv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toContain("decision-suspension.png");
  });

  it("sert une preuve du dossier via preuveId, sans vérifier l'appartenance ailleurs que par dossierId", async () => {
    mockLien();
    (prisma.preuve.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "/uploads/carte-grise.png",
      nom: "Carte grise",
    });
    (storageRead as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("IMG"));

    const res = await GET(req("token-ok", "&doc=preuve&preuveId=p1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("Carte grise.png");
    const found = (prisma.preuve.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(found.where).toEqual({ id: "p1", dossierId: "dossier-1" });
  });

  it("404 si la preuve n'existe pas ou n'a pas de fichier stocké", async () => {
    mockLien();
    (prisma.preuve.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(req("token-ok", "&doc=preuve&preuveId=p2"));
    expect(res.status).toBe(404);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("404 si le fichier demandé n'est pas présent dans le dossier", async () => {
    mockLien({
      type: "AMENDE",
      fichiers: {
        lettrePdf: null,
        pv: null,
        preuves: [],
      } as unknown as typeof dossierBase.fichiers,
    });
    const res = await GET(req("token-ok", "&doc=lettre"));
    expect(res.status).toBe(404);
  });

  it("404 si le fichier stocké est illisible", async () => {
    mockLien();
    (storageRead as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(req("token-ok", "&doc=pv"));
    expect(res.status).toBe(404);
  });

  const fichiersPack = {
    lettrePdf: "/uploads/lettre.pdf",
    pv: "/uploads/pv.png",
    preuves: [],
    pack: {
      requete: "/uploads/pack-requete.pdf",
      refere: "/uploads/pack-refere.pdf",
      bordereau: "/uploads/pack-bordereau.pdf",
    },
  } as unknown as typeof dossierBase.fichiers;

  it("sert les 3 documents du pack Télérecours via le token du lien", async () => {
    mockLien({ type: "SUSPENSION", fichiers: fichiersPack });
    (storageRead as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.from("PDF-PACK"),
    );

    const resRef = await GET(req("token-ok", "&doc=refere"));
    expect(resRef.status).toBe(200);
    expect(resRef.headers.get("Content-Type")).toBe("application/pdf");
    expect(resRef.headers.get("Content-Disposition")).toContain(
      "refere-suspension-l521-2.pdf",
    );
    expect(
      (storageRead as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toBe("/uploads/pack-refere.pdf");

    const resBord = await GET(req("token-ok", "&doc=bordereau"));
    expect(resBord.status).toBe(200);
    expect(resBord.headers.get("Content-Disposition")).toContain(
      "bordereau-pieces.pdf",
    );

    const resReq = await GET(req("token-ok", "&doc=requete"));
    expect(resReq.status).toBe(200);
    expect(resReq.headers.get("Content-Disposition")).toContain(
      "requete-contestation.pdf",
    );
  });

  it("404 sur un document du pack non produit (référé absent)", async () => {
    mockLien({
      type: "SUSPENSION",
      fichiers: {
        ...fichiersPack,
        pack: { requete: "/uploads/pack-requete.pdf", refere: null, bordereau: null },
      } as unknown as typeof dossierBase.fichiers,
    });

    const res = await GET(req("token-ok", "&doc=refere"));
    expect(res.status).toBe(404);
    expect(storageRead).not.toHaveBeenCalled();
  });
});