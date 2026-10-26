import { NextResponse } from "next/server";
import { verifierSecretCron } from "@/lib/cron-auth";
import { chercherRappels, chercherRappelsPreuves, chercherRappelsPaiement } from "@/lib/rappels";
import { purgerLiensDepotExpires } from "@/lib/lien-depot";
import { purgerFenetresExpirees } from "@/lib/rate-limit";

/**
 * Endpoint de rappels (deadline manager + relance des pièces manquantes + relance paiement).
 * À appeler quotidiennement par un cron (ex. Vercel Cron / GitHub Actions).
 * Hors dev, CRON_SECRET est requis (header `Authorization: Bearer <secret>`).
 */
export async function GET(req: Request) {
  const auth = verifierSecretCron(req);
  if (auth === "secret-absent") {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré en production" },
      { status: 500 },
    );
  }
  if (auth === "non-autorise") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rappels = await chercherRappels();
  const rappelsPreuves = await chercherRappelsPreuves();
  const rappelsPaiement = await chercherRappelsPaiement();
  // RGPD : purge des liens de dépôt expirés depuis plus de 30 jours
  // (meilleur effort — une erreur de purge ne doit pas casser les rappels).
  const liensPurges = await purgerLiensDepotExpires().catch(() => 0);
  // Rate-limit : purge des fenêtres glissantes expirées (no-op hors postgres).
  const fenetresPurgees = await purgerFenetresExpirees().catch(() => 0);
  return NextResponse.json({
    ok: true,
    rappels: rappels.length,
    details: rappels,
    rappelsPreuves: rappelsPreuves.length,
    detailsPreuves: rappelsPreuves,
    rappelsPaiement: rappelsPaiement.length,
    detailsPaiement: rappelsPaiement,
    liensDepotPurges: liensPurges,
    fenetresRateLimitPurgees: fenetresPurgees,
  });
}

export async function POST(req: Request) {
  return GET(req);
}