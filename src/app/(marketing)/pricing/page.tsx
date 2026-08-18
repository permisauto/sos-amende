import type { Metadata } from "next";
import { CheckoutButton } from "@/components/checkout-button";

export const metadata: Metadata = {
  title: "Tarifs",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Des tarifs simples, sans surprise</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-600">
          L'analyse de votre dossier est gratuite. Vous ne payez que pour
          lancer votre contestation. Le paiement débloque un crédit dossier sur
          votre compte.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border-2 border-emerald-600 p-8">
          <h2 className="text-lg font-semibold text-emerald-700">
            Contestation d'amende
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Requête en exonération adressée à l&apos;officier du ministère
            public, prête à envoyer en recommandé avec accusé de réception.
          </p>
          <p className="mt-6 text-5xl font-bold">
            39 €<span className="text-base font-normal text-zinc-500">/amende</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-600">
            <li>Analyse juridique et détection de la faille</li>
            <li>Lettre de contestation générée dynamiquement</li>
            <li>Signature électronique</li>
            <li>Validation par un juriste</li>
            <li>Kit d&apos;envoi en recommandé avec accusé de réception (LRAR)</li>
            <li>Suivi jusqu&apos;à la décision</li>
          </ul>
          <CheckoutButton type="AMENDE">Contester mon amende</CheckoutButton>
        </div>

        <div className="flex flex-col rounded-2xl border-2 border-zinc-300 p-8">
          <h2 className="text-lg font-semibold">Recours suspension de permis</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Recours adressé au préfet en recommandé avec accusé de réception,
            avec chronologie d&apos;urgence.
          </p>
          <p className="mt-6 text-5xl font-bold">
            59 €<span className="text-base font-normal text-zinc-500">/suspension</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-600">
            <li>Analyse de la décision de suspension</li>
            <li>Recours gracieux au préfet généré</li>
            <li>Signature électronique</li>
            <li>Validation par un juriste</li>
            <li>Kit d&apos;envoi en recommandé avec accusé de réception (LRAR)</li>
            <li>Suivi des délais et de la commission médicale</li>
          </ul>
          <CheckoutButton type="SUSPENSION">
            Défendre mon permis
          </CheckoutButton>
        </div>
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-zinc-500">
        SOS Amende fournit un outil d'assistance à la contestation. Il ne se
        substitue pas à un avocat pour les cas où la représentation est
        obligatoire. Consultez nos CGV pour le détail.
      </p>
    </div>
  );
}