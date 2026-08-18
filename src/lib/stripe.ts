import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const stripe = getStripe();

export const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
export const PRICE_AMENDE = process.env.STRIPE_PRICE_AMENDE;
export const PRICE_SUSPENSION = process.env.STRIPE_PRICE_SUSPENSION;

export const AMOUNT_AMENDE = 3900; // 39 €
export const AMOUNT_SUSPENSION = 5900; // 59 €
