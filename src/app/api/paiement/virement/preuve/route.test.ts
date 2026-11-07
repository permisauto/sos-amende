import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  storageWrite: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  consommerCreneau: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storageWrite, storageDelete } from "@/lib/storage";
import { consommerCreneau } from "@/lib/rate-limit";
import { POST } from "./route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  payment: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockStorageWrite = storageWrite as ReturnType<typeof vi.fn>;
const mockStorageDelete = storageDelete as ReturnType<typeof vi.fn>;
const mockConsommerCreneau = consommerCreneau as ReturnType<typeof vi.fn>;

function requete(form: FormData): Request {
  return new Request("http://localhost/api/paiement/virement/preuve", {
    method: "POST",
    headers: { "x-forwarded-for": "1.2.3.4" },
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConsommerCreneau.mockResolvedValue(30);
});

describe("POST /api/paiement/virement/preuve", () => {
  it("retourne 400 si la référence de paiement est absente", async () => {
    const form = new FormData();
    const res = await POST(requete(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Référence de paiement manquante.",
    });
  });

  it("retourne 400 si aucun fichier n'est fourni", async () => {
    const form = new FormData();
    form.append("paymentId", "pay-123");
    const res = await POST(requete(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Veuillez sélectionner une preuve.",
    });
  });

  it("retourne 400 si le format de fichier n'est pas supporté", async () => {
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.txt", { type: "text/plain" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Format non supporté (JPEG, PNG, WebP ou PDF).",
    });
  });

  it("retourne 400 si le fichier dépasse 8 Mo", async () => {
    const form = new FormData();
    form.append("paymentId", "pay-123");
    const gros = new File([new Uint8Array(9 * 1024 * 1024)], "big.pdf", {
      type: "application/pdf",
    });
    form.append("fichier", gros);
    const res = await POST(requete(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Fichier trop volumineux (maximum 8 Mo).",
    });
  });

  it("retourne 404 si le paiement n'existe pas", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Paiement introuvable." });
  });

  it("retourne 409 si le paiement n'est plus en attente de virement", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-123",
      userId: "user-1",
      status: "PAID",
      preuveUrl: null,
    });
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ce paiement n'est plus en attente de virement.",
    });
  });

  it("retourne 401 si aucune session n'est ouverte", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-123",
      userId: "user-1",
      status: "PENDING_VIREMENT",
      preuveUrl: null,
    });
    mockAuth.mockResolvedValue(null);
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Connexion requise pour envoyer une preuve de virement.",
    });
  });

  it("retourne 403 si le paiement appartient à un autre compte", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-123",
      userId: "autre-user",
      status: "PENDING_VIREMENT",
      preuveUrl: null,
    });
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Paiement non appartenant à votre compte.",
    });
  });

  it("téléverse la preuve pour le propriétaire du paiement", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-123",
      userId: "user-1",
      status: "PENDING_VIREMENT",
      preuveUrl: null,
    });
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockStorageWrite.mockResolvedValue("/uploads/preuves-virement/fichier.pdf");
    mockPrisma.payment.update.mockResolvedValue({});

    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, nom: "test.pdf" });
    expect(mockStorageWrite).toHaveBeenCalledTimes(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-123" },
      data: {
        preuveUrl: "/uploads/preuves-virement/fichier.pdf",
        preuveNom: "test.pdf",
        preuveUploadedAt: expect.any(Date),
      },
    });
  });

  it("supprime l'ancienne preuve si elle existe", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-123",
      userId: "user-1",
      status: "PENDING_VIREMENT",
      preuveUrl: "/uploads/preuves-virement/ancienne.pdf",
    });
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockStorageWrite.mockResolvedValue("/uploads/preuves-virement/nouvelle.pdf");
    mockStorageDelete.mockResolvedValue(undefined);
    mockPrisma.payment.update.mockResolvedValue({});

    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "nouvelle.pdf", { type: "application/pdf" }));
    await POST(requete(form));

    expect(mockStorageDelete).toHaveBeenCalledWith(
      "/uploads/preuves-virement/ancienne.pdf",
    );
  });

  it("retourne 429 quand le rate-limit est épuisé", async () => {
    mockConsommerCreneau.mockResolvedValue(0);
    const form = new FormData();
    form.append("paymentId", "pay-123");
    form.append("fichier", new File(["dummy"], "test.pdf", { type: "application/pdf" }));
    const res = await POST(requete(form));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Trop d'envois récents, réessayez dans quelques minutes.",
    });
  });
});
