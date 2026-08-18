import { NextResponse } from "next/server";
import { z } from "zod";
import { traiterPaiement } from "@/lib/paiement";

export const runtime = "nodejs";

const bodySchema = z.object({
  type: z.enum(["AMENDE", "SUSPENSION"]),
  email: z.email("Adresse e-mail invalide."),
  name: z.string().trim().optional(),
});

/**
 * Déclencheur de paiement mock (dev/E2E uniquement) : simule l'événement
 * Stripe `checkout.session.completed` et le traite comme le webhook réel.
 * Jamais actif hors STRIPE_MOCK=1.
 */
export async function POST(request: Request) {
  if (process.env.STRIPE_MOCK !== "1") {
    return NextResponse.json(
      { error: "Mock Stripe désactivé." },
      { status: 404 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email requis (inscription inversée)." },
      { status: 400 },
    );
  }

  const { type, email, name } = parsed.data;
  const amount = type === "SUSPENSION" ? 5900 : 3900;

  const result = await traiterPaiement({
    id: `mock_cs_${Date.now()}`,
    customer_details: { email, name },
    metadata: { type },
    amount_total: amount,
    currency: "EUR",
    payment_intent: `mock_pi_${Date.now()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}