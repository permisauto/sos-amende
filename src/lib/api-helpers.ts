/**
 * Helpers de sécurité partagés pour les API routes.
 *
 * apiErrorMessage : retourne un message générique en prod (pour ne pas exposer
 * les détails Prisma/interne à un attaquant), le vrai message en dev.
 */
export function apiErrorMessage(err: unknown): string {
  if (process.env.NODE_ENV === "production") return "Erreur interne";
  return err instanceof Error ? err.message : "Erreur inconnue";
}
