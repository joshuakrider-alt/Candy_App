import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

// Day 5: the admin screens against the real local API. Refunds go through
// Stripe, so flow 11 stubs the orders list and the refund call.

async function apply(page: Page, shop: string) {
  await page.goto("/sell/apply");
  await page.getByLabel("Shop name").fill(shop);
  await page.getByLabel("Your name").fill("Tess Tester");
  await page.getByLabel("Neighborhood").fill("Riverside");
  await page.getByLabel("Pickup times").fill("Saturdays");
  await page.getByLabel("Email").fill(`${shop.toLowerCase().replace(/\W+/g, "-")}@example.com`);
  await page.getByLabel("Password (at least 8 characters)").fill("tester-password");
  await page.getByLabel("Type it again").fill("tester-password");
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page).toHaveURL("/seller");
}

test("an admin approves one application and turns down another", async ({ page, browser }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  const approve = `Approve Me ${run}`;
  const reject = `Reject Me ${run}`;
  const sellerPage = await (await browser.newContext()).newPage();
  await apply(sellerPage, approve);
  await apply(await (await browser.newContext()).newPage(), reject);

  await signIn(page, "admin");
  await expect(page).toHaveURL("/admin");
  await page.getByRole("listitem", { name: approve }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(`${approve} is live.`)).toBeVisible();
  await expect(page.getByRole("listitem", { name: approve })).toHaveCount(0);

  await page.getByRole("listitem", { name: reject }).getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("listitem", { name: reject })).toHaveCount(0);

  // Flow 9, as far as it goes without Stripe: the approved seller's banner is gone.
  await sellerPage.reload();
  await expect(sellerPage.getByRole("heading", { name: approve })).toBeVisible();
  await expect(sellerPage.getByText("waiting for approval")).toHaveCount(0);

  // Take the test shop down again: the storefront tests count the live shops.
  const live = (await (await page.request.get("/api/flask/applications?status=approved")).json()) as { id: number; shop_name: string }[];
  const id = live.find((s) => s.shop_name === approve)!.id;
  const origin = new URL(page.url()).origin;
  const down = await page.request.put(`/api/flask/applications/${id}`, { data: { status: "rejected" }, headers: { origin } });
  expect(down.ok()).toBe(true);
});

test("flow 12: buyers and sellers get no admin screens", async ({ page }) => {
  await signIn(page, "seller");
  await expect(page).toHaveURL("/seller");
  await page.goto("/admin/revenue");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
});

test("flow 11: an admin refunds a paid order after confirming", async ({ page }) => {
  let refunded = false;
  const order = (paid: boolean) => ({
    id: 55,
    user_id: 4,
    seller_id: 1,
    status: "new",
    total_cents: 450,
    refunded_cents: paid ? 0 : 450,
    platform_fee_refunded_cents: 0,
    payment_status: paid ? "paid" : "refunded",
    platform_fee_cents: 45,
    seller_payout_cents: 405,
    currency: "usd",
    payout_method: "connect",
    paid_at: "2026-10-20T12:00:00",
    created_at: "2026-10-20T11:58:00",
    pickup_code: null,
    items: [],
    seller: { id: 1, shop_name: "Ms. Kiki's Snack Spot" },
  });
  await page.route("**/api/flask/orders", (route) => route.fulfill({ json: [order(!refunded)] }));
  await page.route("**/api/flask/admin/orders/55/refund", (route) => {
    refunded = true;
    return route.fulfill({ json: order(false) });
  });

  await signIn(page, "admin", "/admin/revenue");
  await expect(page).toHaveURL("/admin/revenue");
  await expect(page.getByText("Paid orders")).toBeVisible();
  const row = page.getByRole("row", { name: "Order #55" });
  await expect(row).toContainText("Paid");
  await row.getByRole("button", { name: "Refund" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Go back" }).click();
  expect(refunded).toBe(false);
  await row.getByRole("button", { name: "Refund" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Refund $4.50" }).click();
  await expect(row).toContainText("Refunded");
  await expect(row.getByRole("button", { name: "Refund" })).toHaveCount(0);
});

test("a partly refunded order offers only what is left", async ({ page }) => {
  const order = {
    id: 56,
    user_id: 4,
    seller_id: 1,
    status: "new",
    total_cents: 450,
    refunded_cents: 150,
    platform_fee_refunded_cents: 15,
    payment_status: "paid",
    platform_fee_cents: 45,
    seller_payout_cents: 405,
    currency: "usd",
    payout_method: "connect",
    paid_at: "2026-10-20T12:00:00",
    created_at: "2026-10-20T11:58:00",
    pickup_code: null,
    items: [],
    seller: { id: 1, shop_name: "Ms. Kiki's Snack Spot" },
  };
  await page.route("**/api/flask/orders", (route) => route.fulfill({ json: [order] }));
  await signIn(page, "admin", "/admin/revenue");
  await page.getByRole("row", { name: "Order #56" }).getByRole("button", { name: "Refund" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("The buyer gets $3.00 back");
  await expect(dialog.getByRole("button", { name: "Refund $3.00" })).toBeVisible();
});

test("an admin's account page explains that another admin removes it", async ({ page }) => {
  await signIn(page, "admin", "/account");
  await expect(page.getByText("Admin accounts can't be deleted here. Ask another admin to remove this account.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});

test("the catalog shows its category balance", async ({ page }) => {
  await signIn(page, "admin", "/admin/catalog");
  const balance = page.getByLabel("Category balance");
  await expect(balance).toContainText("Candy");
  await expect(balance).toContainText("Chips");
  await expect(balance).toContainText("Drinks");
  await expect(page.getByText("Hot Chips", { exact: true })).toBeVisible();
});

test("photo review approves a waiting photo", async ({ page }) => {
  const reviewed: unknown[] = [];
  await page.route("**/api/flask/config", (route) =>
    route.fulfill({ json: { uploads_enabled: true, max_upload_bytes: 5_000_000, identity_enabled: false } }),
  );
  await page.route("**/api/flask/admin/photos?status=pending", (route) =>
    route.fulfill({
      json: reviewed.length
        ? []
        : [{ id: 3, seller_id: 1, candy_id: null, url: null, caption: "Fresh shelf", status: "pending", created_at: null, rejection_reason: null, shop_name: "Ms. Kiki's Snack Spot" }],
    }),
  );
  await page.route("**/api/flask/admin/photos/3", (route) => {
    reviewed.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });

  await signIn(page, "admin", "/admin/photos");
  const card = page.getByRole("listitem", { name: "Photo from Ms. Kiki's Snack Spot" });
  await expect(card).toContainText("Fresh shelf");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Nothing waiting.")).toBeVisible();
  expect(reviewed).toEqual([{ status: "approved" }]);
});
