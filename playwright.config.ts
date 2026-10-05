import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Toutes les specs partagent UN serveur Next et un seul compte client : la
  // concurrence produit des échecs "toBeVisible" aléatoires (les échecs
  // changent d'un run à l'autre et les tests passent en isolation). Un retry
  // absorbe cette contention sans masquer une vraie régression.
  retries: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.cjs",
  use: {
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      OCR_PROVIDER: "mock",
      // Vérification des failles : IA simulée (suggestions mock tracées) —
      // le bouton « Analyse approfondie (IA) » reste visible sans clé Gemini.
      VERIF_IA_PROVIDER: "mock",
      ANTAI_MOCK: "1",
      ANTAI_MOCK_TOKEN: "dev-antai-mock",
      AUTH_DEV_FILE: "1",
      // Suivi automatique des décisions (E2E) : seuil 0 j pour éligibilité
      // immédiate + secret nécessaire au cron/recuperations-decisions.
      DECISION_WAIT_JOURS: "0",
      CRON_SECRET: "e2e-cron-secret",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      // .env.local (généré par Vercel CLI) contient des placeholders
      // "[SENSITIVE]" qui écrasent .env. On force les vraies valeurs locales
      // ici pour que le webServer E2E utilise la base locale et le magic-link
      // fichier (jamais un envoi Resend réel ni une base distante).
      DATABASE_URL:
        "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public",
      AUTH_SECRET:
        "c4c20937e922991530156f61e810e13aedd4e7f874299859",
      AUTH_RESEND_KEY: "",
      EMAIL_FROM: "SOS Amende <onboarding@resend.dev>",
    },
  },
});