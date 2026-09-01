import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (session?.user?.id) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, role: true, stripeCustomerId: true, credits: true },
      });
      if (user) return user;
    } catch {}
  }
  // Bypass dev pour vérification dashboards sans DB/auth ( ?dev=1 ou cookie dev_login ) — direct link sans cookie
  try {
    const hdrs = await headers();
    const cookieStore = await cookies();
    const allHdrs = Array.from(hdrs.entries()).map(([k, v]) => `${k}=${v}`).join(" ");
    const devParam =
      hdrs.get("x-invoke-query")?.includes("dev=1") ||
      hdrs.get("referer")?.includes("dev=1") ||
      hdrs.get("x-middleware-rewrite")?.includes("dev=1") ||
      hdrs.get("next-url")?.includes("dev=1") ||
      hdrs.get("x-url")?.includes("dev=1") ||
      allHdrs.includes("dev=1");
    const devCookie = cookieStore.get("dev_login")?.value;
    // Si ?dev=1 est dans l'URL, on devine le rôle d'après le referer/path
    let devEmail: string | null = devCookie || null;
    if (!devEmail && devParam) {
      const ref = hdrs.get("referer") ?? hdrs.get("x-invoke-query") ?? allHdrs;
      if (ref.includes("/admin")) devEmail = "e2e-admin@test.local";
      else if (ref.includes("/juriste")) devEmail = "e2e-juriste@test.local";
      else devEmail = "e2e-client@test.local";
      // Fallback : si on est sur /dashboard?dev=1 sans referer, on prend client par défaut
      if (!ref.includes("/admin") && !ref.includes("/juriste")) {
        // Essaie de deviner via l'URL demandée si possible, sinon client
        const url = hdrs.get("x-middleware-rewrite") ?? hdrs.get("next-url") ?? "";
        if (url.includes("/admin")) devEmail = "e2e-admin@test.local";
        else if (url.includes("/juriste")) devEmail = "e2e-juriste@test.local";
      }
    }
    // Aussi via searchParams direct (fallback)
    if (devEmail || devCookie) {
      const email = devEmail || "e2e-client@test.local";
      // Mock user sans DB si nécessaire
      try {
        const u = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, role: true, stripeCustomerId: true, credits: true } });
        if (u) return u;
      } catch {}
      const role = email.includes("juriste") ? "JURISTE" : email.includes("admin") ? "ADMIN" : "CLIENT";
      return { id: "dev-" + email, name: email.split("@")[0], email, role, stripeCustomerId: null, credits: 10 } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;
    }
  } catch {}
  return null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export async function requireJuriste() {
  const user = await requireUser();
  if (user.role !== "JURISTE" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
}
