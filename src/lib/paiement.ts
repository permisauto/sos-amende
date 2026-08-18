import { prisma } from "@/lib/prisma";

export type SessionPaiement = {
  id: string;
  customer_details?: {
    email?: string | null;
    name?: string | null;
  } | null;
  metadata?: { type?: string | null } | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  customer?: string | null;
};

export type PaiementResult = { ok: true } | { ok: false; error: string };

/**
 * Traitement d'un `checkout.session.completed` (Stripe). Partagé entre le
 * webhook réel et le mock local : inscription inversée — crée/upgrade le
 * compte par email, ajoute 1 crédit, enregistre le paiement.
 */
export async function traiterPaiement(
  session: SessionPaiement,
): Promise<PaiementResult> {
  const email = session.customer_details?.email;
  const name = session.customer_details?.name ?? undefined;
  const type =
    session.metadata?.type === "SUSPENSION" ? "SUSPENSION" : "AMENDE";
  const amount = session.amount_total ?? 0;

  if (!email) {
    return { ok: false, error: "Email client manquant." };
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name } });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        credits: { increment: 1 },
        ...(session.customer ? { stripeCustomerId: String(session.customer) } : {}),
      },
    }),
    prisma.payment.create({
      data: {
        userId: user.id,
        stripePaymentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.id,
        amount: amount / 100,
        currency: (session.currency ?? "EUR").toUpperCase(),
        status: "COMPLETED",
        kind: type,
      },
    }),
  ]);

  return { ok: true };
}