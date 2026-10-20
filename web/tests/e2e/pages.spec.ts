import { expect, test } from "@playwright/test";

const INFO_PAGES = {
  "/about": "The house you walked to after school.",
  "/faq": "Before you walk over.",
  "/contact": "Write when you need a person.",
  "/terms": "Marketplace terms, without the sugarcoating.",
  "/privacy": "Your information, in plain language.",
  "/pickup": "Get your bag, or get help with an order.",
};

for (const [path, heading] of Object.entries(INFO_PAGES)) {
  test(`${path} loads with no script errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      // Day 1 links to pages later days build (/shops, /cart); their 404s
      // from link prefetching are expected until then.
      if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("link", { name: "hello@neighborhoodcandylady.com" }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("every page sends a Content Security Policy", async ({ request }) => {
  const publicPage = await request.get("/about");
  expect(publicPage.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  const login = await request.get("/login");
  expect(login.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
});

test("the sign-in page runs its scripts under the nonce policy", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) blocked.push(m.text());
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(blocked).toEqual([]);
});
