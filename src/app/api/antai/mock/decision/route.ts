import { NextResponse } from "next/server";

// Le mock ne doit JAMAIS être exposé en production : il exige un opt-in
// explicite (ANTAI_MOCK=1), utilisé uniquement par les E2E (build prod local).
const MOCK_ACTIF =
  process.env.NODE_ENV !== "production" || process.env.ANTAI_MOCK === "1";
// Token sans valeur par défaut en prod ; en dev (npm run dev), défaut local.
const DEV_TOKEN =
  process.env.ANTAI_MOCK_TOKEN ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-antai-mock");

/**
 * Décision OMP simulée (GET /api/antai/mock/decision) : retourne une décision
 * déterministe à partir du numéro de PV (parité du hash des code points) —
 * utilisée par le cron /api/cron/recuperations-decisions (mode mock).
 * `encours=1` simule une décision pas encore rendue (tests). Jamais exposé en
 * production sauf opt-in explicite ANTAI_MOCK=1 (réservé aux E2E).
 */
export async function GET(req: Request) {
  if (!MOCK_ACTIF) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 404 });
  }
  if (!DEV_TOKEN) {
    return NextResponse.json(
      { error: "ANTAI_MOCK_TOKEN non configuré" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  if (url.searchParams.get("token") !== DEV_TOKEN) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }
  const numPv = url.searchParams.get("numPv");
  if (!numPv) {
    return NextResponse.json({ error: "numPv requis" }, { status: 400 });
  }

  if (url.searchParams.get("encours") === "1") {
    return NextResponse.json({
      ok: true,
      statut: "ENCOURS",
      reponsePortail:
        "Requête transmise — décision en cours d'instruction (portail simulé).",
    });
  }

  const hash = [...numPv].reduce((acc, c) => acc + (c.codePointAt(0) ?? 0), 0);
  const accepte = hash % 2 === 0;
  return NextResponse.json({
    ok: true,
    statut: "DECISION",
    decision: accepte ? "ACCEPTE" : "REJETE",
    detail: accepte
      ? "Requête acceptée (amende annulée)"
      : "Requête rejetée (décision motivée)",
    reponsePortail: accepte
      ? "Décision de l'OMP : requête acceptée (portail simulé)."
      : "Décision de l'OMP : requête rejetée (portail simulé).",
  });
}