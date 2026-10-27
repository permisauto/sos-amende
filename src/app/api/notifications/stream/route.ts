import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { addSSEConnection, removeSSEConnection, sendNotification, createNotification, NotificationType } from "@/lib/realtime";

/**
 * Endpoint SSE (Server-Sent Events) pour notifications temps réel.
 * Le client se connecte via EventSource sur cette route.
 * Authentification via session NextAuth (cookie).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Non authentifié", { status: 401 });
  }

  const userId = user.id;

  // Stream SSE
  const stream = new ReadableStream({
    start(controller) {
      // Enregistrer la connexion
      addSSEConnection(userId, controller);

      // Envoyer événement de connexion
      const welcome = `data: ${JSON.stringify({ type: "CONNECTED", message: "Connexion SSE établie" })}\n\n`;
      controller.enqueue(new TextEncoder().encode(welcome));

      // Heartbeat toutes les 30s pour garder la connexion vivante
      const heartbeat = setInterval(() => {
        try {
          const heartbeatData = `data: ${JSON.stringify({ type: "HEARTBEAT", timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeatData));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Nettoyage à la fermeture
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        removeSSEConnection(userId, controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Désactive buffering nginx
    },
  });
}

// Pour tester manuellement : POST avec { userId, type, ... }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return new Response("Réservé aux admins", { status: 403 });
  }

  const body = await req.json();
  const { userId, type, ...context } = body as {
    userId: string;
    type: NotificationType;
    dossierId?: string;
    numPv?: string;
    montant?: number;
  };

  const { sendNotification, createNotification } = await import("@/lib/realtime");
  const payload = createNotification(type, context);
  const sent = sendNotification(userId, payload);

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { "Content-Type": "application/json" },
  });
}