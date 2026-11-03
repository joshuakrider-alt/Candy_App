import { defineConfig, devices } from "@playwright/test";

// The cold-start tests: the site as it is when the API was asleep while the
// site was being built, which is what Render's free tier does to beta. Built
// into .next-cold by `npm run test:e2e:cold` with FLASK_API_URL pointing at a
// port nothing listens on, and served the same way, so the server never gets
// a shop list. Each test answers the browser's own /api/flask/shops call.

const WEB_PORT = 3056;

export default defineConfig({
  testDir: "./tests/cold",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
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
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}/about`,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: ".next-cold", FLASK_API_URL: "http://127.0.0.1:5999" },
  },
});
