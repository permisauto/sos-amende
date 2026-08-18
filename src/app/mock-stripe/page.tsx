import Link from "next/link";
import { MockStripeForm } from "./mock-stripe-form";

const NAMES: Record<string, { label: string; montant: number }> = {
  AMENDE: { label: "Contestation d'amende", montant: 39 },
  SUSPENSION: { label: "Recours suspension de permis", montant: 59 },
};

export default async function MockStripePage(
  props: PageProps<"/mock-stripe">,
) {
  const params = await props.searchParams;
  const type = params.type === "SUSPENSION" ? "SUSPENSION" : "AMENDE";
  const email = typeof params.email === "string" ? params.email : "";
  const offre = NAMES[type];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Portail de paiement — mode démo
        </span>
        <h1 className="mt-4 text-2xl font-bold">{offre.label}</h1>
        <p className="mt-2 text-4xl font-bold text-emerald-700">
          {offre.montant} €
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {type === "AMENDE" ? "À l'acte" : "À l'acte"} — un crédit ajouté à
          votre compte
        </p>

        <MockStripeForm type={type} initialEmail={email} />

        <p className="mt-6 text-xs text-zinc-400">
          Simulateur local de Stripe Checkout (dev/E2E uniquement) : il
          déclenche l&apos;événement <code>checkout.session.completed</code>{" "}
          traité par le webhook réel. Jamais actif hors{" "}
          <code>STRIPE_MOCK=1</code>.
        </p>
      </div>
      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/pricing" className="font-medium text-emerald-700 hover:underline">
          ← Retour aux tarifs
        </Link>
      </p>
    </div>
  );
}