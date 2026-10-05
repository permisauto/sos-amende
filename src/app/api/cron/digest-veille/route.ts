import { NextResponse } from "next/server";
import { verifierSecretCron } from "@/lib/cron-auth";
import { sourcesNouvelles } from "@/lib/veille-ingestion";
import { notifierDigestVeille } from "@/lib/notifications";

/**
 * Digest hebdomadaire de la veille juridique : un e-mail récapitulatif aux
 * juristes et administrateurs listant les publications pertinentes de la
 * semaine, avec lien vers la source primaire sur Légifrance.
 *
 * Volontairement **hebdomadaire** et non quotidien : le Journal officiel paraît
 * tous les jours, une alerte par jour n'est pas actionnable. Appelé par Vercel
 * Cron le lundi matin. Ne fait rien s'il n'y a rien de nouveau.
 *
 * Hors dev, `CRON_SECRET` est requis (header `Authorization: Bearer <secret>`).
 * `?jours=14` élargit la fenêtre.
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
  const jours = Number(url.searchParams.get("jours") ?? 7);

  const lignes = await sourcesNouvelles(jours);
  if (lignes.length === 0) {
    return NextResponse.json({ ok: true, envoye: false, message: "Rien de nouveau." });
  }

  const envoye = await notifierDigestVeille({ lignes, jours });
  return NextResponse.json({
    ok: true,
    envoye,
    publications: lignes.length,
    message: `${lignes.length} publication(s) dans le digest de ${jours} jours.`,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
