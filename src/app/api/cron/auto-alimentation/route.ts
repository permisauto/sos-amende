import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { executerAutoAlimentation } from "@/lib/auto-alimentation";

/**
 * Auto-alimentation automatique de la base juridique : synchronise la table
 * `FailleJuridique` avec le catalogue sourcé (FAILLES.md §H) en statut
 * PROPOSEE, trace chaque passage, puis exécute la veille juridique externe
 * (détection des nouvelles éditions du JORF + alerte admin). À appeler
 * quotidiennement (Vercel Cron : `0 2 * * *`). Les propositions arrivent
 * automatiquement ; l'admin ne fait que valider.
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

  const res = await executerAutoAlimentation();
  revalidatePath("/dashboard/juriste/failles");
  return NextResponse.json({
    ok: true,
    synchronisees: res.catalogue,
    veille: {
      edition: res.veilleEdition,
      nouvelle: res.veilleNouvelle,
    },
    message: `${res.catalogue} proposition(s) du catalogue en attente de validation admin.`,
  });
}

export async function POST(req: Request) {
  return GET(req);
}