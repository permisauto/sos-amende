import { NextResponse } from "next/server";
import { verifierSecretCron } from "@/lib/cron-auth";
import { revalidatePath } from "next/cache";
import {
  executerVeilleDila,
  regenererAnalysesAnciennes,
} from "@/lib/veille-ingestion";

/**
 * Veille juridique automatique (auto-alimentation §H) : télécharge les
 * nouvelles publications officielles (JADE quotidien, CASS hebdomadaire,
 * JORF quotidien, + le zip mensuel des tribunaux administratifs dès le 8 du
 * mois), ne conserve que celles qui sont pertinentes pour la contestation
 * d'amendes routières, et les dépose en lecture dans l'espace « Veille
 * juridique ».
 *
 * Appelé quotidiennement (Vercel Cron). Uniquement de la **matière sourcée**
 * est remontée : métadonnées, liens Légifrance et citations littérales. Aucune
 * faille n'est créée ni activée ici — la promotion en proposition de faille
 * est une décision humaine.
 *
 * Le même passage **régénère** un lot d'analyses héritées vers le format
 * Veille 2.0 (`regenererAnalysesAnciennes`), borné par le quota Gemini du jour.
 *
 * Hors dev, `CRON_SECRET` est requis (header `Authorization: Bearer <secret>`).
 * `?sources=JADE,CASS` permet de restreindre l'exécution (utile en test ;
 * `TA` est accepté, mais reste soumis à la fenêtre mensuelle).
 */

/** Le zip TA (~19 000 XML) pèse sur la durée : plafond de plateforme (Hobby = 300 s max). */
export const maxDuration = 300;

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

  const url = new URL(req.url);
  const filtre = url.searchParams.get("sources");
  const res = await executerVeilleDila(filtre ? new Set(filtre.split(",")) : undefined);

  // Reprise progressive des analyses héritées (avant Veille 2.0) vers le format
  // courant — **bornée par le quota Gemini du jour** (`quotaGeminiRestant`) :
  // quelques analyses par nuit, sans jamais dépasser le palier gratuit. Une
  // fois le quota épuisé, la suite est reprise la nuit suivante.
  const regeneration = await regenererAnalysesAnciennes();
  const regenerees =
    regeneration.extraites + regeneration.incompletes + regeneration.echecs;

  revalidatePath("/dashboard/juriste/veille");
  return NextResponse.json({
    ok: true,
    totalRetenues: res.totalRetenues,
    sources: res.sources,
    regeneration: { regenerees, quotaAtteint: regeneration.quotaAtteint },
    message: `${res.totalRetenues} publication(s) pertinente(s) ajoutée(s) à la veille ; ${regenerees} analyse(s) régénérée(s) au format Veille 2.0.`,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
