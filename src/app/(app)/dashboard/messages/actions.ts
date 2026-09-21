"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireJuriste } from "@/lib/dal";

export type MessageState = { error?: string; ok?: boolean } | undefined;

/**
 * Accès partagé à la messagerie : le client propriétaire du dossier OU le
 * juriste (JURISTE/ADMIN). Retourne le dossier + l'auteur courant, ou null.
 */
async function accesMessagerie(dossierId: string) {
  const user = await requireUser();
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (dossier) return { dossier, auteurId: user.id };
  const juriste = await requireJuriste().catch(() => null);
  if (!juriste) return null;
  const d = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!d) return null;
  return { dossier: d, auteurId: user.id };
}

/**
 * Envoi d'un message dans le fil du dossier (juriste → client ou client →
 * juriste). Le statut du dossier reste inchangé. Un événement MESSAGE est
 * écrit et le destinataire est notifié (in-app lu/non lu + email).
 */
export async function envoyerMessage(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const dossierId = String(formData.get("dossierId") ?? "");
  const contenu = String(formData.get("contenu") ?? "")
    .trim()
    .slice(0, 4000);
  if (contenu.length < 3) {
    return { error: "Message trop court (3 caractères minimum)." };
  }

  const acces = await accesMessagerie(dossierId);
  if (!acces) return { error: "Accès refusé." };
  const { dossier, auteurId } = acces;

  await prisma.$transaction([
    prisma.message.create({
      data: { dossierId, auteurId, contenu },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId,
        type: "MESSAGE",
        detail: contenu.slice(0, 120) + (contenu.length > 120 ? "…" : ""),
      },
    }),
  ]);

  // Notification du destinataire (défensive : no-op sans AUTH_RESEND_KEY)
  const { notifierMessage } = await import("@/lib/notifications");
  if (auteurId === dossier.userId) {
    // Le client a écrit : le fil est visible pour tout juriste (badge).
    revalidatePath(`/dashboard/juriste/${dossierId}`);
    revalidatePath("/dashboard/juriste");
  } else {
    // Un juriste a écrit : notifie le client par email.
    const d = await prisma.dossier.findUnique({
      where: { id: dossierId },
      include: { user: { select: { email: true, name: true } } },
    });
    if (d) await notifierMessage(d, contenu).catch(() => false);
    revalidatePath(`/dashboard/cases/${dossierId}`);
    revalidatePath("/dashboard/cases");
  }

  return { ok: true };
}

// Message interne admin ↔ juriste (section « Messages », hors dossier). Le
// destinataire est obligatoirement un membre de l'équipe (JURISTE ou ADMIN).
export async function envoyerMessageInterne(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const expediteur = await requireJuriste();
  const destinataireId = String(formData.get("destinataireId") ?? "");
  const contenu = String(formData.get("contenu") ?? "")
    .trim()
    .slice(0, 4000);
  if (contenu.length < 3) {
    return { error: "Message trop court (3 caractères minimum)." };
  }
  if (destinataireId === expediteur.id) {
    return { error: "Vous ne pouvez pas vous écrire à vous-même." };
  }

  const destinataire = await prisma.user.findFirst({
    where: { id: destinataireId, role: { in: ["JURISTE", "ADMIN"] } },
    select: { id: true },
  });
  if (!destinataire)
    return { error: "Destinataire introuvable ou accès refusé." };

  await prisma.messageInterne.create({
    data: { expediteurId: expediteur.id, destinataireId, contenu },
  });
  revalidatePath("/dashboard/messages");
  return { ok: true };
}

/**
 * Marque comme lus les messages internes reçus d'un interlocuteur par
 * l'utilisateur courant (JURISTE ou ADMIN). Appelé à l'ouverture du fil.
 */
export async function marquerInternesLus(avecId: string): Promise<void> {
  const user = await requireJuriste().catch(() => null);
  if (!user) return;
  await prisma.messageInterne
    .updateMany({
      where: { expediteurId: avecId, destinataireId: user.id, lu: false },
      data: { lu: true },
    })
    .catch(() => {});
}

/**
 * Marque comme lus les messages adressés à l'utilisateur courant (client ou
 * juriste) sur un dossier. Appelé à l'ouverture du détail.
 */
export async function marquerMessagesLus(dossierId: string): Promise<void> {
  const user = await requireUser().catch(() => null);
  if (!user) return;

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { userId: true },
  });
  if (!dossier) return;

  const isJuriste = user.role === "JURISTE" || user.role === "ADMIN";
  if (!isJuriste && dossier.userId !== user.id) return;

  // Client : messages écrits par un juriste. Juriste : messages écrits par le
  // client. On ne marque jamais lu ses propres messages.
  const auteurInterlocuteur = isJuriste ? dossier.userId : { not: user.id } as object;
  await prisma.message.updateMany({
    where: { dossierId, auteurId: auteurInterlocuteur, lu: false },
    data: { lu: true },
  });
}