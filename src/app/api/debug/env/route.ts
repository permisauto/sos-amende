import { NextResponse } from "next/server";
export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  // Masque le password
  const masked = url.replace(/:[^@]+@/, ":***@");
  const host = (() => { try { return new URL(url).host; } catch { return "invalid"; } })();
  return NextResponse.json({ host, masked, env: process.env.VERCEL_ENV ?? "unknown" });
}
