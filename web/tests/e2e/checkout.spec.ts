import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, sessionCookie, signIn } from "./fixtures";

// Testing and acceptance flows 4, 5, 7 and 8 as far as they can run without
// Stripe. The seeded shops have no Stripe account, so the real API refuses
// card checkout; the happy paths stub the three Flask answers that come from
// Stripe (checkout_url, confirm, resume) at the browser's /api/flask calls.
// The real card payment with 4242 4242 4242 4242 is the manual check on beta.

const KIKI = "/s/ms-kikis-snack-spot";

const paidOrder = {
  id: 42,
  user_id: 4,
  seller_id: 1,
  status: "new",
  total_cents: 500,
  refunded_cents: 0,
  platform_fee_refunded_cents: 0,
  payment_status: "paid",
  platform_fee_cents: 50,
  seller_payout_cents: 450,
  currency: "usd",
  payout_method: "connect",
  paid_at: "2026-10-20T12:00:00",
  created_at: "2026-10-20T11:58:00",
  pickup_code: "CL-AB2CD",
  items: [
    {
      id: 1,
      candy_id: 1,
      quantity: 2,
      unit_price_cents: 250,
      line_total_cents: 500,
      candy: { id: 1, name: "Sour Gummy Mix", description: null, price_cents: 250, owner_seller_id: null, is_active: true, category: "candy" },
    },
  ],
  seller: { id: 1, shop_name: "Ms. Kiki's Snack Spot", neighborhood: "Cherry Hill", pickup_window: "Weekdays, 2:30 PM - 7:00 PM", slug: "ms-kikis-snack-spot" },
};

async function addToCart(page: Page, name: string) {
  await page.goto(KIKI);
  await page.locator("article").filter({ has: page.getByRole("heading", { name }) }).getByRole("button", { name: "Add" }).click();
}

test("signed out, Pay asks to sign in and comes back to the shop with the cart", async ({ page }) => {
  await addToCart(page, "Sour Gummy Mix");
  await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Sign in to pay" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(KIKI)}`);
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("e2e-buyer-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(KIKI);
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Sour Gummy Mix" }) });
  await expect(card.getByRole("group", { name: "Quantity of Sour Gummy Mix" })).toContainText("1");
});

test("Flask's refusals read clearly and keep the cart", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await addToCart(page, "Hot Chips");
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  const pay = drawer.getByRole("button", { name: /Pay \$/ });

  // The real test API has no Stripe key at all.
  await pay.click();
  await expect(drawer.getByRole("alert")).toHaveText("Card payments aren't switched on for this site yet.");

  // Flask's other refusals, word for word as it sends them.
  const refusals: [number, string, string][] = [
    [409, "Ms. Kiki's Snack Spot cannot accept card payments yet. The seller needs to finish payout setup.", "This shop hasn't finished setting up card payments, so it can't take orders yet."],
    [400, "Card payments need a total of at least $0.50. Add another snack.", "Card payments need a total of at least $0.50. Add another snack."],
    [400, "insufficient inventory for Hot Chips", "Hot Chips just sold out or has fewer left than in your cart. Open the shop to see what's left."],
  ];
  for (const [status, error, shown] of refusals) {
    await page.route("**/api/flask/orders", (route) => route.fulfill({ status, json: { error } }));
    await pay.click();
    await expect(drawer.getByRole("alert")).toHaveText(shown);
    await page.unroute("**/api/flask/orders");
  }
  // Nothing was lost: the cart is still there.
  await expect(drawer.getByText("Hot Chips", { exact: true })).toBeVisible();
});

test("flow 4 and 7: Pay goes to Stripe from the shop page, and the return shows the pickup code", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await addToCart(page, "Sour Gummy Mix");

  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/flask/orders", async (route) => {
    sent = route.request().postDataJSON();
    // Flask's success_url for a shop-page checkout, standing in for Stripe.
    await route.fulfill({
      status: 201,
      json: { ...paidOrder, total_cents: 250, payment_status: "pending", pickup_code: null, checkout_url: `${KIKI}?order=42&session_id=cs_test_1` },
    });
  });
  await page.route("**/api/flask/orders/42/payment/confirm", (route) => route.fulfill({ json: paidOrder }));

  await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Pay $2.50 & reserve" }).click();
  await page.waitForURL("**/checkout/return?**");
  const back = new URL(page.url());
  expect(Object.fromEntries(back.searchParams)).toEqual({ shop: "ms-kikis-snack-spot", order: "42", session_id: "cs_test_1" });
  expect(sent).toEqual({ seller_id: 1, items: [{ candy_id: 1, quantity: 1 }], return_to: "shop" });

  await expect(page.getByRole("heading", { name: "Show this code at pickup" })).toBeVisible();
  await expect(page.getByText("CL-AB2CD")).toBeVisible();
  await expect(page.getByText("Weekdays, 2:30 PM - 7:00 PM")).toBeVisible();
  // The cart empties once the payment is confirmed.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cl-cart")!).state.lines)).toEqual([]);
});

