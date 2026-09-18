import { NextResponse } from "next/server";

/** Jamais de cache : cette route lit les variables ENVIRONNEMENT au moment de
 * la requête (les GET App Router sont sinon prégénérées au build). */
export const dynamic = "force-dynamic";

/**
 * OUTIL DE DIAGNOSTIC CONFIG — ne révèle AUCUNE valeur secrète, uniquement
 * des booléens/mode. Répond 404 hors production réelle pour limiter l'usure.
 */
export async function GET() {
  const real = process.env.NODE_ENV === "production" && process.env.AUTH_DEV_FILE !== "1";
  if (!real) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ocr_snapshot = {
    raw: process.env.OCR_PROVIDER ?? "(vide)",
    gemini_key_set: Boolean(process.env.GEMINI_API_KEY),
    mistral_key_set: Boolean(process.env.MISTRAL_API_KEY),
    vision_key_set: Boolean(process.env.GOOGLE_VISION_KEY),
    provider: (() => {
      const raw = (process.env.OCR_PROVIDER ?? "").toLowerCase();
      if (raw === "tesseract") return "tesseract";
      if (raw === "mock") return "mock";
      if (raw === "mistral-ocr") return process.env.MISTRAL_API_KEY ? "mistral-ocr" : "aucun";
      if (raw === "google-vision") return process.env.GOOGLE_VISION_KEY ? "google-vision" : "aucun";
      if (raw === "gemini-flash") return process.env.GEMINI_API_KEY ? "gemini-flash" : "aucun";
      if (raw === "") return "aucun";
      return "inconnu";
    })(),
  };

  const storage_snapshot = {
    driver: process.env.STORAGE_DRIVER ?? "(vide)",
    bucket_set: Boolean(process.env.STORAGE_BUCKET),
    endpoint_set: Boolean(process.env.STORAGE_ENDPOINT),
    access_key_set: Boolean(process.env.STORAGE_ACCESS_KEY),
    secret_key_set: Boolean(process.env.STORAGE_SECRET_KEY),
    region_set: Boolean(process.env.STORAGE_REGION),
  };

  return NextResponse.json(
    {
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "dev",
      vercel: process.env.VERCEL_URL ?? null,
      horodatage: new Date().toISOString(),
      ocr: ocr_snapshot,
      storage: storage_snapshot,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}