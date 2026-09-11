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
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      OCR_PROVIDER: "mock",
      STRIPE_MOCK: "1",
      ANTAI_MOCK: "1",
      ANTAI_MOCK_TOKEN: "dev-antai-mock",
      AUTH_DEV_FILE: "1",
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