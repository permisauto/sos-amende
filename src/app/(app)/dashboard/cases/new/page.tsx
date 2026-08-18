import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { PayerCta } from "@/components/payer-cta";
import { UploadForm } from "./upload-form";

export default async function NewCasePage() {
  const user = await requireUser();

  // Seul le client crée des dossiers (paiement à l'avance) : les juristes et
  // administrateurs n'ont pas à voir le paywall.
  if (user.role !== "CLIENT") {
    redirect("/dashboard/cases");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/cases"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Retour aux dossiers
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Nouveau dossier</h1>

      {user.credits < 1 ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">
            Plus de crédit disponible
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Un crédit est requis pour lancer un dossier. Payez d&apos;abord,
            puis revenez ici pour uploader votre avis de contravention ou votre
            décision de suspension.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PayerCta label="Payer un dossier d'amende (39 €)" />
            <PayerCta
              type="SUSPENSION"
              label="Payer un recours suspension (59 €)"
            />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-600">
            Uploadez votre avis de contravention ou votre décision de
            suspension. Un crédit ({user.credits} restant
            {user.credits > 1 ? "s" : ""}) sera consommé pour lancer le
            dossier.
          </p>
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
            <UploadForm />
          </div>
        </>
      )}
    </div>
  );
}