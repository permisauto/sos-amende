import Link from "next/link";
import { prisma } from "@/lib/prisma";

// Hors composant : la règle de pureté React ne s'applique pas aux fonctions
// module — le composant lui reste idempotent.
function estRecent(d: Date | string | null): boolean {
  if (!d) return false;
  return Date.now() - new Date(d).getTime() < 7 * 24 * 60 * 60 * 1000;
}

/**
 * Bandeau de notification paiement dans l'espace client — pilote sur le DERNIER
 * virement du client :
 * - REFUSED (quel que soit son âge) : rouge + motif obligatoire saisi par
 *   l'admin + lien pour refaire un virement ; disparaît dès qu'un nouveau
 *   virement est demandé (PENDING) ou validé ;
 * - PAID récent (≤ 7 jours) : vert « crédit ajouté ».
 * Défensif : aucun bandeau si la base est injoignable.
 */
export async function BandeauPaiement({ userId }: { userId: string }) {
  let dernier: {
    status: string;
    refusMotif: string | null;
    valideLe: Date | null;
  } | null = null;
  try {
    dernier = await prisma.payment.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, refusMotif: true, valideLe: true },
    });
  } catch {
    return null;
  }
  if (!dernier) return null;

  if (dernier.status === "REFUSED") {
    return (
      <div
        data-testid="bandeau-paiement-refuse"
        className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        <p className="font-semibold">
          ✕ Votre dernier virement n&apos;a pas été validé par notre équipe.
        </p>
        {dernier.refusMotif && (
          <p className="mt-1">
            Motif : <strong>{dernier.refusMotif}</strong>
          </p>
        )}
        <p className="mt-1 text-red-700">
          Vous pouvez refaire un virement — votre nouvelle demande sera examinée.
        </p>
        <Link
          href="/paiement"
          className="mt-2 inline-block rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
        >
          Refaire un virement
        </Link>
      </div>
    );
  }

  if (dernier.status === "PAID" && estRecent(dernier.valideLe)) {
    return (
      <div
        data-testid="bandeau-paiement-valide"
        className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
      >
        <p className="font-semibold">
          ✓ Virement validé — votre crédit a été ajouté à votre compte.
        </p>
      </div>
    );
  }

  return null;
}
