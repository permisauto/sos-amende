import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
  // Bypass dev RÉSERVÉ aux environnements non-prod (dev/E2E) : déploie une
  // identité locale selon la route (/admin → ADMIN). En production, le param
  // `?dev=1` et le cookie `dev_login` sont ignorés — accès uniquement par le
  // magic-link Resend réel.
  const isDevEnv = process.env.NODE_ENV !== "production";
  const hasDevParam = isDevEnv && nextUrl.searchParams.get("dev") === "1";
  const hasDevCookie = isDevEnv && !!req.cookies.get("dev_login")?.value;
  const isDevBypass = hasDevParam || hasDevCookie;

  if (isDevBypass && isOnDashboard) {
    const res = NextResponse.next();
    if (hasDevParam) {
      const devEmail = nextUrl.pathname.includes("/admin")
        ? "e2e-admin@test.local"
        : nextUrl.pathname.includes("/juriste")
          ? "e2e-juriste@test.local"
          : "e2e-client@test.local";
      res.cookies.set("dev_login", devEmail, { httpOnly: false, maxAge: 3600, path: "/" });
    }
    return res;
  }

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (isLoggedIn && nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
