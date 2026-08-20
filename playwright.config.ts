import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // La soumission ANTAI (mock) s'appelle elle-même via l'URL publique :
      // le port 3000 peut être occupé par une autre app, on cible le 3200.
      NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      // OCR de dev : pré-remplit le formulaire d'analyse (verrouillé par la
      // relecture humaine avant toute génération de lettre).
      OCR_PROVIDER: "mock",
      // Paiement de dev : checkout Stripe simulé (portail /mock-stripe).
      STRIPE_MOCK: "1",
      // Mock ANTAI (garde-fou) : opt-in explicite pour les E2E — le build prod
      // local expose le mock uniquement si ANTAI_MOCK=1 (et le token est fourni).
      ANTAI_MOCK: "1",
      ANTAI_MOCK_TOKEN: "dev-antai-mock",
      // Magic-links dev : en build prod (next start), le fallback fichier doit
      // être explicitement autorisé pour les E2E (AUTH_DEV_FILE=1).
      AUTH_DEV_FILE: "1",
    },
  },
});