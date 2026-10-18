<!--
Repo copy of the "Candy Lady Next.js Migration Plan" Claude Doc
(https://claude.ai/artifact/Jzcwy2oAdFicGW8fiVdQAP), exported as Markdown on
2026-10-16 from doc revision 34. Everything below the "Plan text" rule is the
export, unedited. The status section directly below is NOT part of the plan.
-->

## Day 0 status (repo note, not part of the plan)

Taken from the 2026-10-15 "Day 0 migration checklist checkpoint" entry in
`AGENT_WORKLOG.md`. The checkboxes inside the plan text are the doc's own and
were left as written on Oct 2, so they do not reflect this status.

| Day 0 task | Status (Oct 15 checkpoint) |
| --- | --- |
| 1. Close the `?api=` hole | **Done**: PR #20 merged Oct 3 |
| 2. Confirm `JWT_SECRET_KEY` on Render | **Done**: confirmed by Joshua Oct 3 |
| 3. Test-mode staging API | **Half done**: Neon staging branch and Render staging service (`candy-lady-api-staging.onrender.com`) live, PII scrubbed. Still needed: Stripe test keys and test-mode webhook, `api-staging.neighborhoodcandylady.com` DNS, one-time admin bootstrap |
| 4. Second Vercel project on Pro | **Not started** |
| 5. Add new site addresses to `CORS_ORIGINS` | **Not done**: staging still allows every origin |
| 6. Cloudflare R2 photo storage | **Not started** |

Since the checkpoint: the `api-staging` CNAME was added in Vercel DNS on
Oct 15 ("Test-mode staging API, part 2" in the worklog). The Render custom
domain and the Stripe test keys and webhook are being set in the dashboards.

Two diagrams in the doc ("At a glance" and "Architecture") are embedded
content that does not export to Markdown; they appear below as placeholders.

---

<!-- Plan text: verbatim export from the Claude Doc -->

# Candy Lady Next.js Migration Plan

Oct 2, 2026 · @Joshua Krider

Move every page of neighborhoodcandylady.com to one Next.js app in a new `web/` folder in 5 build days, keep the Flask API on Render, and cut over by moving the domain so rollback takes minutes.

## At a glance

&#91;embedded content: roadmap · Day 0 plus 5 build days, one gate\]

The old site keeps running the whole time. Nothing changes for customers until the go/no-go gate passes and the domain is moved.

## What Shopify and Amazon actually ship

Shopify and Amazon do send HTML: every web page any browser shows is HTML, CSS and JavaScript. What they don't do is hand-write one HTML file per page. They generate pages from components and data on a server, so one product template serves millions of products.

That is the real difference from today's site, and it is what Next.js gives you:

- **Components instead of copied markup.** Today the header and footer are repeated in 12 `.html` files, and all behaviour lives in one 2,175-line `app.js`. In Next.js the header is written once and every page reuses it.
- **Pages built from data on the server.** A shop page at `/s/<slug>` arrives already filled with that shop's name and products. Search engines and link previews can read it, and it shows before any JavaScript runs.
- **Safer logins.** The session moves from `localStorage`, which any script on the page can read, into a cookie the browser hides from JavaScript.
- **Faster pages.** Images are resized automatically, pages pre-load as the visitor hovers a link, and only the code each page needs is sent.

The layout patterns that make Shopify stores and Amazon easy to shop are covered under Storefront design. Those are what customers notice; the framework is how you build them quickly.

## Decisions

The Flask API, its database and its Stripe logic stay exactly where they are; only the website is rebuilt. That keeps the money-handling code that just passed four review rounds untouched.

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, App Router, TypeScript | Server-rendered pages, components, file-based routes, first-class on Vercel where the site already lives |
| Styling | Tailwind CSS + shadcn/ui components | Fast to build polished layouts; the current colours (`--cherry` #ff4d6d, `--lemon` #ffd84d, `--cola` #44251d and the rest) become Tailwind theme tokens, so the brand carries over |
| Fonts | Baloo 2 and Nunito via `next/font` | Same fonts as today, self-hosted by Next.js so there is no extra request to Google |
| Data fetching | Server components for public pages; TanStack Query for signed-in pages | Public pages render on the server; dashboards refresh live after each action |
| Cart state | Zustand, saved in the browser | Same behaviour as today's cart, with a clearer "switch shop?" prompt |
| Login | httpOnly session cookie, set by Next.js | Removes the token from JavaScript's reach (see Login and sessions) |
| Talking to Flask | One Next.js proxy route, `/api/flask/[...path]` | The browser never holds the token or the API address; the API address is fixed on the server |
| Checkout | Unchanged: Flask's `POST /orders` opens Stripe Checkout | Stock holds, fees, Stripe Connect and webhooks already work and are tested |
| Where it lives | New `web/` folder, its own Vercel project | The old site keeps serving until the domain is moved; rollback is moving it back |
| Old URLs | Permanent redirects (`/buyer.html` to `/shops`, and so on) | Bookmarks, Google results, Stripe and the Android app keep working |
| Tests | Playwright end-to-end tests against a test-mode API | The checkout and seller flows are checked in a real browser before cutover |

Two ideas from the earlier plans are left out on purpose. The Next.js server never creates Stripe sessions itself, and the cart is not stored on the server, because Flask has no cart endpoint and does not need one.

## Architecture

&#91;embedded content: architecture after the move · new part highlighted\]

Only the highlighted part is new. The browser never sees the API token or the API address, and the Android app keeps talking to Flask exactly as it does today.

## Page map

The 12 HTML pages become 25 routes: the buyer, seller and admin pages each split into focused screens instead of one long page. "Server" means the page arrives filled in; "Client" means it loads after sign-in through the proxy.

| Today | New route | Renders | Built on |
| --- | --- | --- | --- |
| `about`, `faq`, `contact`, `terms`, `privacy`, `pickup` | Same paths: `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/pickup` | Server, static | Day 1 |
| (sign-in forms inside each page) | `/login`, `/signup` | Client | Day 1 |
| `index.html` | `/` | Server, refreshed every 60 s | Day 2 |
| `buyer.html` shop picker | `/shops` (search, filters, shop cards) | Server, refreshed every 30 s | Day 2 |
| `shop.html` at `/s/<slug>` | `/s/[slug]` | Server, refreshed every 30 s | Day 2 |
| Cart panel in `buyer.html` and `shop.html` | Cart drawer on every page, plus `/cart` | Client | Day 2 |
| Stripe return handling in `buyer.html` | `/checkout/return` | Client | Day 3 |
| Order history in `buyer.html` | `/account/orders` | Client, signed in | Day 3 |
| `apply.html` | `/sell/apply` | Server shell, client form | Day 4 |
| `seller.html` pickup queue | `/seller` | Client, seller or admin | Day 4 |
| `seller.html` stock and items | `/seller/inventory` | Client | Day 4 |
| `seller.html` shop page settings | `/seller/storefront` | Client | Day 4 |
| `seller.html` Stripe payouts | `/seller/payouts` | Client | Day 4 |
| `seller.html` photos | `/seller/photos` | Client | Day 4 |
| `seller.html` identity check | `/seller/verify` | Client | Day 4 |
| `admin.html` applications | `/admin` | Client, admin only | Day 5 |
| `admin.html` paid orders and revenue | `/admin/revenue` | Client | Day 5 |
| `admin.html` catalog and category balance | `/admin/catalog` | Client | Day 5 |
| `admin.html` photo review | `/admin/photos` | Client | Day 5 |
| `sitemap.xml`, `robots.txt` | Generated by `app/sitemap.ts` and `app/robots.ts`, including every shop page | Server | Day 5 |

The sitemap today lists `/buyer.html` and `/seller.html` and none of the shop pages. The generated one lists every approved shop from `GET /shops`, which is the main search-engine gain of the move.

## Day 0 prerequisites

Six tasks come before any Next.js code. The first fixes a hole in the live site today; the rest give the new site a safe place to be tested.

- [ ] **Close the `?api=` hole in the live `app.js`.** Any link with `?api=https://other-server` currently sends a buyer's password and session token to that server, and the browser remembers it. Honour the override only when the page itself is on `localhost` or `127.0.0.1`, and clear any saved override otherwise. Ship this first, on its own. In review as [pull request 20](https://github.com/joshuakrider-alt/Candy_App/pull/20); live once it is merged and Vercel deploys.
- [x] **Confirm `JWT_SECRET_KEY` is set on Render.** The API now refuses to start without it, after the fixes merged on Oct 2.
- [ ] **Stand up a test-mode API.** The live API takes real card payments, so the new site must not be tested against it. Create a Neon branch of the database and a second Render service on that branch with `sk_test_` Stripe keys and its own webhook secret. Name it `api-staging.neighborhoodcandylady.com`.
- [ ] **Create the second Vercel project on a Pro team.** Hobby does not allow a site that takes payments (see Running on free tiers). Root directory `web/`, production branch `main`, and a stable test domain `beta.neighborhoodcandylady.com`. Set `FLASK_API_URL` to the staging API for previews and to `https://api.neighborhoodcandylady.com` for production.
- [ ] **Add the new origins to `CORS_ORIGINS` on both APIs.** Add `https://beta.neighborhoodcandylady.com` and any other preview domain. Flask only sends Stripe buyers back to an origin on that list, otherwise it falls back to `PUBLIC_SITE_URL`.

* [ ] **Set up photo storage on Cloudflare R2, so photos work from launch day.** Create two buckets, `candy-lady-photos` and `candy-lady-photos-staging`. Connect a custom domain such as `images.neighborhoodcandylady.com` to the production bucket: the free `r2.dev` address is rate-limited and meant for testing only. Give each bucket a CORS rule allowing `PUT` and `GET` with the `Content-Type` header from the site's own origins, or browser uploads fail even with a valid signed link. Set `STORAGE_ENDPOINT_URL`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` and `STORAGE_PUBLIC_BASE_URL` on the staging API now; the production API gets its values at cutover. `GET /config` then reports `uploads_enabled: true`.

No Flask code has to change. The routes Flask sends people back to after Stripe (`/buyer.html`, `/s/<slug>`, `/seller.html?stripe=…`, `/seller.html?identity=return`) are answered by redirects in the new site, which keep the query string. Pointing Flask at the new paths directly is a clean-up for the week after cutover.

## Login and sessions

The Flask token moves into a cookie that page scripts cannot read, and every signed-in request goes through one Next.js proxy that adds the token on the server. Flask keeps accepting the token in the `Authorization` header, so the Android app is unaffected.

**Signing in**

1. The login form posts to `/api/auth/login` on the Next.js site.
2. That route calls Flask `POST /login` (or `POST /signup`) and receives `access_token` and `user`.
3. It stores the token in a cookie named `__Host-cl_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, lasting 12 hours, the same as `JWT_ACCESS_TOKEN_HOURS`. It returns only `user` to the browser.
4. `/api/auth/logout` deletes the cookie.

**Every signed-in request**

- The browser calls `/api/flask/<path>`, for example `/api/flask/me/orders`. The proxy reads the cookie, adds `Authorization: Bearer <token>`, and calls `FLASK_API_URL` + path.
- It handles GET, POST, PUT and DELETE, because password change, account deletion, stock edits and refunds use PUT and DELETE.
- It forwards the browser's `Origin` header. Flask uses it to send Stripe buyers back to the site they came from.
- When Flask answers 401, the proxy also deletes the cookie, so the site shows the sign-in screen instead of failing quietly.
- The API address comes only from the server's environment. There is no `?api=` override in production; local development sets it in `.env.local`.

**Who can see what**

- `middleware.ts` sends anyone without the cookie from `/account`, `/seller` and `/admin` to `/login?next=<page>`.
- The seller and admin layouts call `GET /me` on the server and allow only `seller`/`admin` and `admin` respectively. Flask still enforces every permission itself, so this check is only about showing the right screen.

**Attacks this design handles**

- **Stolen tokens:** page scripts cannot read an `HttpOnly` cookie. A malicious script could still act as the user while the page is open, so the next two points matter.
- **Injected scripts:** React escapes all text by default. `dangerouslySetInnerHTML` is banned by a lint rule. A Content Security Policy allows scripts only from the site itself, with a per-request nonce.
- **Forged requests from other sites:** `SameSite=Lax` keeps the cookie off cross-site POST, PUT and DELETE requests. The proxy also rejects any write whose `Origin` is not the site's own.
- **Photo uploads:** the browser still uploads straight to storage with the signed URL from `POST /uploads/sign`, so large photos never pass through the proxy.

## Checkout and payments

Flask keeps doing all the money work: the new site only starts checkout, follows Stripe's redirect, and shows the result. No Stripe secret or publishable key goes into Vercel, because hosted Stripe Checkout needs neither on the website.

**Buying**

1. The cart holds one shop's items, because `POST /orders` takes one `seller_id`. Adding an item from a second shop opens a dialog: "Your cart has items from Ms. Kiki's. Start a new cart?"
2. **Pay** sends `POST /api/flask/orders` with `seller_id`, `items` and `return_to` (`"shop"` on a shop page, `"marketplace"` elsewhere). Flask holds the stock, prices the order and returns `checkout_url`.
3. The browser goes to `checkout_url`. The cart is kept until the payment is confirmed, so a buyer who backs out of Stripe still has it. Today's site empties it before the redirect.
4. Flask's known refusals become clear messages: 409 when the shop has not finished Stripe setup, 400 below the $0.50 card minimum, 400 when stock ran out.

**Coming back from Stripe**

- Flask sends buyers to `/buyer.html?order=…&session_id=…` or `/s/<slug>?order=…`. Both redirect to `/checkout/return`, keeping the query string.
- With `session_id`, the page calls `POST /orders/<id>/payment/confirm` and shows the pickup code large and easy to copy. The code also appears in `/account/orders`, and the cart empties.
- With `payment=cancelled`, it offers **Finish paying** (`POST /orders/<id>/checkout`) and **Release items** (`POST /orders/<id>/cancel`).
- A 409 "checkout is still opening" on Finish paying is retried once after 2 seconds before showing a message.

**The Android app**

The Android app pays in a Chrome Custom Tab that has no website session. `/checkout/return` keeps today's rule: back from Stripe with nobody signed in means the app's tab. It then shows "Taking you back to the app" and, on Android, opens `candylady://checkout-return?order=<id>`. Only the order number goes in that link, never the Stripe session id. Keep this hand-off exactly as it is: the Android app is revised only after the new site launches, and every installed copy depends on it until then.

**Seller payouts and identity**

- `/seller/payouts` calls `POST /sellers/<id>/stripe/connect` and follows the returned link. Stripe sends sellers back to `/seller.html?stripe=return` or `?stripe=refresh`, which redirects to `/seller/payouts`. That page calls `GET /sellers/<id>/stripe/status`, and on `refresh` reopens onboarding automatically.
- `/seller/verify` starts Stripe Identity with `POST /identity/session`. Flask's return link is `PUBLIC_SITE_URL/seller.html?identity=return`, which redirects to `/seller/verify` and calls `POST /identity/refresh`.
- Stripe webhooks still go straight to `api.neighborhoodcandylady.com/stripe/webhook`. The website is not involved.

An embedded card form in the cart (Stripe Elements) is a later project. It needs a new Flask endpoint that creates a PaymentIntent with the same destination, platform fee and order metadata that `POST /orders` uses today.

## Project structure and starter code

Everything new lives in `web/`; the Flask `backend/` and the old HTML files stay untouched until a week after cutover. The code below uses the API's real routes (`/login`, `/me`, `/orders`), which the earlier plans got wrong.

```
web/
├─ app/
│  ├─ (store)/                 # header, footer, cart drawer
│  │  ├─ page.tsx              # /
│  │  ├─ shops/page.tsx        # /shops
│  │  ├─ s/[slug]/page.tsx     # /s/<slug>
│  │  ├─ cart/page.tsx
│  │  ├─ checkout/return/page.tsx
│  │  ├─ account/orders/page.tsx
│  │  ├─ sell/apply/page.tsx
│  │  └─ (info)/about|faq|contact|terms|privacy|pickup/page.tsx
│  ├─ (auth)/login/page.tsx, signup/page.tsx
│  ├─ seller/                  # layout checks role; 6 pages
│  ├─ admin/                   # layout checks role; 4 pages
│  ├─ api/auth/login|signup|logout/route.ts
│  ├─ api/flask/[...path]/route.ts
│  ├─ sitemap.ts, robots.ts
│  └─ layout.tsx, globals.css
├─ components/                 # ui/ (shadcn), header, search, shop-card,
│                               # product-card, cart-drawer, pickup-code
├─ lib/
│  ├─ session.ts               # cookie name, getSession() (server only)
│  ├─ flask.ts                 # server fetches for public pages
│  ├─ api.ts                   # browser fetches to /api/flask
│  └─ types.ts                 # User, Seller, Candy, InventoryItem, Order
├─ store/cart.ts
├─ middleware.ts
├─ next.config.ts
└─ tests/e2e/*.spec.ts
```

**Commands**

```bash
npx create-next-app@latest web --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*"
cd web
npx shadcn@latest init
npx shadcn@latest add button card sheet dialog badge input tabs table sonner skeleton dropdown-menu
npm i zustand @tanstack/react-query
npm i -D @playwright/test && npx playwright install chromium
```

**`lib/session.ts`**: the cookie and the server-side session read. Next.js 15 makes `cookies()` async.

```ts
import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-cl_session" : "cl_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // matches JWT_ACCESS_TOKEN_HOURS

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${process.env.FLASK_API_URL}/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res.ok ? res.json() : null; // { user, seller? }
}
```

**`app/api/auth/login/route.ts`**: Flask returns `access_token` and `user`; only `user` reaches the browser.

```ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  }
  const { email, password } = await req.json();
  const res = await fetch(`${process.env.FLASK_API_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const out = NextResponse.json({ user: data.user });
  out.cookies.set(SESSION_COOKIE, data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return out;
}
```

`signup/route.ts` is the same against `POST /signup` with `name` added. `logout/route.ts` calls `(await cookies()).delete(SESSION_COOKIE)`.

**`app/api/flask/[...path]/route.ts`**: the one proxy for every signed-in call.

```ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  }

  const headers = new Headers();
  const type = req.headers.get("content-type");
  if (type) headers.set("content-type", type);
  if (origin) headers.set("origin", origin); // Flask picks the Stripe return site from this
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const target = `${process.env.FLASK_API_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });

  const res = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  if (upstream.status === 401) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
```

**`next.config.ts` redirects**: the first matching rule wins, and Next.js keeps the query string.

```ts
async redirects() {
  return [
    { source: "/buyer.html", has: [{ type: "query", key: "order" }], destination: "/checkout/return", permanent: false },
    { source: "/seller.html", has: [{ type: "query", key: "stripe" }], destination: "/seller/payouts", permanent: false },
    { source: "/seller.html", has: [{ type: "query", key: "identity" }], destination: "/seller/verify", permanent: false },
    { source: "/buyer.html", destination: "/shops", permanent: true },
    { source: "/shop.html", destination: "/shops", permanent: true },
    { source: "/seller.html", destination: "/seller", permanent: true },
    { source: "/admin.html", destination: "/admin", permanent: true },
    { source: "/apply.html", destination: "/sell/apply", permanent: true },
    { source: "/index.html", destination: "/", permanent: true },
    { source: "/:page(about|faq|contact|terms|privacy|pickup).html", destination: "/:page", permanent: true },
  ];
}
```

`/s/[slug]/page.tsx` handles its own Stripe return: when the URL carries `order`, it redirects to `/checkout/return` with the same query plus `shop=<slug>`.

**`store/cart.ts`**: one shop per cart, saved in the browser.

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Line = { candyId: number; name: string; priceCents: number; qty: number };
type Cart = {
  sellerId: number | null;
  shopName: string | null;
  lines: Line[];
  add: (shop: { id: number; name: string }, line: Line, max: number) => "added" | "other-shop" | "sold-out";
  startOver: (shop: { id: number; name: string }) => void;
  setQty: (candyId: number, qty: number) => void;
  clear: () => void;
};

export const useCart = create<Cart>()(persist((set, get) => ({
  sellerId: null, shopName: null, lines: [],
  add: (shop, line, max) => {
    const { sellerId, lines } = get();
    if (sellerId !== null && sellerId !== shop.id) return "other-shop"; // UI asks to start over
    const have = lines.find((l) => l.candyId === line.candyId)?.qty ?? 0;
    if (have + line.qty > max) return "sold-out";
    const next = have
      ? lines.map((l) => (l.candyId === line.candyId ? { ...l, qty: have + line.qty } : l))
      : [...lines, line];
    set({ sellerId: shop.id, shopName: shop.name, lines: next });
    return "added";
  },
  startOver: (shop) => set({ sellerId: shop.id, shopName: shop.name, lines: [] }),
  setQty: (candyId, qty) => set({
    lines: qty > 0
      ? get().lines.map((l) => (l.candyId === candyId ? { ...l, qty } : l))
      : get().lines.filter((l) => l.candyId !== candyId),
  }),
  clear: () => set({ sellerId: null, shopName: null, lines: [] }),
}), { name: "cl-cart" }));
```

**Environment variables (Vercel)**

| Name | Production | Preview |
| --- | --- | --- |
| `FLASK_API_URL` | `https://api.neighborhoodcandylady.com` | `https://api-staging.neighborhoodcandylady.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.neighborhoodcandylady.com` | `https://beta.neighborhoodcandylady.com` |
| `NEXT_PUBLIC_IMAGE_HOST` | Host of `STORAGE_PUBLIC_BASE_URL` | Same |

## Storefront design

What makes Shopify stores and Amazon easy to buy from is a small set of layout patterns, and every one of them fits Candy Lady. The candy colours, Baloo 2 headings and Nunito text stay, so the site looks like itself, only sharper.

| Pattern | Where the big sites use it | Candy Lady version |
| --- | --- | --- |
| Sticky header with search | Amazon's search bar and cart on every page | Logo, "Search shops and snacks", a "Pickup near: Cherry Hill" chip, account menu, cart icon with an item count |
| Bottom tab bar on phones | Shopify's Shop app, Amazon mobile | Home, Shops, Cart, Orders, Account, always one thumb away |
| Rails of cards on the home page | Amazon's "Buy again", Shopify theme collections | "Open now" shops, Candy, Chips and Drinks tiles, then a 3-step "How pickup works" |
| Filterable grid | Amazon search results | `/shops`: shop cards with logo, neighbourhood, pickup hours, "Open now" or "Restocking", items in stock and an "ID verified" badge; filter chips for neighbourhood, "Pays by card" and "Has stock" |
| Branded store page | Shopify storefront themes | `/s/<slug>` in the shop's own colours: banner, tagline, pickup details, category tabs that stick while scrolling, product grid |
| Product card with quick add | Shopify product grids | Photo or category art, name, price, "Only 3 left" when low, an Add button that turns into a −/+ stepper |
| Quick view | Shopify quick-view modal | Tapping a product opens a dialog with the larger photo and description; no separate product page needed yet |
| Slide-out cart | Shopify cart drawer | Opens on Add: items, steppers, subtotal, "Pay $X & reserve", pickup reminder |
| Clear buy box | Amazon's price, stock and delivery box | On every product: price, units left, and "Pick up at Ms. Kiki's, weekdays 3–7 pm" |
| Order confirmation | Amazon's "Order placed" page | Large pickup code with a copy button, shop address and hours, items, total |
| Your Orders | Amazon order history | Order cards with a status line: Paid, Packing, Ready, Picked up (from `status`: new, packing, ready, completed) |
| Admin with a sidebar | Shopify admin | Seller and admin screens: left menu, summary cards at the top (orders waiting, items in stock, payout), tables with actions on each row |

**Quality bar before cutover**

- Lighthouse on a mid-range phone: 90 or more for Performance, Accessibility and SEO on `/`, `/shops` and one `/s/<slug>`.
- Loading states use skeleton placeholders, never blank areas or a spinner over the whole page.
- All images go through `next/image`, sized for the screen.
- Everything works with a keyboard and a screen reader; shop colours keep the contrast-checked text colours the API already returns (`on_primary`, `on_accent`).

Search across every shop's snacks at once needs a new Flask endpoint, because the API returns items one shop at a time. The first version searches shop names, neighbourhoods and taglines, and the items within the shop being viewed.

## Day-by-day build plan

Five build days after Day 0, each ending with a check on `beta.neighborhoodcandylady.com` against the test-mode API. If a day's check fails, the next day starts by finishing it; nothing is skipped to keep the schedule.

### Day 1: Foundation

- [ ] Create `web/` with the commands above and connect it to the new Vercel project.
- [ ] Turn the `styles.css` variables into Tailwind theme tokens: the nine colours, `--radius-xl/lg/md` (32, 24, 18 px) and `--shadow`. Load Baloo 2 and Nunito with `next/font`.
- [ ] Build the shared layout: sticky header, footer with the links from today's pages, bottom tab bar on phones.
- [ ] Write `lib/session.ts`, the login, signup and logout routes, the `/api/flask` proxy and `middleware.ts`.
- [ ] Build `/login` and `/signup`. After sign-in, send buyers to `next` or `/shops`, sellers to `/seller` and admins to `/admin`.
- [ ] Write `lib/types.ts` from the shapes Flask returns (`User.to_dict`, `Seller.to_dict`, `Candy.to_dict`, `SellerInventory.to_dict`, `Order.to_dict`).
- [ ] Port the six information pages: about, FAQ, contact, terms, privacy, pickup.
- [ ] Add the Content Security Policy and the lint rule banning `dangerouslySetInnerHTML`.
- [ ] **Check:** sign in and out as the seeded buyer, seller and admin; every information page loads.

### Day 2: Storefront

- [ ] Write `lib/flask.ts` for server-side reads, refreshed every 30–60 seconds.
- [ ] Build `/`: hero with search, "Open now" shops from `GET /shops`, category tiles, how pickup works.
- [ ] Build `/shops`: shop cards from `GET /shops`, search and filter chips.
- [ ] Build `/s/[slug]` from `GET /shops/<slug>`: shop colours (checked again as `#rrggbb`), category tabs, product grid, quick view, approved photos, and per-shop page titles and link previews with `generateMetadata`.
- [ ] Build the cart store, the cart drawer, `/cart` and the "start a new cart?" dialog. Block adding more than the units in stock. On first load, import the old \`candyLadyCart\` and \`candyLadySellerId\` keys, then delete them along with \`candyLadyToken\`, \`candyLadyUser\` and \`candyLadyApiBase\`.
- [ ] **Check:** browse to a shop, add, change quantities and switch shops on a phone and a laptop, with no console errors.

### Day 3: Checkout and orders

- [ ] Wire **Pay** to `POST /api/flask/orders` and turn Flask's refusals into clear messages.
- [ ] Build `/checkout/return`: confirm, cancelled, "Finish paying" with one retry, "Release items", and the Android hand-off. Add the return redirect inside `/s/[slug]`.
- [ ] Build `/account/orders` from `GET /me/orders`: status line, pickup code, "Finish paying" on pending orders.
- [ ] Stretch: `/account` with change password (`PUT /me/password`) and delete account (`DELETE /me`), which the website lacks today.
- [ ] **Check:** pay with Stripe test card `4242 4242 4242 4242`, see the pickup code, cancel a second checkout and release its items, and confirm stock on staging went down and back up.

### Day 4: Sellers

- [ ] Build `/sell/apply` on `POST /applications`, then sign the new seller in.
- [ ] Build the seller layout: sidebar, role check, shop status banner for pending or rejected shops.
- [ ] `/seller`: paid pickup queue from `GET /sellers/<id>/orders`, advance with `PUT /orders/<id>/status`, refresh every 30 seconds.
- [ ] `/seller/inventory`: stock toggles (`PUT /sellers/<id>/inventory/<candy_id>`) and the seller's own items (`POST`, `PUT`, `DELETE /sellers/<id>/items`). A dialog form replaces today's `window.prompt` boxes.
- [ ] `/seller/storefront`: link, tagline, logo and colours (`PUT /sellers/<id>/storefront`) with a live preview of the shop page.
- [ ] `/seller/payouts` and `/seller/verify`: Stripe Connect and Identity, including the return redirects.
- [ ] `/seller/photos`: sign, upload straight to storage, confirm. Port the canvas re-encode that strips GPS data from phone photos. Allow the R2 upload host in the Content Security Policy's connect-src, and the image domain in img-src and in next/image's remotePatterns.
- [ ] **Check:** a new seller applies, gets approved on staging, finishes Connect test onboarding, and moves Day 3's order to Ready and Completed.

### Day 5: Admin, search engines and go/no-go

- [ ] `/admin`: approve and reject applications (`PUT /applications/<id>`).
- [ ] `/admin/revenue`: totals from `GET /admin/revenue`, recent orders from `GET /orders`, and a refund button with a confirmation step (`POST /admin/orders/<id>/refund`).
- [ ] `/admin/catalog` from `GET /candies` with category balance, and `/admin/photos` for photo review.
- [ ] `app/sitemap.ts` listing every shop page, `app/robots.ts`, favicon, link-preview images.
- [ ] The redirects in `next.config.ts`.
- [ ] Run the full Playwright suite, Lighthouse, and a manual pass on iPhone Safari and Android Chrome.
- [ ] **Go/no-go:** every flow in Testing and acceptance passes. Then follow Cutover.

## Testing and acceptance

Cutover happens only when all 14 flows below pass on `beta.neighborhoodcandylady.com` against the test-mode API. Flows 1–5, 7, 11 and 12 are automated in Playwright and run on every pull request; the rest are checked by hand once.

| # | Flow | Passes when |
| --- | --- | --- |
| 1 | Sign up, sign in, sign out | Cookie is `HttpOnly` and `Secure`; nothing is stored in `localStorage`; signing out returns to the sign-in screen |
| 2 | Session expiry | With the cookie's token expired, the next action shows the sign-in screen instead of an error |
| 3 | Browse and cart | Quantity stops at the units in stock; adding from a second shop asks before starting a new cart |
| 4 | Card payment | Test card `4242 4242 4242 4242` shows a pickup code; the order is `paid` on the API; the cart is empty |
| 5 | Cancel at Stripe | "Finish paying" reopens the same Stripe page; "Release items" puts the stock back |
| 6 | Payment with the tab closed | Close the tab on Stripe's success page before it returns; the webhook still marks the order paid within a minute |
| 7 | Checkout from a shop page | Stripe returns the buyer to that shop's flow, not the marketplace |
| 8 | Android hand-off | Opening a return link with no session on an Android phone offers `candylady://checkout-return?order=<id>` and nothing else |
| 9 | Seller journey | Apply, get approved, finish Connect test onboarding, move an order through Packing, Ready and Completed |
| 10 | Seller photo upload | The photo appears as "Waiting on review"; the stored file has no GPS data |
| 11 | Admin refund | A refunded order shows `refunded` and leaves the seller's queue |
| 12 | Permissions and forgery | A buyer cannot open `/seller` or `/admin`; a seller cannot open `/admin`; a write sent with another site's `Origin` gets 403; `?api=` in a URL changes nothing |
| 13 | Old links | Every old `.html` address lands on its new page; `/buyer.html?order=7&session_id=cs_test` keeps its query string |
| 14 | Search engines and speed | A shop page's HTML contains its name and products before JavaScript runs; the sitemap lists every approved shop; Lighthouse scores 90 or more |

The Flask test suite (233 tests on SQLite, 238 on Postgres) keeps running in CI unchanged, since the API is not modified.

## Cutover and rollback

Cutover is moving the domain from the old Vercel project to the new one, which takes about a minute; rollback is moving it back. No data changes at cutover, so there is nothing to undo in the database or in Stripe.

**Cutover, on a weekday morning when orders are slow**

1. Confirm the new project's production variables point at the live API, and that the last `main` build passed every check. Add the five STORAGE\_ variables to the production API on Render so photo uploads switch on with the new site.
2. In Vercel, move `www.neighborhoodcandylady.com` and `neighborhoodcandylady.com` from the old project to the new one.
3. Within 15 minutes, buy one real item for $0.50 or more, check the pickup code, then refund it from `/admin/revenue`. Sign in as a seller and upload one photo, then sign in as an admin and approve it.
4. Watch for the first 24 hours: Vercel logs for 404 and 500 responses, Render logs for a jump in 401 or 403 errors, and Stripe's webhook delivery page for failures.

**What users notice**

- Everyone signs in once more. Old sessions lived in `localStorage`, which the new site does not trust.
- Carts carry over. On first load the new site reads the old `candyLadyCart` and `candyLadySellerId` keys into the new cart, then deletes them.
- On that first load it also deletes `candyLadyToken`, `candyLadyUser` and `candyLadyApiBase`, so no old token or rogue API address lingers in anyone's browser.
- The Android app sees no change: it talks to the API directly, and its Stripe return still lands on the hand-off screen.

**Roll back if** checkout fails for real buyers, sign-in fails, or more than 1% of page loads return errors in the first hour. Move both domains back to the old project, which stays untouched for 7 days.

**One week after a stable cutover**

- [ ] Small Flask change: send Stripe returns to `/checkout/return`, `/seller/payouts` and `/seller/verify` directly instead of the old `.html` paths.
- [ ] Remove the 12 old HTML files, `app.js`, `styles.css` and `vercel.json` from the repo, and delete the old Vercel project.
- [ ] Add an entry to `AGENT_WORKLOG.md` covering the domain move and the new environment variables. Then scope the Android app revision against the new site, keeping the candylady:// hand-off until the updated app is in users' hands.

## Running on free tiers

All four services are on free plans today. Three of the four can carry this plan, but Vercel's free Hobby plan does not allow a site that takes payments, and that is true of the current site already.

| Service | Free-plan limit that matters | Effect on Candy Lady | What to do |
| --- | --- | --- | --- |
| Vercel Hobby | Non-commercial personal use only; "requesting or processing payment from visitors" counts as commercial ([fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)) | The live site already falls outside the Hobby terms, and Vercel can restrict it | Move the team to Pro (about $20 a month per member) before cutover |
| Render Free | Sleeps after 15 idle minutes and takes about a minute to wake; 750 free instance hours per workspace each month, after which every free service is suspended until the 1st ([Render free docs](https://render.com/docs/free)) | The first visitor after a quiet spell waits about a minute; a proxied request can time out first | Upgrade the production API to a paid always-on instance (about $7 a month). The staging API can stay free, since it sleeps and uses few hours |
| Neon Free | 100 compute-hours per project per month, 0.5 GB storage, 10 branches, sleeps after 5 idle minutes; when the hours run out the database stops until next month ([Neon plans](https://neon.com/docs/introduction/plans)) | Fits today's traffic. The staging branch shares the same 100 hours | Check usage in the Neon console weekly. An always-on API can keep the database awake around the clock, which would use more than 100 hours, so watch the first week after any Render upgrade |
| Stripe | There is no free tier: Stripe charges per payment. With destination charges, Stripe takes its fees from the platform's balance ([Stripe charge types](https://docs.stripe.com/connect/charges)) | The platform's 10% fee pays Stripe's fee on every order (see below) | Add a flat platform fee with `PLATFORM_FEE_FLAT_CENTS`, which the API already supports, or set a minimum order |

Photo storage on Cloudflare R2 fits its free plan too: 10 GB of storage, 1 million writes and 10 million reads a month, with no charge for downloads ([R2 pricing](https://developers.cloudflare.com/r2/pricing)). The browser shrinks a phone photo to about 300 KB before upload, and each shop holds at most 12 photos, so 10 GB is roughly 30,000 photos.

**Small orders lose money today.** At Stripe's standard US card rate of about 2.9% + 30¢ (approximate; Stripe's site could not be checked from here), the 10% platform fee covers Stripe's fee only above about $4.23 per order. That is where 10% of the order equals 2.9% of the order + 30¢.

| Order total | Platform fee (10%) | Stripe fee (approx.) | Platform keeps |
| --- | --- | --- | --- |
| $2.00 | $0.20 | $0.36 | −$0.16 |
| $5.00 | $0.50 | $0.45 | $0.05 |
| $10.00 | $1.00 | $0.59 | $0.41 |
| $20.00 | $2.00 | $0.88 | $1.12 |

Stripe Connect can also charge per active seller account and per payout, depending on how pricing is set up on the platform account; check the Connect section of the Stripe dashboard for the exact figures.

**Smallest budget that removes the blockers:** Vercel Pro and a Render paid instance, about $27 a month. Neon and Stripe stay as they are.

**If the API stays on Render's free plan:** the plan still works, but the site must expect a sleeping API. Shop pages are served from Vercel's cache so they never wait. The proxy gets the longest timeout the Vercel plan allows, and signed-in screens show "Waking up the shop, one moment" and retry instead of an error. Avoid free "keep-awake" pings: they use most of Render's 750 hours, leave nothing for the staging API, and keep the Neon database awake too.

## Risks and open questions

The biggest risk is the API, not the website: it runs on Render's free tier, which sleeps when idle, and server-rendered pages wait on it.

| Risk | Effect | What we do |
| --- | --- | --- |
| Render free tier sleeps after about 15 idle minutes | The first visitor waits 30 seconds or more; a Vercel function can time out first | Shop pages are served from Vercel's cache and refreshed in the background, so they never wait. Moving the API to a paid always-on instance removes the problem for signed-in pages |
| Vercel and Render in different regions | Every proxied call crosses the country, adding 50–100 ms | Put the Vercel functions in the same region as the Render service |
| Seller and admin screens take longer than Days 4–5 | Cutover slips | Cut over the buyer side alone. A Next.js `fallback` rewrite serves the old `seller.html`, `admin.html`, `app.js` and `styles.css` from the old deployment, and the seller and admin redirects wait until those screens ship |
| Test-mode Stripe Connect is not enabled on the platform account | Flows 9 and 11 cannot run on staging | Turn it on in the Stripe dashboard on Day 0 |
| Something differs between staging and the live API | A failure appears only after cutover | The real $0.50 purchase and refund at cutover, and the rollback rule |
| Search rankings shift with the new addresses | Fewer visits from Google for a few weeks | Permanent redirects from every old address, and the new sitemap listing every shop |

**Open questions**

- Will you move Vercel to Pro and the production API to a paid Render instance before cutover (about $27 a month together), or keep the API free and accept the wake-up wait?
- Who besides you uses the seller and admin screens and needs a heads-up about signing in again?
