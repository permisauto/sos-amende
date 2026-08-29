import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  stripe,
  PRICE_AMENDE,
  PRICE_SUSPENSION,
  AMOUNT_AMENDE,
  AMOUNT_SUSPENSION,
} from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({
  type: z.enum(["AMENDE", "SUSPENSION"]),
  dossierId: z.string().optional(),
  contact: z.object({ nom: z.string().optional(), prenom: z.string().optional(), email: z.string().email().optional(), whatsapp: z.string().optional() }).optional(),
});

const PRICE_IDS: Record<string, string | undefined> = {
  AMENDE: PRICE_AMENDE,
  SUSPENSION: PRICE_SUSPENSION,
};

const AMOUNTS: Record<string, number> = {
  AMENDE: AMOUNT_AMENDE,
  SUSPENSION: AMOUNT_SUSPENSION,
};

const NAMES: Record<string, string> = {
  AMENDE: "Contestation d'amende",
  SUSPENSION: "Recours suspension de permis",
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Type d'infraction invalide." },
      { status: 400 },
    );
  }

  const { type, dossierId, contact } = parsed.data;
  const session = await auth();
  const user = session?.user;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Mode démo/Dev : Stripe réel non requis — redirige vers le portail de
  // paiement mock local (/mock-stripe), qui déclenche le webhook simulé.
  if (process.env.STRIPE_MOCK === "1") {
    const params = new URLSearchParams({ type });
    if (user?.email) params.set("email", user.email);
    if (contact?.email) params.set("email", contact.email);
    if (user?.id) params.set("client", user.id);
    if (dossierId) params.set("dossierId", dossierId);
    return NextResponse.json({ url: `${appUrl}/mock-stripe?${params}` });
  }

  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe n'est pas configuré (STRIPE_SECRET_KEY manquante)." },
      { status: 400 },
    );
  }

  const priceId = PRICE_IDS[type];
  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: "EUR",
            product_data: { name: NAMES[type] },
            unit_amount: AMOUNTS[type],
          },
          quantity: 1,
        },
      ];

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    client_reference_id: user?.id,
    customer_email: contact?.email ?? user?.email ?? undefined,
    metadata: { type, dossierId: dossierId ?? "", whatsapp: contact?.whatsapp ?? "" },
    success_url: dossierId ? `${appUrl}/dashboard/cases/${dossierId}?checkout=success` : `${appUrl}/dashboard?checkout=success`,
    cancel_url: dossierId ? `${appUrl}/dashboard/paiement/${dossierId}?checkout=cancelled` : `${appUrl}/pricing?checkout=cancelled`,
  });

  return NextResponse.json({ url: checkout.url });
}