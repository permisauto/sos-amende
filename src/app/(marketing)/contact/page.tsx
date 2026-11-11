import type { Metadata } from "next";
import { SOS_CONTACT_EMAIL } from "@/lib/contact-form";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">Contactez-nous</h1>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Nous répondons aux questions sur le service (tarifs, fonctionnement,
        délais de traitement, paiement, rétractation, remboursement). Nous ne
        pouvons pas donner de conseil juridique sur votre situation par ce
        canal. N&apos;envoyez pas de documents ni de données sensibles.
      </div>

      <p className="mt-4 text-sm text-zinc-600">
        E-mail :{" "}
        <a
          href={`mailto:${SOS_CONTACT_EMAIL}`}
          className="font-medium text-emerald-700 underline"
        >
          {SOS_CONTACT_EMAIL}
        </a>
      </p>

      <div className="mt-6">
        <ContactForm />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Les informations saisies sont utilisées pour répondre à votre demande,
        conformément à notre{" "}
        <a
          href="/confidentialite"
          className="text-emerald-700 underline"
        >
          politique de confidentialité
        </a>
        .
      </p>
    </div>
  );
}
