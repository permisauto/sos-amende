import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { synchroniserCatalogue } from "@/lib/auto-alimentation";

/**
 * Auto-alimentation automatique de la base juridique : synchronise la table
 * `FailleJuridique` avec le catalogue sourcé (FAILLES.md §H) en statut
 * PROPOSEE. À appeler périodiquement (ex. Vercel Cron / GitHub Actions) — les
 * propositions arrivent alors automatiquement ; l'admin ne fait que valider.
 * Si CRON_SECRET est défini, un header `Authorization: Bearer <secret>` est
 * requis.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  const count = await synchroniserCatalogue();
  revalidatePath("/dashboard/admin/failles");
  return NextResponse.json({
    ok: true,
    synchronisees: count,
    message: `${count} proposition(s) du catalogue en attente de validation admin.`,
  });
}

export async function POST(req: Request) {
  return GET(req);
}