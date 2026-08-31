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
      NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      OCR_PROVIDER: "mock",
      STRIPE_MOCK: "1",
      ANTAI_MOCK: "1",
      ANTAI_MOCK_TOKEN: "dev-antai-mock",
      AUTH_DEV_FILE: "1",
      DATABASE_URL:
        "postgres://postgres.fpxkamkheqbsrroqkcfy:5nAofsa7J7a8Vbbs@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
  },
});