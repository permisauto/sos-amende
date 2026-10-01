/**
 * Accès dev/debug — opt-in explicite.
 *
 * Les routes d'accès provisoire (/api/dev/login, /api/debug/env,
 * /api/debug/config) et le bypass `?dev=1`/cookie `dev_login` du proxy sont
 * désactivés par défaut : ils ne répondent QUE si
 *   - NODE_ENV !== "production" (jamais en build prod réel/de preview), ET
 *   - ENABLE_DEV_LOGIN === "1" (opt-in explicite, cf. .env.example).
 * En E2E (build prod local), ces routes restent inactives : les specs passent
 * par le magic-link fichier (AUTH_DEV_FILE), pas par dev_login.
 */

export function devLoginEnabled(): boolean {
  return process.env.ENABLE_DEV_LOGIN === "1";
}

export function isNonProduction(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Les trois routes dev/debug + le bypass proxy répondent seulement si vrai. */
export function devAccessEnabled(): boolean {
  return isNonProduction() && devLoginEnabled();
}

/**
 * Vraie production (Vercel) : NODE_ENV=production SANS l'opt-in E2E
 * (AUTH_DEV_FILE=1 + ANTAI_MOCK=1, réservé aux suites Playwright locales).
 */
export function isRealProduction(): boolean {
  const e2eOptIn = process.env.AUTH_DEV_FILE === "1" && process.env.ANTAI_MOCK === "1";
  return process.env.NODE_ENV === "production" && !e2eOptIn;
}