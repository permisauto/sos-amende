import { prisma } from "@/lib/prisma";

/** Types de notifications supportés */
export type NotificationType =
  | "LETTER_VALIDATED"
  | "LETTER_REJECTED"
  | "PAYMENT_VALIDATED"
  | "PAYMENT_REFUSED"
  | "DECISION_RECEIVED"
  | "PROOF_REQUESTED"
  | "MESSAGE_RECEIVED"
  | "AVOCAT_ASSIGNED"
  | "SIGNATURE_READY"
  | "DEPOT_ASSISTE_READY";

/** Types internes SSE (pas exposés côté métier) */
export type InternalNotificationType = "CONNECTED" | "HEARTBEAT";

/** Payload de notification */
export interface NotificationPayload {
  type: NotificationType | InternalNotificationType;
  title: string;
  message: string;
  dossierId?: string;
  actionUrl?: string;
  /** Données additionnelles pour le client */
  data?: Record<string, unknown>;
}

/** Map des connexions SSE actives par userId */
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Ajoute une connexion SSE pour un utilisateur
 */
export function addSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(controller);
}

/**
 * Retire une connexion SSE
 */
export function removeSSEConnection(userId: string, controller: ReadableStreamDefaultController): void {
  const userConnections = connections.get(userId);
  if (userConnections) {
    userConnections.delete(controller);
    if (userConnections.size === 0) {
      connections.delete(userId);
    }
  }
}

/**
 * Envoie une notification à un utilisateur spécifique
 */
export function sendNotification(userId: string, payload: NotificationPayload): number {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.size === 0) {
    return 0;
  }

  const eventData = `data: ${JSON.stringify(payload)}\n\n`;
  let sent = 0;

  for (const controller of userConnections) {
    try {
      controller.enqueue(new TextEncoder().encode(eventData));
      sent++;
    } catch {
      // Connexion fermée, sera nettoyée au prochain envoi
    }
  }

  return sent;
}

/**
 * Envoie une notification à plusieurs utilisateurs
 */
export function broadcastNotification(userIds: string[], payload: NotificationPayload): number {
  let totalSent = 0;
  for (const userId of userIds) {
    totalSent += sendNotification(userId, payload);
  }
  return totalSent;
}

/**
 * Récupère les IDs des utilisateurs à notifier selon le type d'événement
 */
export async function getRecipientsForEvent(
  type: NotificationType,
  context: { dossierId?: string; userId?: string; role?: "CLIENT" | "JURISTE" | "ADMIN" }
): Promise<string[]> {
  const recipients = new Set<string>();

  if (context.userId) {
    recipients.add(context.userId);
  }

  if (context.dossierId) {
    const dossier = await prisma.dossier.findUnique({
      where: { id: context.dossierId },
      select: { userId: true, lawyerMatch: { select: { userId: true } } },
    });

    if (dossier?.userId) recipients.add(dossier.userId);
    if (dossier?.lawyerMatch?.userId) recipients.add(dossier.lawyerMatch.userId);

    // Juristes/Admins selon le type
    if (["LETTER_VALIDATED", "LETTER_REJECTED", "DECISION_RECEIVED"].includes(type)) {
      const juristes = await prisma.user.findMany({
        where: { role: { in: ["JURISTE", "ADMIN"] } },
        select: { id: true },
      });
      juristes.forEach((j) => recipients.add(j.id));
    }
  }

  return Array.from(recipients);
}

/**
 * Crée une notification standardisée selon le type
 */
export function createNotification(
  type: NotificationType,
  context: { dossierId?: string; userId?: string; numPv?: string; montant?: number }
): NotificationPayload {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";

  switch (type) {
    case "LETTER_VALIDATED":
      return {
        type,
        title: "Lettre validée par le juriste",
        message: "Votre lettre de contestation a été vérifiée et validée. Vous pouvez maintenant la signer.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : undefined,
        data: { numPv: context.numPv },
      };

    case "LETTER_REJECTED":
      return {
        type,
        title: "Dossier rejeté",
        message: "Un juriste a rejeté votre dossier. Consultez le motif dans votre espace.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : undefined,
      };

    case "PAYMENT_VALIDATED":
      return {
        type,
        title: "Paiement validé",
        message: `Votre virement de ${context.montant?.toLocaleString("fr-FR")} € a été validé. Votre crédit est disponible.`,
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : `${baseUrl}/dashboard`,
      };

    case "PAYMENT_REFUSED":
      return {
        type,
        title: "Paiement refusé",
        message: "Votre virement a été refusé. Consultez le motif et recommencez si nécessaire.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/paiement/${context.dossierId}` : `${baseUrl}/dashboard`,
      };

    case "DECISION_RECEIVED":
      return {
        type,
        title: "Décision de l'administration reçue",
        message: "Une décision a été récupérée automatiquement pour votre dossier.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : undefined,
      };

    case "PROOF_REQUESTED":
      return {
        type,
        title: "Pièce manquante demandée",
        message: "Le juriste vous demande de joindre une pièce justificative à votre dossier.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}#preuves` : undefined,
      };

    case "MESSAGE_RECEIVED":
      return {
        type,
        title: "Nouveau message",
        message: "Vous avez reçu un message de la part du juriste.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : undefined,
      };

    case "AVOCAT_ASSIGNED":
      return {
        type,
        title: "Avocat attribué",
        message: "Un avocat partenaire a été attribué à votre dossier. Ses coordonnées sont disponibles.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}#avocat` : undefined,
      };

    case "SIGNATURE_READY":
      return {
        type,
        title: "Lettre prête à signer",
        message: "Votre lettre est validée par le juriste. Vous pouvez maintenant la signer.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/dashboard/cases/${context.dossierId}` : undefined,
      };

    case "DEPOT_ASSISTE_READY":
      return {
        type,
        title: "Lien de dépôt prêt",
        message: "Votre lien de dépôt assisté est prêt. Déposez votre contestation sur le portail officiel.",
        dossierId: context.dossierId,
        actionUrl: context.dossierId ? `${baseUrl}/recours/finaliser?dossier=${context.dossierId}` : undefined,
      };

    default:
      return {
        type,
        title: "Notification",
        message: "Nouvelle notification",
        dossierId: context.dossierId,
      };
  }
}

/** Envoie + persiste en base (optionnel pour historique) */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  context: { dossierId?: string; userId?: string; numPv?: string; montant?: number }
): Promise<void> {
  const payload = createNotification(type, context);

  // Envoi temps réel
  sendNotification(userId, payload);

  // TODO: Persister en base pour historique (table Notification)
  // await prisma.notification.create({ data: { userId, ...payload, read: false } });
}