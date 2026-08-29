import type { Metadata } from "next";
import { PaiementPublicClient } from "./paiement-client";

export const metadata: Metadata = { title: "Paiement — finaliser votre dossier" };

export default async function PaiementPublicPage(props: { searchParams: Promise<{ type?: string }> }) {
  const sp = await props.searchParams;
  const type = sp.type === "SUSPENSION" ? "SUSPENSION" : "AMENDE";
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">Paiement — {type === "AMENDE" ? "39 € / amende" : "59 € / suspension"}</h1>
      <p className="mt-2 text-sm text-zinc-600">Renseignez vos informations personnelles et choisissez virement ou carte bancaire. Le scan et le scoring étaient gratuits.</p>
      <div className="mt-8">
        <PaiementPublicClient initialType={type} />
      </div>
    </div>
  );
}
