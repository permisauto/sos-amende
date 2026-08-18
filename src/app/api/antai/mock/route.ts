import { NextResponse } from "next/server";
import { generatePreuvePdf } from "@/lib/preuve-pdf";
import { storageWrite } from "@/lib/storage";

const DEV_TOKEN = process.env.ANTAI_MOCK_TOKEN ?? "dev-antai-mock";

/**
 * Portail ANTAI MOCK (développement/E2E uniquement — garde-fou produit).
 * Simule la réception d'une requête en exonération et émet un accusé de dépôt.
 * Ne jamais brancher ce mock sur le portail réel.
 */
export async function POST(req: Request) {
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

  const numeroDepot = `ANTAI-${Date.now().toString(36).toUpperCase()}`;
  const dateDepot = new Date().toISOString();

  const preuveName = `preuves/preuve-${Date.now()}.pdf`;

  const pdf = await generatePreuvePdf({
    numeroDepot,
    dateDepot,
    numPv: String(body.numPv),
    plaque: typeof body.plaque === "string" ? body.plaque : undefined,
    type: typeof body.type === "string" ? body.type : undefined,
    nom: typeof body.nom === "string" ? body.nom : undefined,
  });
  const preuveUrl = await storageWrite(preuveName, pdf);

  return NextResponse.json({
    ok: true,
    numeroDepot,
    dateDepot,
    preuveUrl,
  });
}