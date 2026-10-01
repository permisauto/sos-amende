import { NextResponse } from "next/server";
import { devAccessEnabled } from "@/lib/dev-access";

/**
 * OUTIL DE DÉBOGAGE — réservé aux environnements non-production AVEC opt-in
 * explicite (ENABLE_DEV_LOGIN=1). Expose le host et une URL de base masquée
 * (jamais le mot de passe). En production ou sans opt-in, toujours 404 :
 * éviter toute fuite d'infrastructure.
 */
export async function GET() {
  if (!devAccessEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = process.env.DATABASE_URL ?? "";
  const masked = url.replace(/:[^@]+@/, ":***@");
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "invalid";
    }
  })();
  return NextResponse.json({ host, masked, env: process.env.VERCEL_ENV ?? "unknown" });
}