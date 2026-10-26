import { defineConfig, devices } from "@playwright/test";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(__dirname, ".env.e2e") });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Plus de retries : les tests sont isolés (comptes uniques par test).
  // Si un test flaky persiste, on l'investigue au lieu de le masquer.
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.cjs",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3200",
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
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3200",
      OCR_PROVIDER: process.env.OCR_PROVIDER ?? "mock",
      VERIF_IA_PROVIDER: process.env.VERIF_IA_PROVIDER ?? "mock",
      SIRET_PROVIDER: process.env.SIRET_PROVIDER ?? "mock",
      ANTAI_MOCK: process.env.ANTAI_MOCK ?? "1",
      ANTAI_MOCK_TOKEN: process.env.ANTAI_MOCK_TOKEN ?? "dev-antai-mock",
      AUTH_DEV_FILE: process.env.AUTH_DEV_FILE ?? "1",
      DECISION_WAIT_JOURS: process.env.DECISION_WAIT_JOURS ?? "0",
      CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "68b5a2e6257945782e27191e1804ab8785867a6818484cfe88ad95c856c3c7e9",
      AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY ?? "",
      EMAIL_FROM: process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>",
    },
  },
});