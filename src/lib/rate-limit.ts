/**
 * Rate limiting simple en mémoire (best-effort, une instance) :
 * fenêtre glissante d'essais par clé (email, IP, etc.). Suffisant pour
 * freiner l'abus des magic-links et de l'API démo publique. En multi-instance
 * (prod serverless), chaque instance garde son propre compteur — garde-fou
 * complémentaire, pas un contrôle absolu.
 */

const fenetres = new Map<string, number[]>();

function nettoyer(key: string, windowMs: number): number[] {
  const now = Date.now();
  const recents = (fenetres.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recents.length === 0) fenetres.delete(key);
  return recents;
}

/**
 * Tente de consommer un créneau pour une clé. Retourne le nombre d'essais
 * restants (>= 0). max = nombre max d'essais dans windowMs.
 */
export function consommerCreneau(
  key: string,
  max: number,
  windowMs: number,
): number {
  const recents = nettoyer(key, windowMs);
  if (recents.length >= max) return 0;
  recents.push(Date.now());
  fenetres.set(key, recents);
  return max - recents.length;
}

/** Nombre d'essais restants sans consommer (0 = bloqué). */
export function essaisRestants(key: string, max: number, windowMs: number): number {
  const recents = nettoyer(key, windowMs);
  return Math.max(0, max - recents.length);
}