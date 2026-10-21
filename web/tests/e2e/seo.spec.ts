import { expect, test } from "@playwright/test";

// Flows 13 and 14: old addresses, the sitemap, robots and link previews.

test("flow 13: every old .html address lands on its new page", async ({ page }) => {
  const moves: [string, string][] = [
    ["/index.html", "/"],
    ["/buyer.html", "/shops"],
    ["/shop.html", "/shops"],
    ["/apply.html", "/sell/apply"],
    ["/about.html", "/about"],
    ["/faq.html", "/faq"],
    ["/pickup.html", "/pickup"],
  ];
  for (const [from, to] of moves) {
    await page.goto(from);
    await expect(page, `${from} → ${to}`).toHaveURL(to);
  }
});

test("flow 13: old addresses move permanently, Stripe's returns keep their query", async ({ request }) => {
  const about = await request.get("/about.html", { maxRedirects: 0 });
  expect(about.status()).toBe(308);
  const ret = await request.get("/buyer.html?order=7&session_id=cs_test", { maxRedirects: 0 });
  expect(ret.status()).toBe(307);
  expect(ret.headers().location).toBe("/checkout/return?order=7&session_id=cs_test");
  const admin = await request.get("/admin.html", { maxRedirects: 0 });
  expect(admin.headers().location).toBe("/admin");
});

test("flow 14: the sitemap lists every approved shop", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/s/ms-kikis-snack-spot</loc>");
  expect(xml).toContain("/s/northview-snack-stop</loc>");
  expect(xml).toContain("/sell/apply</loc>");
  expect(xml).not.toContain(".html");
});

test("a copy that isn't the real domain keeps search engines out", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("shared links get a preview image", async ({ page, request }) => {
  await page.goto("/");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBeTruthy();
  const res = await request.get(new URL(image!).pathname);
  expect(res.headers()["content-type"]).toBe("image/png");
});
