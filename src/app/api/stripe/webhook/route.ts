import { NextResponse } from "next/server";
import Stripe from "stripe";
import { traiterPaiement, type SessionPaiement } from "@/lib/paiement";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return NextResponse.json(
      { error: "Webhook Stripe non configuré." },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Garde-fou : on ne crédite que nos montants (39 € / 59 €). Une session
    // d'un autre produit ou avec un montant inattendu ne crédite pas.
    const amount = session.amount_total ?? 0;
    if (amount !== 3900 && amount !== 5900) {
      console.error(
        `webhook: montant inattendu ${amount} (session ${session.id}) — crédit refusé`,
      );
      return NextResponse.json({ received: true, error: "montant inattendu" });
    }
    const result = await traiterPaiement(session as SessionPaiement);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  return NextResponse.json({ received: true });
}