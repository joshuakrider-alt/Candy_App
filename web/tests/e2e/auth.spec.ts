import { expect, test } from "@playwright/test";
import { ACCOUNTS, expectSignedOutHeader, sessionCookie, signIn } from "./fixtures";

// Testing and acceptance flows 1, 2 and the parts of 12 that exist on Day 1.

test.describe("flow 1: sign up, sign in, sign out", () => {
  test("sign-in keeps the token in an httpOnly cookie, never in localStorage", async ({ page }) => {
    await signIn(page, "buyer");
    await page.waitForURL("**/shops");

    const cookie = await sessionCookie(page);
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  test("each role lands on its own home", async ({ page }) => {
    await signIn(page, "seller");
    await page.waitForURL("**/seller");
    await page.context().clearCookies();
    await signIn(page, "admin");
    await page.waitForURL("**/admin");
  });

  test("a `next` page wins, but only when it is on this site", async ({ page }) => {
    await signIn(page, "buyer", "/faq");
    await page.waitForURL("**/faq");
    await page.context().clearCookies();
    await signIn(page, "buyer", "//evil.example/steal");
    await page.waitForURL("**/shops");
  });

  test("a wrong password shows Flask's message and sets no cookie", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.buyer.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    expect(await sessionCookie(page)).toBeUndefined();
  });

  test("sign up makes a buyer and signs them in", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Test Buyer");
    await page.getByLabel("Email").fill(`buyer-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("a-long-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/shops");
    expect(await sessionCookie(page)).toBeDefined();
  });

  test("signing out removes the cookie and returns to the sign-in screen", async ({ page }) => {
    await signIn(page, "buyer");
    await page.waitForURL("**/shops");
    await page.goto("/faq");
    await page.getByRole("button", { name: ACCOUNTS.buyer.name }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    expect(await sessionCookie(page)).toBeUndefined();
    await page.goto("/faq");
    await expectSignedOutHeader(page);
  });
});

test("flow 2: an expired or forged token reads as signed out and is dropped", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "__Host-cl_session",
      value: "not-a-real-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/faq");
  await expectSignedOutHeader(page);
  expect(await sessionCookie(page)).toBeUndefined();
});

test.describe("flow 12: permissions and forgery", () => {
  test("signed-in pages send a visitor without a session to sign in", async ({ page }) => {
    for (const path of ["/account/orders", "/seller/inventory", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    }
  });

  test("a write with another site's Origin gets 403", async ({ page, request }) => {
    await signIn(page, "buyer");
    await page.waitForURL("**/shops");
    const cookie = (await sessionCookie(page))!;
    const headers = { cookie: `${cookie.name}=${cookie.value}`, "content-type": "application/json" };

    const forged = await request.post("/api/flask/orders", { headers: { ...headers, origin: "https://evil.example" }, data: {} });
    expect(forged.status()).toBe(403);
    const noOrigin = await request.post("/api/auth/logout", { headers });
    expect(noOrigin.status()).toBe(403);
  });

  test("?api= in a URL changes nothing", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => calls.push(r.url()));
    await page.goto("/login?api=https://evil.example");
    await signIn(page, "buyer");
    await page.waitForURL("**/shops");
    expect(calls.filter((u) => u.includes("evil.example") && !u.includes("api=https"))).toEqual([]);
  });
});
