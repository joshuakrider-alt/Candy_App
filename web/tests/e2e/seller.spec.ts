import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Day 4: the seller screens against the real local API, as Jordan (Northview
// Snack Stop) or a freshly applied shop. Stripe and photo storage are not set
// up locally, so the pickup queue and the upload are stubbed at the browser's
// /api/flask calls. Every change made to Jordan's shop is undone, because the
// storefront tests count its stock.

const queueOrder = (status: string) => ({
  id: 77,
  user_id: 4,
  seller_id: 2,
  status,
  total_cents: 300,
  refunded_cents: 0,
  platform_fee_refunded_cents: 0,
  payment_status: "paid",
  platform_fee_cents: 30,
  seller_payout_cents: 270,
  currency: "usd",
  payout_method: "connect",
  paid_at: "2026-10-20T12:00:00",
  created_at: "2026-10-20T11:58:00",
  pickup_code: "CL-QU3UE",
  buyer_name: "Alice",
  items: [
    {
      id: 1,
      candy_id: 1,
      quantity: 2,
      unit_price_cents: 150,
      line_total_cents: 300,
      candy: { id: 1, name: "Hot Chips", description: null, price_cents: 150, owner_seller_id: null, is_active: true, category: "chips" },
    },
  ],
});

test("a new seller applies, is signed in, and sees the shop is waiting for approval", async ({ page }) => {
  const email = `e2e-seller-${Date.now()}@example.com`;
  await page.goto("/sell/apply");
  await page.getByLabel("Shop name").fill("Test Treat Stand");
  await page.getByLabel("Your name").fill("Tess Tester");
  await page.getByLabel("Neighborhood").fill("Riverside");
  await page.getByLabel("Pickup times").fill("Saturdays, 10 AM to 2 PM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password (at least 8 characters)").fill("tester-password");
  await page.getByLabel("Type it again").fill("tester-password");
  await page.getByRole("button", { name: "Send application" }).click();

  await expect(page).toHaveURL("/seller");
  await expect(page.getByRole("heading", { name: "Test Treat Stand" })).toBeVisible();
  await expect(page.getByText("Your shop is waiting for approval")).toBeVisible();
  await expect(page.getByText("No paid orders waiting")).toBeVisible();

  await page.getByRole("link", { name: "Stock and items" }).click();
  await expect(page.getByRole("button", { name: "Add your own item" })).toBeDisabled();
});

test("the application form checks the passwords match", async ({ page }) => {
  await page.goto("/sell/apply");
  await page.getByLabel("Shop name").fill("Mismatch Shop");
  await page.getByLabel("Your name").fill("Tess");
  await page.getByLabel("Neighborhood").fill("Riverside");
  await page.getByLabel("Pickup times").fill("Weekends");
  await page.getByLabel("Email").fill("mismatch@example.com");
  await page.getByLabel("Password (at least 8 characters)").fill("tester-password");
  await page.getByLabel("Type it again").fill("other-password");
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();
  await expect(page).toHaveURL("/sell/apply");
});

test("flow 12: signed out goes to sign-in, and a buyer gets no seller screens", async ({ page }) => {
  await page.goto("/seller/inventory");
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent("/seller/inventory")}`);

  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.goto("/seller");
  await expect(page.getByRole("heading", { name: "This account isn't a seller" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seller dashboard" })).toHaveCount(0);
});

test("the pickup queue moves an order along", async ({ page }) => {
  let status = "new";
  const sent: unknown[] = [];
  await page.route("**/api/flask/sellers/*/orders", (route) => route.fulfill({ json: [queueOrder(status)] }));
  await page.route("**/api/flask/orders/77/status", async (route) => {
    const body = route.request().postDataJSON() as { status: string };
    sent.push(body);
    status = body.status;
    await route.fulfill({ json: queueOrder(status) });
  });

  await signIn(page, "seller");
  await expect(page).toHaveURL("/seller");
  const order = page.getByRole("listitem", { name: "Order #77" });
  await expect(order).toContainText("CL-QU3UE");
  await expect(order).toContainText("Alice");
  await expect(page.getByText("$2.70").first()).toBeVisible();

  await order.getByRole("button", { name: "Start packing" }).click();
  await expect(order.getByRole("button", { name: "Mark ready" })).toBeVisible();
  await order.getByRole("button", { name: "Mark ready" }).click();
  await expect(order.getByRole("button", { name: "Picked up" })).toBeVisible();
  expect(sent).toEqual([{ status: "packing" }, { status: "ready" }]);
});

test("stock and items: add, edit, mark out and remove the shop's own item", async ({ page }) => {
  const name = `E2E Taffy ${test.info().project.name}`;
  await signIn(page, "seller", "/seller/inventory");
  await expect(page).toHaveURL("/seller/inventory");

  await page.getByRole("button", { name: "Add your own item" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Price in dollars").fill("abc");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(dialog.getByText("Enter the price in dollars")).toBeVisible();
  await dialog.getByLabel("Price in dollars").fill("1.25");
  await dialog.getByLabel("How many you have").fill("6");
  await dialog.getByRole("button", { name: "Add item" }).click();

  const row = page.getByRole("listitem", { name, exact: true });
  await expect(row).toContainText("$1.25 · 6 left");
  await expect(row).toContainText("Your item");

  await row.getByRole("button", { name: "Edit" }).click();
  await expect(dialog.getByLabel("Price in dollars")).toHaveValue("1.25");
  await dialog.getByLabel("Price in dollars").fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("$2.00 · 6 left");

  await row.getByRole("button", { name: "Mark out" }).click();
  await expect(row).toContainText("0 left");
  await expect(row).toContainText("Out of stock");
  await row.getByRole("button", { name: "Mark in stock" }).click();
  await expect(row).toContainText("8 left");

  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
});

test("held stock: the shelf count includes open checkouts, and a short order says so", async ({ page }) => {
  // Flask adds reserved_count and on_hand_count; here 3 are held on the first item.
  type Row = { candy_id: number; inventory_count: number; reserved_count?: number; on_hand_count?: number; candy: { name: string } | null };
  let held: Row | undefined;
  await page.route("**/api/flask/sellers/*/inventory", async (route) => {
    const rows = (await (await route.fetch()).json()) as Row[];
    held = rows.find((r) => r.candy && r.inventory_count > 0)!;
    held.reserved_count = 3;
    held.on_hand_count = held.inventory_count + 3;
    await route.fulfill({ json: rows });
  });
  const sent: unknown[] = [];
  await page.route("**/api/flask/sellers/*/inventory/*", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: held });
  });
  await page.route("**/api/flask/sellers/*/orders", (route) => route.fulfill({ json: [{ ...queueOrder("new"), stock_shortfall: 2 }] }));

  await signIn(page, "seller");
  await expect(page.getByRole("listitem", { name: "Order #77" })).toContainText("Short 2 items");

  await page.goto("/seller/inventory");
  await expect(page.getByText("3 held in open checkouts")).toBeVisible();
  const row = page.getByRole("listitem", { name: held!.candy!.name, exact: true });
  await expect(row).toContainText("3 held in open checkouts");
  await row.getByRole("button", { name: /Set count|Edit/ }).click();
  const dialog = page.getByRole("dialog");
  const count = dialog.getByLabel("How many are on your shelf");
  await expect(count).toHaveValue(String(held!.on_hand_count));
  await count.fill("12");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  // An API from before on_hand_count reads inventory_count: the 9 for sale.
  expect(sent).toEqual([
    { on_hand_count: 12, reserved_count: 3, inventory_count: 9, seen_inventory_count: held!.inventory_count },
  ]);
});

test("the shop page form previews as you type and saves", async ({ page }) => {
  await signIn(page, "seller", "/seller/storefront");
  await expect(page).toHaveURL("/seller/storefront");
  await expect(page.getByText("/s/northview-snack-stop")).toBeVisible();

  const tagline = page.getByLabel(/^Tagline/);
  const original = await tagline.inputValue();
  const preview = page.getByLabel("Preview of your shop page");

  await tagline.fill("Snacks after school, every day");
  await expect(preview).toContainText("Snacks after school, every day");
  await page.getByLabel("Logo link (optional, https://)").fill("http://not-secure.example/logo.png");
  await page.getByRole("button", { name: "Save shop page" }).click();
  await expect(page.getByText("The logo must be an https:// link to an image.")).toBeVisible();
  await page.getByLabel("Logo link (optional, https://)").fill("");

  await page.getByLabel("Use my own colours").check();
  await expect(preview.getByText("Add to cart")).toBeVisible();
  await page.getByLabel("Use my own colours").uncheck();

  await page.getByRole("button", { name: "Save shop page" }).click();
  await expect(page.getByText("Shop page saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Tagline/)).toHaveValue("Snacks after school, every day");

  await page.getByLabel(/^Tagline/).fill(original);
  await page.getByRole("button", { name: "Save shop page" }).click();
  await expect(page.getByText("Shop page saved.")).toBeVisible();
});

test("Stripe's returns to the old seller page land on payouts and ID check", async ({ page }) => {
  await signIn(page, "seller");
  await expect(page).toHaveURL("/seller");

  await page.goto("/seller.html?stripe=return");
  await expect(page).toHaveURL("/seller/payouts");
  await expect(page.getByText("Stripe still needs a few details")).toBeVisible();
  // No Stripe keys on the local API: the seller sees a plain sentence, not env var names.
  await page.getByRole("button", { name: "Set up payouts with Stripe" }).click();
  await expect(page.getByText("That isn't switched on for this site yet.")).toBeVisible();

  await page.goto("/seller.html?identity=return");
  await expect(page).toHaveURL("/seller/verify");
  await expect(page.getByText("ID checks aren't switched on for this site yet.")).toBeVisible();
});

// A 1x1 PNG. The upload must arrive as a re-encoded JPEG, which is what drops
// a phone photo's GPS data.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("flow 10: a snack photo is re-encoded, uploaded straight to storage and confirmed", async ({ page }) => {
  let uploaded: { type: string | undefined; body: Buffer | null } | null = null;
  let confirmed: Record<string, unknown> | null = null;
  const photos: unknown[] = [];

  await page.route("**/api/flask/config", (route) =>
    route.fulfill({ json: { uploads_enabled: true, max_upload_bytes: 5_000_000, identity_enabled: false } }),
  );
  await page.route("**/api/flask/uploads/sign", (route) =>
    route.fulfill({
      status: 201,
      json: { upload_url: "/__e2e-storage/candy_photo/2026/10/3-abc.jpg", key: "candy_photo/2026/10/3-abc.jpg", expires_in: 300 },
    }),
  );
  await page.route("**/__e2e-storage/**", (route) => {
    uploaded = { type: route.request().headers()["content-type"], body: route.request().postDataBuffer() };
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/flask/sellers/*/photos", (route) => {
    if (route.request().method() === "POST") {
      confirmed = route.request().postDataJSON();
      photos.push({ id: 9, seller_id: 2, candy_id: null, url: null, caption: "Our shelf", status: "pending", created_at: null, rejection_reason: null });
      return route.fulfill({ status: 201, json: photos[0] });
    }
    return route.fulfill({ json: photos });
  });

  await signIn(page, "seller", "/seller/photos");
  await expect(page).toHaveURL("/seller/photos");
  await expect(page.getByText("No photos yet.")).toBeVisible();
  await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "shelf.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Caption (optional)").fill("Our shelf");
  await page.getByRole("button", { name: "Upload photo" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: "Waiting on review" })).toBeVisible();
  expect(uploaded!.type).toBe("image/jpeg");
  expect([...uploaded!.body!.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(uploaded!.body!.includes("Exif")).toBe(false);
  expect(confirmed).toMatchObject({ key: "candy_photo/2026/10/3-abc.jpg", content_type: "image/jpeg", caption: "Our shelf", candy_id: null });
});
