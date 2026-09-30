import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { executerSuiviDecisions } from "@/lib/suivi-decision";

/**
 * Récupération automatique des décisions OMP : interroge chaque jour le
 * portail (mock en dev/E2E, RPA derrière ANTAI_REAL=1 en prod) pour les
 * dossiers déposés en ligne dont la décision est attendue depuis au moins
 * DECISION_WAIT_JOURS (21 j par défaut). Une décision trouvée → dossier RESOLU
 * + décision + notification client, sans intervention du client. LRAR (pas de
 * portail) → alerte équipe après DECISION_ALERT_JOURS (45 j).
 * Hors dev, CRON_SECRET est requis (header `Authorization: Bearer <secret>`).
 * `?dossierId=...` (optionnel) restreint la passe à un dossier — pratique
 * dev/E2E, jamais utilisé par le cron Vercel.
 */
export async function GET(req: NextRequest) {
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

  const dossierId = req.nextUrl.searchParams.get("dossierId") ?? undefined;
  const res = await executerSuiviDecisions({ dossierId });

  revalidatePath("/dashboard/juriste");
  revalidatePath("/dashboard/admin/dossiers");

  return NextResponse.json({
    ok: true,
    ...res,
    message: `${res.decisions} décision(s) récupérée(s) automatiquement sur le portail ; ${res.encours} en cours d'instruction ; ${res.echecs} consultation(s) impossible(s).`,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}