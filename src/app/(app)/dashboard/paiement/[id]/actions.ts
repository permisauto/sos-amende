"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";

export type VirementState = { ok?: boolean; error?: string } | undefined;

export async function payerParVirement(_prev: VirementState, formData: FormData): Promise<VirementState> {
  const user = await requireUser();
  const dossierId = String(formData.get("dossierId") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();

  if (!nom || !prenom || !email) return { error: "Nom, prénom et email requis." };
  if (!whatsapp) return { error: "Numéro WhatsApp requis." };

  const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, userId: user.id } });
  if (!dossier) return { error: "Dossier introuvable." };

  // Sauvegarde contact dans extractedData et User
  const data = (dossier.extractedData as Record<string, unknown> | null) ?? {};
  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { extractedData: { ...data, contactNom: nom, contactPrenom: prenom, contactEmail: email, contactWhatsapp: whatsapp } as object },
    }),
    prisma.user.update({ where: { id: user.id }, data: { name: `${prenom} ${nom}` } }),
    prisma.payment.create({
      data: {
        userId: user.id,
        amount: dossier.type === "SUSPENSION" ? 59 : 39,
        currency: "EUR",
        status: "PENDING_VIREMENT",
        kind: dossier.type,
      },
    }),
    prisma.dossierEvent.create({ data: { dossierId: dossier.id, type: "EN_ATTENTE", detail: `Virement demandé — ${prenom} ${nom} / ${whatsapp}` } }),
  ]);

  revalidatePath(`/dashboard/paiement/${dossierId}`);
  return { ok: true };
}
