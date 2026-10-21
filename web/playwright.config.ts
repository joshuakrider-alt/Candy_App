import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the real site against a real Flask API on a throwaway
// SQLite database seeded with the demo shops and logins (backend/seed.py).
// Nothing here talks to staging, production or Stripe.

const WEB_PORT = 3055;
const API_PORT = 5055;
const python = process.env.PYTHON ?? "python3";
const db = process.env.E2E_DATABASE ?? "/tmp/candy-lady-e2e.db";

export const E2E_PASSWORDS = {
  admin: "e2e-admin-password",
  seller: "e2e-seller-password",
  buyer: "e2e-buyer-password",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "laptop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `rm -f ${db} && ${python} manage.py seed-demo && ${python} -m flask --app app run --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/config`,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: `sqlite:///${db}`,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        PUBLIC_SITE_URL: `http://localhost:${WEB_PORT}`,
        SEED_ADMIN_PASSWORD: E2E_PASSWORDS.admin,
        SEED_SELLER_PASSWORD: E2E_PASSWORDS.seller,
        SEED_BUYER_PASSWORD: E2E_PASSWORDS.buyer,
      },
    },
    {
      // A production build, so the cookie is the real __Host- one and the
      // Content Security Policy is the one beta serves.
      command: `npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/about`,
      reuseExistingServer: !process.env.CI,
      env: { FLASK_API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
