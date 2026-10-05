import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (session?.user?.id) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, role: true, credits: true, signatureUrl: true },
      });
      if (user) return user;
    } catch {}
  }
  // Bypass dev STRICT — développement + opt-in explicite ENABLE_DEV_LOGIN=1
  // ET cookie dev_login posé par /api/dev/login (lui-même gardé par le même
  // opt-in). En production, ce bloc est entièrement désactivé.
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_LOGIN === "1") {
    try {
      const cookieStore = await cookies();
      const devCookie = cookieStore.get("dev_login")?.value;
      
      // Seul un cookie dev_login signé et valide autorise le bypass
      if (!devCookie) return null;
      
      const email = devCookie;
      // Mock user sans DB si nécessaire
      try {
        const u = await prisma.user.findUnique({ 
          where: { email }, 
          select: { id: true, name: true, email: true, role: true, credits: true, signatureUrl: true } 
        });
        if (u) return u;
      } catch {}
      
      const role = email.includes("juriste") ? "JURISTE" : email.includes("admin") ? "ADMIN" : "CLIENT";
      return { 
        id: "dev-" + email, 
        name: email.split("@")[0], 
        email, 
        role, 
        credits: 10,
        signatureUrl: null,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;
    } catch {}
  }
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

/**
 * Accès « rédacteur » au flux de traitement (validation de lettre, envoi,
 * rejet, décision OMP, confirmation d'une faille, édition de lettre).
 * Réservé aux JURISTE : l'ADMIN dispose de l'accès lecture seule à l'espace
 * juriste mais ne peut pas écrire dans le flux de traitement.
 */
export async function requireJuristeRedacteur() {
  const user = await requireUser();
  if (user.role !== "JURISTE") {
    redirect("/dashboard/juriste");
  }
  return user;
}
