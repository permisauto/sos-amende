import { headers } from "next/headers";

/**
 * Origine accessible de l'app courante : hôte de la requête en vol
 * (x-forwarded-proto/host → correct en dev sur n'importe quel port `-p`, comme
 * en prod derrière un proxy), sinon repli sur NEXT_PUBLIC_APP_URL. `headers()`
 * hors cadre requête (tests, CLI) est capturé → repli env au lieu d'un crash.
 */
export async function baseUrlApp(repli = "http://localhost:3000"): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (process.env.NODE_ENV === "production" ? "https" : "http");
      return `${proto}://${host}`;
    }
  } catch {
    // Absence de contexte requête (tests, CLI).
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? repli;
}