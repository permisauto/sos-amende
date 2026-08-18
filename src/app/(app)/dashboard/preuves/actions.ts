"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireJuriste } from "@/lib/dal";
import { storageWrite } from "@/lib/storage";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo
const TYPES = ["CARTE_GRISE", "PLAINTE", "PHOTO", "CERTIFICAT", "AUTRE"] as const;

export type PreuveState = { error?: string; ok?: boolean } | undefined;

/**
 * Ajout d'une pièce justificative (preuve) à un dossier — par le client
 * propriétaire ou par un juriste. La pièce est stockée via storageWrite et
 * apparaît sur les détails client et juriste.
 */
export async function ajouterPreuve(
  _prev: PreuveState,
  formData: FormData,
): Promise<PreuveState> {
  const dossierId = String(formData.get("dossierId") ?? "");
  const file = formData.get("fichier");
  const nom = String(formData.get("nom") ?? "").trim().slice(0, 120);
  const typeRaw = String(formData.get("type") ?? "AUTRE");
  const type = TYPES.find((t) => t === typeRaw) ?? "AUTRE";

  // Accès : client propriétaire du dossier OU juriste (JURISTE/ADMIN).
  let auteurId: string | null = null;
  const user = await requireUser().catch(() => null);
  if (user) {
    const dossier = await prisma.dossier.findFirst({
      where: { id: dossierId, userId: user.id },
    });
    if (!dossier) return { error: "Dossier introuvable." };
    auteurId = user.id;
  } else {
    const juriste = await requireJuriste().catch(() => null);
    if (!juriste) return { error: "Accès refusé." };
    const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
    if (!dossier) return { error: "Dossier introuvable." };
    auteurId = juriste.id;
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Veuillez sélectionner une pièce." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Format non supporté (JPEG, PNG, WebP ou PDF)." };
  }
  if (file.size > MAX_SIZE) {
    return { error: "Fichier trop volumineux (maximum 8 Mo)." };
  }

  const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const safeName = `preuves/${dossierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await storageWrite(safeName, buffer);

  await prisma.$transaction([
    prisma.preuve.create({
      data: { dossierId, userId: auteurId, url, nom: nom || file.name, type },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId,
        type: "PREUVE",
        detail: `Pièce ajoutée : ${nom || file.name}`,
      },
    }),
  ]);

  revalidatePath(`/dashboard/cases/${dossierId}`);
  revalidatePath(`/dashboard/juriste/${dossierId}`);
  return { ok: true };
}

/**
 * Suppression d'une pièce par le client propriétaire (RGPD) ou le juriste.
 */
export async function supprimerPreuve(
  _prev: PreuveState,
  formData: FormData,
): Promise<PreuveState> {
  const preuveId = String(formData.get("preuveId") ?? "");

  const user = await requireUser().catch(() => null);
  if (user) {
    const preuve = await prisma.preuve.findFirst({
      where: { id: preuveId, dossier: { userId: user.id } },
    });
    if (!preuve) return { error: "Pièce introuvable." };
    const { storageDelete } = await import("@/lib/storage");
    await prisma.preuve.delete({ where: { id: preuve.id } });
    await storageDelete(preuve.url);
    revalidatePath(`/dashboard/cases/${preuve.dossierId}`);
    return { ok: true };
  }

  const juriste = await requireJuriste().catch(() => null);
  if (!juriste) return { error: "Accès refusé." };
  const preuve = await prisma.preuve.findUnique({ where: { id: preuveId } });
  if (!preuve) return { error: "Pièce introuvable." };
  const { storageDelete } = await import("@/lib/storage");
  await prisma.preuve.delete({ where: { id: preuve.id } });
  await storageDelete(preuve.url);
  revalidatePath(`/dashboard/juriste/${preuve.dossierId}`);
  return { ok: true };
}