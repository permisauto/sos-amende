import { NextResponse } from "next/server";
import { chercherRappels, chercherRappelsPreuves } from "@/lib/rappels";

/**
 * Endpoint de rappels (deadline manager + relance des pièces manquantes).
 * À appeler quotidiennement par un cron (ex. Vercel Cron / GitHub Actions).
 * Hors dev, CRON_SECRET est requis (header `Authorization: Bearer <secret>`).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré en production" },
      { status: 500 },
    );
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  const rappels = await chercherRappels();
  const rappelsPreuves = await chercherRappelsPreuves();
  return NextResponse.json({
    ok: true,
    rappels: rappels.length,
    details: rappels,
    rappelsPreuves: rappelsPreuves.length,
    detailsPreuves: rappelsPreuves,
  });
}

export async function POST(req: Request) {
  return GET(req);
}