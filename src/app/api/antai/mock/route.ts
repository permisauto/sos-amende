import { NextResponse } from "next/server";
import { generatePreuvePdf } from "@/lib/preuve-pdf";
import { storageWrite } from "@/lib/storage";

// Le mock ne doit JAMAIS être exposé en production : il exige un opt-in
// explicite (ANTAI_MOCK=1), utilisé uniquement par les E2E (build prod local).
const MOCK_ACTIF =
  process.env.NODE_ENV !== "production" || process.env.ANTAI_MOCK === "1";
// Token sans valeur par défaut en prod ; en dev (npm run dev), défaut local.
const DEV_TOKEN =
  process.env.ANTAI_MOCK_TOKEN ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-antai-mock");

/**
 * Portail ANTAI MOCK (développement/E2E uniquement — garde-fou produit).
 * Simule la réception d'une requête en exonération et émet un accusé de dépôt.
 * Ne jamais brancher ce mock sur le portail réel. Inaccessible en production
 * sauf opt-in explicite ANTAI_MOCK=1 (réservé aux tests E2E).
 */
export async function POST(req: Request) {
  if (!MOCK_ACTIF) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 404 },
    );
  }
  if (!DEV_TOKEN) {
    return NextResponse.json(
      { error: "ANTAI_MOCK_TOKEN non configuré" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (body.token !== DEV_TOKEN) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }
  if (typeof body.numPv !== "string" || !body.numPv) {
    return NextResponse.json({ error: "numPv requis" }, { status: 400 });
  }

  const organisme =
    typeof body.organisme === "string" && body.organisme
      ? body.organisme
      : "ANTAI";
  const prefix =
    organisme.toLowerCase().includes("télérecours") ||
    organisme.toLowerCase().includes("telerecours")
      ? "TELER"
      : "ANTAI";
  const numeroDepot = `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  const dateDepot = new Date().toISOString();

  const preuveName = `preuves/preuve-${Date.now()}.pdf`;

  const preuves = Array.isArray(body.preuves)
    ? body.preuves
        .filter(
          (p): p is { nom: string } =>
            typeof p === "object" &&
            p !== null &&
            typeof (p as { nom?: unknown }).nom === "string",
        )
        .map((p) => p.nom)
    : [];

  const pdf = await generatePreuvePdf({
    numeroDepot,
    dateDepot,
    numPv: String(body.numPv),
    plaque: typeof body.plaque === "string" ? body.plaque : undefined,
    type: typeof body.type === "string" ? body.type : undefined,
    nom: typeof body.nom === "string" ? body.nom : undefined,
    organisme,
    preuves,
  });
  const preuveUrl = await storageWrite(preuveName, pdf);

  return NextResponse.json({
    ok: true,
    numeroDepot,
    dateDepot,
    preuveUrl,
  });
}