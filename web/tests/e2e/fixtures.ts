import { expect, type Page } from "@playwright/test";
import { E2E_PASSWORDS } from "../../playwright.config";

/** Logins created by backend/seed.py, with the passwords playwright.config sets. */
export const ACCOUNTS = {
  buyer: { email: "alice@example.com", password: E2E_PASSWORDS.buyer, name: "Alice" },
  seller: { email: "jordan@example.com", password: E2E_PASSWORDS.seller, name: "Jordan" },
  admin: { email: "admin@example.com", password: E2E_PASSWORDS.admin, name: "Platform" },
} as const;

export async function signIn(page: Page, who: keyof typeof ACCOUNTS, next?: string) {
  const account = ACCOUNTS[who];
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "__Host-cl_session");
}

export async function expectSignedOutHeader(page: Page) {
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}