test("a seller account is told to use a buyer account instead of paying", async ({ page }) => {
  await signIn(page, "seller");
  await page.waitForURL("**/seller");
  await addToCart(page, "Sour Gummy Mix");
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart.getByRole("button", { name: "Pay $2.50 & reserve" })).toBeDisabled();
  await expect(cart.getByText("Seller accounts can't place orders. Sign in with a buyer account to buy.")).toBeVisible();
});

test("a confirmed payment leaves a newer cart from another shop alone", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  const other = {
    state: {
      sellerId: 2,
      shopName: "Another Shop",
      shopSlug: "another-shop",
      lines: [{ candyId: 9, name: "Hot Chips", priceCents: 200, max: 5, qty: 1 }],
    },
    version: 1,
  };
  await page.evaluate((cart) => localStorage.setItem("cl-cart", JSON.stringify(cart)), other);
  await page.route("**/api/flask/orders/42/payment/confirm", (route) => route.fulfill({ json: paidOrder }));
  await page.goto(`/checkout/return?shop=ms-kikis-snack-spot&order=42&session_id=cs_test_1`);
  await expect(page.getByText("CL-AB2CD")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cl-cart")!).state.sellerId)).toBe(2);
});

test("a price that changed since the cart was saved is shown before Stripe opens", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await addToCart(page, "Sour Gummy Mix");
  await page.route("**/api/flask/orders", (route) =>
    route.fulfill({
      status: 201,
      json: { ...paidOrder, total_cents: 300, payment_status: "pending", pickup_code: null, checkout_url: `${KIKI}?order=42&session_id=cs_test_1` },
    }),
  );
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await cart.getByRole("button", { name: "Pay $2.50 & reserve" }).click();
  await expect(cart.getByText("Prices changed since you added these. Your total is now $3.00.")).toBeVisible();
  await expect(page).toHaveURL(KIKI);
  await page.route("**/api/flask/orders/42/payment/confirm", (route) => route.fulfill({ json: paidOrder }));
  await cart.getByRole("button", { name: "Pay $3.00 & reserve" }).click();
  await page.waitForURL("**/checkout/return?**");
});

test("flow 5: cancelled at Stripe offers Finish paying (retried once) and Release items", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");

  let resumeCalls = 0;
  await page.route("**/api/flask/orders/42/checkout", async (route) => {
    resumeCalls += 1;
    if (resumeCalls === 1) {
      await route.fulfill({ status: 409, json: { error: "checkout for this order is still opening; try again in a moment" } });
    } else {
      await route.fulfill({ json: { ...paidOrder, payment_status: "pending", checkout_url: "/about?stripe=reopened" } });
    }
  });
  await page.route("**/api/flask/orders/43/cancel", (route) => route.fulfill({ json: { ...paidOrder, id: 43, payment_status: "expired" } }));

  // Flask's marketplace cancel_url is the old address; the redirect keeps the query.
  await page.goto("/buyer.html?order=42&payment=cancelled");
  await expect(page).toHaveURL("/checkout/return?order=42&payment=cancelled");
  await expect(page.getByRole("heading", { name: "Order #42 is not paid" })).toBeVisible();
  await page.getByRole("button", { name: "Finish paying" }).click();
  await expect(page).toHaveURL("/about?stripe=reopened");
  expect(resumeCalls).toBe(2);

  await page.goto("/checkout/return?order=43&payment=cancelled");
  await page.getByRole("button", { name: "Release items" }).click();
  await expect(page.getByRole("heading", { name: "Items released" })).toBeVisible();
});

test("flow 8: back from Stripe with nobody signed in hands off to the app with only the order number", async ({ page }) => {
  await page.goto("/buyer.html?order=7&session_id=cs_test_secret");
  const link = page.getByRole("link", { name: "reopen The Candy Lady" });
  await expect(link).toHaveAttribute("href", "candylady://checkout-return?order=7");
  await expect(page.getByRole("heading", { name: "Taking you back to the app…" })).toBeVisible();
});

