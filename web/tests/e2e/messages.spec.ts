import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// In-site messaging against the real local API: a buyer writes to support,
// an admin sees the unread badge and answers, the buyer reads the answer.

test("a buyer writes to support and an admin answers", async ({ page, browser }) => {
  const subject = `Help ${test.info().project.name}-${Date.now()}`;

  await signIn(page, "buyer", "/account/messages/new");
  await expect(page.getByRole("heading", { name: "Message Candy Lady support" })).toBeVisible();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Message", { exact: true }).fill("Which door do I knock on?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/account\/messages\/\d+$/);
  await expect(page.getByText("Which door do I knock on?")).toBeVisible();
  // Support threads cannot be blocked.
  await expect(page.getByRole("button", { name: "Block" })).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "admin", "/admin/messages");
  await expect(admin).toHaveURL("/admin/messages");
  await expect(admin.getByRole("link", { name: /^Messages, \d+ unread$/ })).toBeVisible();
  await admin.getByRole("link", { name: new RegExp(`^${subject} with Alice Carter, 1 unread$`) }).click();
  await expect(admin.getByText("Which door do I knock on?")).toBeVisible();
  await admin.getByLabel("Reply").fill("The side door. See you soon!");
  await admin.getByRole("button", { name: "Send" }).click();
  await expect(admin.getByText("The side door. See you soon!")).toBeVisible();

  await page.goto("/account/messages");
  await page.getByRole("link", { name: new RegExp(`^${subject} with Candy Lady support, 1 unread$`) }).click();
  await expect(page.getByText("The side door. See you soon!")).toBeVisible();
  await expect(page.getByText("Candy Lady support ·")).toBeVisible();
});
