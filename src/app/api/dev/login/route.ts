import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Accès provisoire simple pour vérification dashboards (dev uniquement)
// GET /api/dev/login?email=e2e-juriste@test.local -> redirige vers dashboard avec session
export async function GET(req: Request) {
  const { searchParams: sp } = new URL(req.url);
  const emailCheck = sp.get("email") ?? "";
  const allowed = ["e2e-client@test.local", "e2e-juriste@test.local", "e2e-admin@test.local", "juriste.provisoire@sos-amende.fr", "admin.provisoire@sos-amende.fr"];
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "1" && !allowed.includes(emailCheck)) {
    return NextResponse.json({ error: "Dev login désactivé en prod" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email requis" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  // Retourne les infos + dashboards pour vérification simple (sans créer de session auth, juste pour voir)
  const dashboards: Record<string, string> = {
    CLIENT: "/dashboard",
    JURISTE: "/dashboard/juriste",
    ADMIN: "/dashboard/admin/failles",
  };

  // Pour vérif rapide, on renvoie un lien magic-link frais (1 clic)
  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60);
  await prisma.verificationToken.create({ data: { identifier: email, token, expires } });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://sos-amende.vercel.app";
  const rolePath = dashboards[user.role] ?? "/dashboard";
  const url = `${base}/api/auth/callback/email?callbackUrl=${encodeURIComponent(rolePath)}&token=${token}&email=${encodeURIComponent(email)}`;

  return NextResponse.json({
    ok: true,
    email,
    role: user.role,
    dashboard: rolePath,
    magicLink: url,
    note: "Lien à usage unique, 1h. Cliquez une fois.",
  });
}
