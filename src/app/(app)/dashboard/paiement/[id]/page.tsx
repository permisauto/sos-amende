import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { PaiementForm } from "./paiement-form";

export default async function PaiementPage(props: PageProps<"/dashboard/paiement/[id]">) {
  const user = await requireUser();
  const params = await props.params;
  const id = params.id;
  const dossier = await prisma.dossier.findFirst({
    where: { id, userId: user.id },
    include: { failleJuridique: true, faillesRetenues: { include: { faille: true } } },
  });
  if (!dossier) notFound();
  if (dossier.statut !== "A_VERIFIER" || !dossier.lettreGeneree) {
    redirect(`/dashboard/cases/${id}`);
  }

  // Si déjà payé (crédit dispo), pas besoin de repayer
  if (user.credits > 0) {
    redirect(`/dashboard/cases/${id}`);
  }

  const score = dossier.failleJuridique ? 92 : (dossier.faillesRetenues.length > 0 ? 65 : 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/cases/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900">← Retour au dossier</Link>
      <h1 className="mt-2 text-2xl font-bold">Finaliser — {dossier.type === "AMENDE" ? "Contestation d'amende" : "Recours suspension"}</h1>
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-sm font-semibold text-emerald-900">✓ Faille détectée : {dossier.failleJuridique?.titreFaille ?? `${dossier.faillesRetenues.length} faille(s) candidate(s)`}</p>
        <p className="mt-1 text-sm text-emerald-800">Score {score}% — votre dossier est éligible. Le scan + scoring sont gratuits, la génération et validation de la lettre sont payantes.</p>
        <p className="mt-1 text-xs text-emerald-700">Article {dossier.failleJuridique?.articleLoi ?? "—"} — lettre prête à être débloquée après paiement.</p>
      </div>
      <div className="mt-6">
        <PaiementForm dossierId={dossier.id} type={dossier.type} defaultEmail={user.email ?? ""} defaultName={user.name ?? ""} />
      </div>
      <p className="mt-6 text-center text-xs text-zinc-500">Paiement sécurisé. Virement : RIB affiché après formulaire, validation sous 24h. Stripe : crédit instantané.</p>
    </div>
  );
}
