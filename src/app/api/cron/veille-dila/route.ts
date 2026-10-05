import { NextResponse } from "next/server";
import { verifierSecretCron } from "@/lib/cron-auth";
import { revalidatePath } from "next/cache";
import { executerVeilleDila } from "@/lib/veille-ingestion";

/**
 * Veille juridique automatique (auto-alimentation §H) : télécharge les
 * nouvelles publications officielles DILA (JADE quotidien, CASS
 * hebdomadaire, JORF quotidien), ne conserve que celles qui sont pertinentes
 * pour la contestation d'amendes routières, et les dépose en lecture dans
 * l'espace « Veille juridique ».
 *
 * Appelé quotidiennement (Vercel Cron). Uniquement de la **matière sourcée**
 * est remontée : métadonnées, liens Légifrance et citations littérales. Aucune
 * faille n'est créée ni activée ici — la promotion en proposition de faille
 * est une décision humaine.
 *
 * Hors dev, `CRON_SECRET` est requis (header `Authorization: Bearer <secret>`).
 * `?sources=JADE,CASS` permet de restreindre l'exécution (utile en test).
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

  const url = new URL(req.url);
  const filtre = url.searchParams.get("sources");
  const res = await executerVeilleDila(filtre ? new Set(filtre.split(",")) : undefined);

  revalidatePath("/dashboard/juriste/veille");
  return NextResponse.json({
    ok: true,
    totalRetenues: res.totalRetenues,
    sources: res.sources,
    message: `${res.totalRetenues} publication(s) pertinente(s) ajoutée(s) à la veille.`,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
