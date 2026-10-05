import { NextResponse } from "next/server";
import { verifierSecretCron } from "@/lib/cron-auth";
import { chercherRappels, chercherRappelsPreuves } from "@/lib/rappels";
import { purgerLiensDepotExpires } from "@/lib/lien-depot";

/**
 * Endpoint de rappels (deadline manager + relance des pièces manquantes).
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
  // RGPD : purge des liens de dépôt expirés depuis plus de 30 jours
  // (meilleur effort — une erreur de purge ne doit pas casser les rappels).
  const liensPurges = await purgerLiensDepotExpires().catch(() => 0);
  return NextResponse.json({
    ok: true,
    rappels: rappels.length,
    details: rappels,
    rappelsPreuves: rappelsPreuves.length,
    detailsPreuves: rappelsPreuves,
    liensDepotPurges: liensPurges,
  });
}

export async function POST(req: Request) {
  return GET(req);
}