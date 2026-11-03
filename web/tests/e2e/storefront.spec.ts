import { expect, test, type Page } from "@playwright/test";

// Testing and acceptance flow 3 (browse and cart) and the shop-page half of
// flow 14, against the seeded shops: Ms. Kiki's Snack Spot and Northview
// Snack Stop.

const KIKI = "/s/ms-kikis-snack-spot";
const NORTHVIEW = "/s/northview-snack-stop";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // Links to pages later days build (/sell/apply, /account) 404 when prefetched.
    if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
  });
  return errors;
}

const card = (page: Page, name: string) => page.locator("article").filter({ has: page.getByRole("heading", { name }) });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Your cart" });

test("a shop page's HTML has its name and products before any script runs", async ({ request }) => {
  const html = await (await request.get(KIKI)).text();
  expect(html).toContain("Ms. Kiki&#x27;s Snack Spot");
  expect(html).toContain("Sour Gummy Mix");
  expect(html).toContain("<title>Ms. Kiki&#x27;s Snack Spot | The Candy Lady</title>");
  // The seeded shop has a private pickup address; the public page only names the neighborhood.
  expect(html).toContain("Cherry Hill");
  expect(html).not.toContain("100 Example Ave");
  expect(html).not.toContain("Ring the side door");
  for (const path of ["/shops", "/"]) {
    expect(await (await request.get(path)).text()).not.toContain("100 Example Ave");
  }
});

test("home and /shops list the open shops", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open now" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ms\. Kiki's Snack Spot/ }).first()).toBeVisible();

  await page.goto("/shops");
  await expect(page.getByText("2 shops")).toBeVisible();
  await page.getByRole("button", { name: "Northview", exact: true }).click();
  await expect(page.getByText("1 shop", { exact: true })).toBeVisible();
  await page.getByLabel("Search shops and neighborhoods").fill("kiki");
  await expect(page.getByText("0 shops")).toBeVisible();
  expect(errors).toEqual([]);
});

test("header search lands on /shops filtered", async ({ page }) => {
  await page.goto("/shops?q=northview");
  await expect(page.getByText("1 shop", { exact: true })).toBeVisible();
});

test("flow 3: add, change quantities, stop at stock, and switch shops", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/shops");
  await page.getByRole("link", { name: /Ms\. Kiki's Snack Spot/ }).click();
  await expect(page).toHaveURL(KIKI);

  // Orange Soda Bottle has 4 in stock: low stock is called out.
  const soda = card(page, "Orange Soda Bottle");
  await expect(soda.getByText("Only 4 left")).toBeVisible();
  await soda.getByRole("button", { name: "Add" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText("Orange Soda Bottle")).toBeVisible();
  await page.keyboard.press("Escape");

  // The Add button became a stepper; it stops at the 4 in stock.
  const more = soda.getByRole("button", { name: "One more Orange Soda Bottle" });
  await more.click();
  await more.click();
  await more.click();
  await expect(soda.getByRole("group")).toContainText("4");
  await expect(more).toBeDisabled();

  // Down to zero removes it.
  for (let i = 0; i < 3; i++) await soda.getByRole("button", { name: "One fewer Orange Soda Bottle" }).click();
  await soda.getByRole("button", { name: "Remove Orange Soda Bottle" }).click();
  await expect(soda.getByRole("button", { name: "Add" })).toBeVisible();

  await card(page, "Hot Chips").getByRole("button", { name: "Add" }).click();
  await page.keyboard.press("Escape");

  // A second shop asks before starting a new cart.
  await page.goto(NORTHVIEW);
  await card(page, "Cheese Puffs").getByRole("button", { name: "Add" }).click();
  const ask = page.getByRole("dialog", { name: "Start a new cart?" });
  await expect(ask).toContainText("Ms. Kiki's Snack Spot");
  await ask.getByRole("button", { name: "Keep my cart" }).click();
  await expect(ask).toBeHidden();
  await card(page, "Cheese Puffs").getByRole("button", { name: "Add" }).click();
  await ask.getByRole("button", { name: "Start a new cart" }).click();
  await expect(drawer(page).getByText("Cheese Puffs")).toBeVisible();
  await expect(drawer(page).getByText("Hot Chips")).toBeHidden();

  // The cart survives a reload and shows on /cart.
  await page.goto("/cart");
  await expect(page.getByRole("main").getByText("Cheese Puffs")).toBeVisible();
  await expect(page.getByRole("main").getByText("$1.50").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("quick view shows the buy box and adds", async ({ page }) => {
  await page.goto(KIKI);
  await page.getByRole("button", { name: "More about Gummy Worms" }).click();
  const view = page.getByRole("dialog", { name: "Gummy Worms" });
  await expect(view).toContainText("Sour coated worms");
  await expect(view).toContainText("6 left");
  await expect(view).toContainText("Pick up at Ms. Kiki's Snack Spot, Weekdays, 2:30 PM - 7:00 PM");
  await view.getByRole("button", { name: "Add to cart" }).click();
  await expect(drawer(page).getByText("Gummy Worms")).toBeVisible();
});

test("the old site's cart carries over and its login keys are deleted", async ({ page }) => {
  await page.goto("/about");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("candyLadyCart", JSON.stringify([{ id: "1", name: "Sour Gummy Mix", priceCents: 250, qty: 2 }]));
    localStorage.setItem("candyLadySellerId", "1");
    localStorage.setItem("candyLadyToken", "old-token");
    localStorage.setItem("candyLadyUser", "{}");
    localStorage.setItem("candyLadyApiBase", "https://evil.example");
  });
  await page.goto("/cart");
  await expect(page.getByRole("main").getByText("Sour Gummy Mix")).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(["candyLadyCart", "candyLadySellerId", "cl-cart"]);

  // Changes are mirrored back into the old keys for the rollback window.
  await page.goto(KIKI);
  await card(page, "Sour Gummy Mix").getByRole("button", { name: "One more Sour Gummy Mix" }).click();
  const old = await page.evaluate(() => JSON.parse(localStorage.getItem("candyLadyCart")!));
  expect(old).toEqual([{ id: "1", name: "Sour Gummy Mix", priceCents: 250, qty: 3 }]);
});

test("an unknown shop gets the not-found page", async ({ page }) => {
  const res = await page.goto("/s/no-such-shop");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
});
