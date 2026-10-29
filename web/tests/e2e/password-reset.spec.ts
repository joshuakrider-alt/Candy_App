import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, sessionCookie } from "./fixtures";

// The test API runs with reset emails off (as staging does until Resend is
// set up), so these check that it fails safe, and plant a token straight in
// the test database to walk the rest of the flow the way an emailed link would.

const DATABASE = process.env.E2E_DATABASE ?? "/tmp/candy-lady-e2e.db";
const PYTHON = process.env.PYTHON ?? "python3";

/** Store a reset token for `email` the way password_reset.py does: only its SHA-256. */
function plantToken(email: string, minutesLeft = 60) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const script = `
import sqlite3, sys
from datetime import datetime, timedelta, timezone
db, email, token_hash, minutes = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
now = datetime.now(timezone.utc).replace(tzinfo=None)
con = sqlite3.connect(db)
(user_id,) = con.execute("SELECT id FROM user WHERE email = ?", (email,)).fetchone()
con.execute(
    "INSERT INTO password_reset_token (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
    (user_id, token_hash, now.isoformat(" "), (now + timedelta(minutes=minutes)).isoformat(" ")),
)
con.commit()
`;
  execFileSync(PYTHON, ["-c", script, DATABASE, email, hash, String(minutesLeft)]);
  return token;
}

async function signUp(page: Page, password: string) {
  const email = `reset-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Reset Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/shops");
  await page.context().clearCookies();
  return email;
}

async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("the sign-in page links to Forgot password", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL("**/forgot-password");
  await expect(page.getByText("Forgot your password?", { exact: true })).toBeVisible();
});

test("with reset emails off, every address gets the same safe answer", async ({ page }) => {
  for (const email of [ACCOUNTS.buyer.email, "nobody-has-this@example.com"]) {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Password reset emails aren't switched on yet.", { exact: false })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "hello@neighborhoodcandylady.com" })).toBeVisible();
  }
});

test("a reset link sets a new password once, and the old one stops working", async ({ page }) => {
  const email = await signUp(page, "the-old-password");
  const token = plantToken(email);

  await page.goto(`/reset-password#token=${token}`);
  await expect(page.getByText("Choose a new password", { exact: true })).toBeVisible();
  // The token is cleared from the address bar once read.
  await expect.poll(() => new URL(page.url()).hash).toBe("");

  await page.getByLabel("New password").fill("the-new-password");
  await page.getByLabel("Type it again").fill("the-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password is updated.")).toBeVisible();

  await signInWith(page, email, "the-old-password");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await signInWith(page, email, "the-new-password");
  await page.waitForURL("**/shops");
  expect(await sessionCookie(page)).toBeDefined();
  await page.context().clearCookies();

  // Single use: the same link is refused the second time.
  await page.goto(`/reset-password#token=${token}`);
  await page.getByLabel("New password").fill("a-third-password");
  await page.getByLabel("Type it again").fill("a-third-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("This reset link is invalid or has expired", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a new link" })).toBeVisible();
});

test("an expired link is refused", async ({ page }) => {
  const email = await signUp(page, "the-old-password");
  const token = plantToken(email, -1);
  await page.goto(`/reset-password#token=${token}`);
  await page.getByLabel("New password").fill("the-new-password");
  await page.getByLabel("Type it again").fill("the-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("This reset link is invalid or has expired", { exact: false })).toBeVisible();
  await signInWith(page, email, "the-old-password");
  await page.waitForURL("**/shops");
});

test("mismatched passwords and a link with no token are caught", async ({ page }) => {
  await page.goto("/reset-password#token=whatever");
  await page.getByLabel("New password").fill("password-one");
  await page.getByLabel("Type it again").fill("password-two");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByText("This reset link is missing its code.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a new reset link" })).toBeVisible();
});
