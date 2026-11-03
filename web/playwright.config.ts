import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the real site against a real Flask API on a throwaway
// SQLite database seeded with the demo shops and logins (backend/seed.py).
// Nothing here talks to staging, production or Stripe.

const WEB_PORT = 3055;
const API_PORT = 5055;
// Must match tests/e2e/api-server.sh, which seeds these.
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
      // Web CI starts this before `next build`, so it is reused there.
      command: "sh tests/e2e/api-server.sh",
      url: `http://127.0.0.1:${API_PORT}/config`,
      reuseExistingServer: true,
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
