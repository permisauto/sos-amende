import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { storageUrl } from "@/lib/storage";
import { UploadForm } from "./upload-form";
import { PRIX_AMENDE, PRIX_SUSPENSION, PRIX_OPTION_LRAR } from "@/lib/tarifs";

// Marge temporelle de la server action `createDossier` (dépôt + OCR) : le
// watchdog OCR interne (OCR_TIMEOUT_MS, 20 s) doit tomber AVANT la coupe
// plateforme (docs Next : maxDuration au niveau page = timeout des server
// actions de la page).
export const maxDuration = 30;

export default async function NewCasePage(props: PageProps<"/dashboard/cases/new">) {
  const user = await requireUser();

  // Seul le client crée des dossiers : les juristes et administrateurs n'ont pas à voir le dépôt.
  if (user.role !== "CLIENT") {
    redirect("/dashboard/cases");
  }
  const sp = await props.searchParams;
  const typeParam = sp.type === "SUSPENSION" ? "SUSPENSION" : sp.type === "AMENDE" ? "AMENDE" : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/cases"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour aux dossiers
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Nouveau dossier</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Téléversez votre PV ou lettre de suspension — <span className="font-semibold">analyse gratuite</span>. Le scan, le scoring et la détection de faille sont offerts. Vous ne payez ({PRIX_AMENDE}&nbsp;€ / amende, {PRIX_SUSPENSION}&nbsp;€ / suspension, par virement bancaire ; option lettre recommandée +{PRIX_OPTION_LRAR}&nbsp;€) que si une faille est validée et que vous souhaitez lancer la contestation.
      </p>
      {typeParam && (
        <p className="mt-2 text-xs text-emerald-700">Type pré-sélectionné : {typeParam === "AMENDE" ? "Amende" : "Suspension de permis"}</p>
      )}
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <UploadForm
          defaultType={typeParam}
          signatureExistante={await storageUrl(user.signatureUrl)}
        />
      </div>
    </div>
  );
}