test("/account/orders shows the status line, pickup code and Finish paying", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.route("**/api/flask/me/orders", (route) =>
    route.fulfill({
      json: [
        { ...paidOrder, status: "ready" },
        { ...paidOrder, id: 41, payment_status: "pending", pickup_code: null },
      ],
    }),
  );
  await page.goto("/account/orders");
  const ready = page.locator("article").filter({ hasText: "Order #42" });
  await expect(ready.getByText("Ready for pickup")).toBeVisible();
  await expect(ready.getByText("CL-AB2CD")).toBeVisible();
  const pending = page.locator("article").filter({ hasText: "Order #41" });
  await expect(pending.getByText("Waiting for payment")).toBeVisible();
  await expect(pending.getByRole("button", { name: "Finish paying" })).toBeVisible();
});

test("after signing out, the next person to sign in never sees the last buyer's orders", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  let calls = 0;
  await page.route("**/api/flask/me/orders", (route) => {
    calls += 1;
    // The second person's orders never arrive, so anything on screen is left over.
    if (calls === 1) return route.fulfill({ json: [{ ...paidOrder, status: "ready" }] });
  });
  await page.goto("/account/orders");
  await expect(page.getByText("CL-AB2CD")).toBeVisible();

  await page.getByRole("button", { name: "Alice" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(ACCOUNTS.seller.email);
  await page.getByLabel("Password").fill(ACCOUNTS.seller.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Jordan" }).click();
  await page.getByRole("menuitem", { name: "Your orders" }).click();
  await page.waitForURL("**/account/orders");
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await expect(page.getByText("CL-AB2CD")).toHaveCount(0);
  await expect.poll(() => calls).toBe(2);
});

test("an order action after the session ran out goes to sign in", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.route("**/api/flask/me/orders", (route) =>
    route.fulfill({ json: [{ ...paidOrder, id: 41, payment_status: "pending", pickup_code: null }] }),
  );
  await page.route("**/api/flask/orders/41/checkout", async (route) => {
    // What the proxy does on Flask's 401: the cookie goes too.
    await page.context().clearCookies();
    await route.fulfill({ status: 401, json: { error: "authentication required" } });
  });
  await page.goto("/account/orders");
  await page.getByRole("button", { name: "Finish paying" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent("/account/orders")}`);
});

test("back from Stripe when the sign-in check fails says so instead of handing off to the app", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.goto("/checkout/return?order=42&session_id=cs_test_1");
  await expect(page.getByText("Could not check that you're signed in. Reload this page to see your order.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Taking you back to the app…" })).toHaveCount(0);
});

test("a partly refunded order shows the refund and what was paid", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.route("**/api/flask/me/orders", (route) => route.fulfill({ json: [{ ...paidOrder, refunded_cents: 200 }] }));
  await page.goto("/account/orders");
  const card = page.locator("article").filter({ hasText: "Order #42" });
  await expect(card.getByText("−$2.00")).toBeVisible();
  await expect(card.getByText("You paid")).toBeVisible();
  await expect(card.getByText("$3.00")).toBeVisible();
});

test("an order from before online payment says pay at pickup, not paid", async ({ page }) => {
  await signIn(page, "buyer");
  await page.waitForURL("**/shops");
  await page.route("**/api/flask/me/orders", (route) =>
    route.fulfill({ json: [{ ...paidOrder, payment_status: "pay_at_pickup", pickup_code: null }] }),
  );
  await page.goto("/account/orders");
  const card = page.locator("article").filter({ hasText: "Order #42" });
  await expect(card.getByText("Pay at pickup")).toBeVisible();
  await expect(card.getByText("Ordered")).toBeVisible();
  await expect(card.getByText("Paid", { exact: true })).toHaveCount(0);
});

test("a new buyer sees no orders, can change their password, and can delete the account", async ({ page }) => {
  const email = `buyer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Short Lived");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("first-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/shops");

  await page.goto("/account/orders");
  await expect(page.getByText("No orders yet.")).toBeVisible();

  await page.goto("/account");
  await page.getByLabel("Current password").fill("first-password");
  await page.getByLabel("New password (at least 8 characters)").fill("second-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Password").fill("second-password");
  await dialog.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL("/");
  expect(await sessionCookie(page)).toBeUndefined();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("second-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});
