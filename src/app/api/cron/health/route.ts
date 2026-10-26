import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierSecretCron } from "@/lib/cron-auth";

/**
 * Health check des cron jobs : vérifie la dernière exécution réussie de chaque cron.
 * Utilisable par monitoring externe (UptimeRobot, Better Uptime, Datadog, etc.)
 * via `GET /api/cron/health?secret=<CRON_SECRET>`.
 *
 * Retourne 200 si tous les crons critiques ont tourné < 48h, 503 sinon.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const now = new Date();
  const seuilAlerte = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48h

  // Récupérer les dernières traces d'auto-alimentation
  const traces = await prisma.autoAlimentationTrace.findMany({
    where: { campagne: { in: ["catalogue", "veille-dila", "veille-ta", "extraction-veille", "auto-enrichissement", "pre-filtre-veille"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Grouper par campagne : dernière exécution OK
  const dernieresOk: Record<string, Date> = {};
  for (const t of traces) {
    if (t.statut === "OK" && !dernieresOk[t.campagne]) {
      dernieresOk[t.campagne] = t.createdAt;
    }
  }

  const cronsCritiques = [
    { key: "rappels", label: "Rappels J-10/J-3/J-0 + pièces manquantes", lastRun: dernieresOk["catalogue"] },
    { key: "recuperations-decisions", label: "Récupération décisions OMP", lastRun: dernieresOk["auto-alimentation"] },
    { key: "veille-dila", label: "Veille juridique DILA (JADE/CASS/JORF)", lastRun: dernieresOk["veille-dila"] },
    { key: "veille-ta", label: "Veille TA (zip mensuel)", lastRun: dernieresOk["veille-ta"] },
    { key: "digest-veille", label: "Digest veille (email équipe)", lastRun: dernieresOk["extraction-veille"] },
  ];

  const resultats = cronsCritiques.map((c) => {
    const lastRun = c.lastRun;
    const retardMs = lastRun ? now.getTime() - lastRun.getTime() : Infinity;
    const retardH = lastRun ? Math.round(retardMs / (1000 * 60 * 60) * 10) / 10 : null;
    const ok = lastRun && lastRun > seuilAlerte;
    return {
      cron: c.key,
      label: c.label,
      lastRun: lastRun?.toISOString() ?? null,
      retardHeures: retardH,
      status: ok ? "healthy" : "stale",
    };
  });

  const tousOk = resultats.every((r) => r.status === "healthy");
  const statusCode = tousOk ? 200 : 503;

  return NextResponse.json(
    {
      status: tousOk ? "healthy" : "degraded",
      timestamp: now.toISOString(),
      seuilAlerteHeures: 48,
      crons: resultats,
    },
    { status: statusCode }
  );
}