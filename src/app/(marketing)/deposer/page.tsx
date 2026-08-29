import type { Metadata } from "next";
import { DeposerClient } from "./deposer-client";

export const metadata: Metadata = { title: "Déposer votre dossier — analyse gratuite" };

export default async function DeposerPage(props: { searchParams: Promise<{ type?: string }> }) {
  const sp = await props.searchParams;
  const type = sp.type === "SUSPENSION" ? "SUSPENSION" : "AMENDE";
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Déposer votre {type === "AMENDE" ? "avis de contravention" : "décision de suspension"}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Aucun email demandé à cette étape. Téléversez votre document, renseignez les infos utiles, lancez le scan : le scoring détecte les failles et affiche le pourcentage de succès. Vous ne payez qu'ensuite.
      </p>
      <div className="mt-8">
        <DeposerClient initialType={type} />
      </div>
    </div>
  );
}
