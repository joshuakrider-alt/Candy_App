import { expect, test, type Page, type Route } from "@playwright/test";

// A cold API must never look like "no shops": until the list has actually
// arrived, the home page and /shops say "Loading shops...", never
// "restocking", "0 shops" or "No shops".

const SHOP = {
  slug: "ms-kikis-snack-spot",
  shop_name: "Ms. Kiki's Snack Spot",
  shop_title: "Candy Lady",
  tagline: null,
  neighborhood: "Cherry Hill",
  pickup_window: "Weekdays, 2:30 PM - 7:00 PM",
  logo_url: null,
  theme: {},
  identity_verified: false,
  accepts_card_payments: true,
};
const SHOPS = [
  { ...SHOP, id: 1, storefront_path: `/s/${SHOP.slug}`, in_stock_count: 6 },
  {
    ...SHOP,
    id: 2,
    slug: "northview-snack-stop",
    storefront_path: "/s/northview-snack-stop",
    shop_name: "Northview Snack Stop",
    neighborhood: "Northview",
    in_stock_count: 0,
  },
];

/** Holds the browser's shop-list call until the test lets it through. */
async function holdShops(page: Page) {
  let release!: (body: unknown) => void;
  const answer = new Promise<unknown>((resolve) => (release = resolve));
  await page.route("**/api/flask/shops", async (route: Route) => {
    await route.fulfill({ json: await answer });
  });
  return release;
}

async function expectNoEmptyWording(page: Page) {
  await expect(page.getByText(/restocking/i)).toHaveCount(0);
  await expect(page.getByText(/no shops/i)).toHaveCount(0);
  await expect(page.getByText(/^0 shops$/)).toHaveCount(0);
}

test("home page waits for the shop list instead of saying every shop is restocking", async ({ page }) => {
  const release = await holdShops(page);
  await page.goto("/");
  await expect(page.getByText("Loading shops...")).toBeVisible();
  await expectNoEmptyWording(page);

  release(SHOPS);
  await expect(page.getByRole("heading", { name: "Ms. Kiki's Snack Spot" })).toBeVisible();
  await expect(page.getByText("Loading shops...")).toHaveCount(0);
  // Northview has no stock, so it is not in "Open now".
  await expect(page.getByRole("heading", { name: "Northview Snack Stop" })).toHaveCount(0);
});

test("/shops shows no count and no empty message until the list arrives", async ({ page }) => {
  const release = await holdShops(page);
  await page.goto("/shops");
  await expect(page.getByText("Loading shops...")).toBeVisible();
  await expectNoEmptyWording(page);

  release(SHOPS);
  await expect(page.getByText("2 shops")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Northview Snack Stop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Northview" })).toBeVisible();
});

test("a slow wake-up keeps loading and says why, then shows the shops", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/flask/shops", async (route) => {
    calls += 1;
    // What the proxy answers while Render is still starting the API.
    if (calls === 1) return route.fulfill({ status: 503, json: { error: "Waking up the shop" } });
    return route.fulfill({ json: SHOPS });
  });
  await page.goto("/shops");
  await expect(page.getByText(/waking up/)).toBeVisible();
  await expectNoEmptyWording(page);
  await expect(page.getByText("2 shops")).toBeVisible({ timeout: 15_000 });
  expect(calls).toBe(2);
});

test("only a list that really is empty says there are no shops", async ({ page }) => {
  const release = await holdShops(page);
  await page.goto("/");
  await expect(page.getByText("Loading shops...")).toBeVisible();
  release([]);
  await expect(page.getByText("No shops are open yet. Check back soon.")).toBeVisible();

  const releaseShops = await holdShops(page);
  await page.goto("/shops");
  await expect(page.getByText("Loading shops...")).toBeVisible();
  releaseShops([]);
  await expect(page.getByText("0 shops")).toBeVisible();
  await expect(page.getByText("No shops are open yet. Check back soon.")).toBeVisible();
});

test("a stocked-out list says restocking only once it has loaded", async ({ page }) => {
  const release = await holdShops(page);
  await page.goto("/");
  await expect(page.getByText("Loading shops...")).toBeVisible();
  await expect(page.getByText(/restocking/i)).toHaveCount(0);
  release([SHOPS[1]]);
  await expect(page.getByText("Every shop is restocking right now. Check back soon.")).toBeVisible();
});
