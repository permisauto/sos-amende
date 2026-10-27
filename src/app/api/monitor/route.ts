import { NextResponse } from "next/server";
import { genererMetriques } from "@/lib/veille-ingestion";
import { verifierSecretCron } from "@/lib/cron-auth";

/**
 * P2-02 / Monitoring production — métriques de veille.
 * Utilise `genererMetriques()` (veille-ingestion.ts) pour retourner
 * les métriques du jour (extractions, propositions, taux validation).
 *
 * Protection : même que `/api/health` (full mode) — `x-health-secret`
 * ou `Authorization: Bearer <CRON_SECRET>`. Sans secret : `ok` en dev,
 * `secret-absent` (500) en production.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET manquante : monitoring non autorisé en production." },
      { status: 500 },
    );
  }

  const auth = verifierSecretCron(req);
  if (auth !== "ok" && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Non autorisé — header x-health-secret requis." },
      { status: 401 },
    );
  }

  try {
    const metriques = await genererMetriques();
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "development",
      metriques,
    }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        status: "degraded",
        error: e instanceof Error ? e.message : "Erreur monitoring",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
