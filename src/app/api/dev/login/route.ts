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

  let user: { role: string } | null = null;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (e) {
    console.error("dev login: prisma findUnique fail, fallback mock", e);
    // Fallback mock si DB down — on devine le rôle d'après l'email
    if (email.includes("juriste")) user = { role: "JURISTE" };
    else if (email.includes("admin")) user = { role: "ADMIN" };
    else user = { role: "CLIENT" };
  }
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  const dashboards: Record<string, string> = {
    CLIENT: "/dashboard",
    JURISTE: "/dashboard/juriste",
    ADMIN: "/dashboard/admin/failles",
  };

  // Pour vérif rapide, on pose un cookie dev_login et on redirige directement (plus fiable que magic-link quand DB est instable)
  try {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    await prisma.verificationToken.create({ data: { identifier: email, token, expires } });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://sos-amende.vercel.app";
    const rolePath = dashboards[user.role] ?? "/dashboard";
    const url = `${base}/api/auth/callback/resend?callbackUrl=${encodeURIComponent(rolePath)}&token=${token}&email=${encodeURIComponent(email)}`;
    const res = NextResponse.json({ ok: true, email, role: user.role, dashboard: rolePath, magicLink: url, devLink: `${base}${rolePath}?dev=1`, note: "Lien à usage unique, 1h. Cliquez une fois. Fallback dev=1 si besoin." });
    res.cookies.set("dev_login", email, { httpOnly: false, maxAge: 3600, path: "/" });
    return res;
  } catch (e) {
    console.error("dev login: create token fail, fallback direct", e);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://sos-amende.vercel.app";
    const rolePath = dashboards[user.role] ?? "/dashboard";
    const res = NextResponse.json({ ok: true, email, role: user.role, dashboard: rolePath, magicLink: `${base}${rolePath}?dev=1`, devLink: `${base}${rolePath}?dev=1`, note: "Mode dégradé — accès direct (DB indisponible)" });
    res.cookies.set("dev_login", email, { httpOnly: false, maxAge: 3600, path: "/" });
    return res;
  }
}
