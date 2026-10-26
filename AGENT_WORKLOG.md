# Agent worklog — Candy_App

Chronological ops notes from agents working on Neighborhood Candy Lady.
Do not put secret values here — prefixes and status only.

---

## 2026-09-22 — Stripe live cutover (Chief of Staff)

### Goal
Get production API out of Stripe test mode so real-card checkout works.

### Sequence
1. Confirmed production `GET /config` was still `stripe_mode: "test"` / `pk_test_…`.
2. Opened Stripe Dashboard (live) + Render `Candy-Lady-api` on the box desktop.
3. Hit Stripe “Verification required” when revealing the live Secret key; Joshua completed email verification and handed the desktop back.
4. Set Render env (values never logged):
   - `STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
   - `STRIPE_SECRET_KEY` → `sk_live_…`
   - `STRIPE_WEBHOOK_SECRET` → `whsec_…` (created this session)
5. Created live Stripe webhook:
   - URL: `https://api.neighborhoodcandylady.com/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
6. Redeployed Render successfully.
7. Verified `GET https://api.neighborhoodcandylady.com/config` → `stripe_enabled: true`, `stripe_mode: "live"`, publishable prefix `pk_live_`.

### Docs updated same day
- Root `README.md` — Payments section now documents live production + local test keys.
- This `AGENT_WORKLOG.md` created.

### Still open
- **USD payout bank** not linked in Stripe (“Add a bank account”). Charges can work; payouts to bank will not until Joshua adds one.
- Photo uploads still off (`uploads_enabled: false`) until R2/`STORAGE_*` env is set.
- No live end-to-end card charge run in this session (optional next step with Joshua’s OK).
- Identity webhook events (`identity.verification_session.*`) not added to the new live endpoint yet; refresh endpoint still works without them.

## 2026-09-24 — Help pages, policies, SEO (Chief of Staff, backfilled 09-26)

- PR #14: About (nostalgia copy), FAQ, Contact pages plus a site-wide footer.
- PR #15: Terms, pickup/refund policy, favicon, `robots.txt`, `sitemap.xml`,
  footer Help links. Verified live after merge.
- FAQ intentionally omits seller fee %, payout timing, and email reply time
  until Joshua decides them.
- Google Workspace for `hello@neighborhoodcandylady.com` pending domain
  release; verification CNAME added in Vercel DNS.

## 2026-09-25 — Seller-owned shop items

- Added additive candy ownership and active-state fields so existing catalog rows remain global.
- Added seller item create, edit, stock, price, and soft-remove APIs and dashboard controls.
- Kept custom items scoped to their owner in inventory, storefront, and checkout flows.
- (PR #16.) Render needed a manual redeploy after merge; auto-deploy did not pick it up.

## 2026-09-25 — Stripe Connect (Express) + per-shop storefronts

- Card checkout is now a Connect destination charge to the shop's Express
  account; `application_fee_amount = platform_fee_cents`. Shops that are not
  `charges_enabled` get a 409 instead of a platform-only charge.
- **Deploy impact:** every existing shop starts unconnected, so card checkout
  pauses per shop until its seller finishes "Connect Stripe" on seller.html.
- Joshua's side: enable Connect (Express) in the live Stripe Dashboard; add a
  "Connected accounts" webhook for `account.updated` to the same URL and set
  `STRIPE_CONNECT_WEBHOOK_SECRET` on Render (optional).
- Seller slug/tagline/theme/logo columns added by boot migration; approved
  shops backfilled with slugs; public page at `/s/<slug>` (vercel rewrite).

## 2026-09-26 — PR #17 merged and Connect go-live (Chief of Staff)

- PR #17 had an add/add conflict on a leftover temporary GitHub Actions
  workflow (`.github/workflows/assemble-exact-four.yml`). Claude desktop
  resolved it; PR squash-merged to `main` as `3ad50ac`.
- Render `Candy-Lady-api` manually redeployed to `3ad50ac`.
- Stripe (live): Connect Express enabled; "Connected accounts" webhook added at
  `https://api.neighborhoodcandylady.com/stripe/webhook` for `account.updated`.
- Render env `STRIPE_CONNECT_WEBHOOK_SECRET` set (`whsec_…`, value not logged);
  redeployed (`dep-darvq0d9fdbs73b9k6s0`, Live). `/health` 200.
- Verified: `/config` shows `connect_enabled: true`; sellers endpoint returns
  slugs; `/s/ms-kikis-snack-spot` and `/s/northview-snack-stop` return 200.
- Removed stray `backend/models.py.rej` (patch-reject leftover; its changes
  were already in `models.py`).

### Still open
- Both shops show `accepts_card_payments: false` until each seller finishes
  Connect onboarding on seller.html.
- Self-serve seller onboarding (last white-label piece) not started.

## 2026-09-27 — Site audit fixes: dashboard gating, header/footer, forms

### Audit findings (Joshua's click-through)
- No 404s; header placement consistent. But:
- **seller.html / admin.html showed their dashboards to logged-out visitors**,
  and the public header linked to Admin.
- Password fields on buyer/seller/apply rendered as solid black boxes.
- buyer.html showed an empty white alert bar between hero and account.
- Five different header link sets across pages.
- Footer duplicated itself (Shop/Apply twice, Privacy three times per page);
  homepage ran the shop/apply CTA three times.
- "How pickup works" (homepage anchor) vs "Pickup & refunds" (/pickup).
- buyer.html shop cards had two near-identical buttons.
- /pickup reportedly rendered an extended version with a TOC, then a short one.

### Root cause of the dashboard exposure
- styles.css had no global `[hidden]` rule, so class rules such as
  `.app-layout { display: grid }` overrode the browser's `[hidden]` style and
  the gated `<main hidden>` showed. **No data leaked:** the dashboards only
  fetch after `/me` confirms the role, and every seller/admin API route
  already required a JWT, the role, and (for shop routes) ownership.
- The same bug produced the empty payment banner on buyer.html.

### Fixes (in the order Joshua set)
1. Gating: global `[hidden] { display: none !important; }`; logout reloads
   the page so rendered orders/payouts don't stay in the DOM; Admin removed
   from public headers; `noindex` on seller.html/admin.html.
2. Form fields: `color-scheme: light` site-wide, `appearance: none` on
   `.form-field` inputs, and an autofill override pinning paper/ink colors.
3. Empty alert bar: fixed by (1).
4. Header: one set everywhere, Shop · Sell · Apply · Pickup & refunds · FAQ,
   root-absolute links (work from `/s/<slug>`), current page `aria-current`.
   "How pickup works" label removed: the homepage anchor it used is a feature
   list, so /pickup is the single "Pickup & refunds" page.
5. Footer: one shared footer, each destination once; Terms/Privacy only in the
   bottom bar; footer CTA buttons removed (homepage CTA now twice, not three
   times).
6. /pickup: `"trailingSlash": false` in vercel.json, because
   `www…/pickup/` (and every pretty URL with a slash) returned 404.
- Shop cards: kept "Shop this spot" (loads the shelf on buyer.html where cart
  and checkout live); removed "Shop page". `/s/<slug>` links still work.

### New tests
- `backend/tests/test_access_control.py` (55 tests): walks the Flask URL map so
  any non-public route must 401 without a token (new routes are covered
  automatically unless added to `PUBLIC_ROUTES`); admin routes 403 for buyers
  and sellers; seller routes 403 for buyers and for another shop's seller;
  rightful seller/admin still get 200. Checked it fails if a guard is removed.
- Full backend suite: 189 passed, 5 skipped (Postgres-only).

### Verified vs not reproduced
- Verified locally (API + static server, browser pane): logged-out
  seller/admin show only the login form and make no API calls; unauthenticated
  requests to seller/admin endpoints return 401; a seller token on admin.html
  is refused after `/me`; logout clears token and DOM; buyer banner hidden;
  one header/footer set on all 12 pages; all links resolve per vercel.json;
  no horizontal scroll at 375px.
- **#2 not reproduced:** production CSS/HTML are byte-identical to the repo and
  fields render correctly in light and dark mode here. Fix targets the likely
  causes (dark-scheme native controls, autofill); unconfirmed on Joshua's
  browser.
- **#6 not reproduced:** production `/pickup` returned the same short page on
  every fetch, and no version of pickup.html with a TOC exists in any commit.

### Also this session
- The branch's leftover uncommitted `app.js` / `backend/app.py` were
  byte-identical to `3ad50ac` (#17, already on `main`), as were the
  `.agent-staging/` chunks once reassembled. The fixes were rebased onto
  `main` as their own commits, so neither needed a commit here.

### Still open
- `trailingSlash` fix can only be verified after a Vercel deploy.
- The long /pickup version with a TOC is unexplained; need the exact URL
  (e.g. a preview deployment) if it shows up again.
- Black password fields: confirm after deploy on the browser/OS that showed it.
- Not deployed; merge is Joshua's call.

## 2026-10-01 — Order lifecycle logic review fixes (Claude Code)

Branch `claude/determined-bell-8tntzt`. Backend only; no env, Stripe, Render or
Vercel settings were changed. Not deployed.

### Fixed
- Refunded orders could be flipped back to `paid` by a reloaded return page or
  a replayed `checkout.session.completed`, re-showing the pickup code and
  putting the order back in the seller queue. Payment state now only moves
  forward from `unpaid`/`pending`/`expired`.
- Webhooks for a replaced Checkout Session (after a resume) could expire the
  live checkout and release its stock. They are now ignored.
- The abandonment sweep measured from `created_at`, so it could expire a
  resumed checkout mid-payment. New `order.checkout_started_at` column (added
  by the boot migration) is used instead.
- Cancel and account deletion now expire the Stripe session.
- `DELETE /candies/<id>` hard-deleted rows that order lines reference, a 500
  on Postgres. It now retires the item.
- Non-numeric or fractional quantity / count / price input returned 500 or was
  truncated; now a 400. Admin prices can no longer be negative.
- A count-only inventory update left the stock label stale; status now follows
  the count.
- Partial-refund `charge.refunded` events no longer mark the whole order refunded.
- Wrong current password on `PUT /me/password` and `DELETE /me` is now 403
  (was 401, which the frontend treats as sign-out).
- `POST /orders` no longer holds row locks across the Stripe call.
- The API refuses to boot against a non-SQLite database with the default
  `JWT_SECRET_KEY`.

### Review follow-up (Codex review on PR #19)
- Payment-state changes lock the order row first, so concurrent confirms
  cannot reserve stock twice and concurrent resumes open one session.
- A paid completion is accepted for any of the order's sessions.
- New `order.refunded_cents` column records partial refunds; revenue and
  seller payouts are net of them.

### Second Codex review
- A refund delivered before its payment completion is recorded and honoured;
  an unmatched `charge.refunded` answers 409 so Stripe redelivers it.
- `POST /orders` re-checks the order after the Stripe call and expires the new
  session if the order was released meanwhile.
- Seller payout totals clamp each order at zero before summing.

### Third Codex review
- No backfill of `refunded_cents` for orders already `refunded`: the old
  handler marked partial refunds that way too, so the amount stays unknown (0)
  until a `charge.refunded` for the order records it.
- New `order.platform_fee_refunded_cents`, read from Stripe's application fee
  on `charge.refunded` (no new webhook subscription needed). Revenue and seller
  payouts use the net fee.

### Fourth Codex review
- Resume answers 409 while `POST /orders` is still opening the first session,
  and `POST /orders` withdraws its session if one was attached meanwhile, so
  one order never has two payable sessions.
- Admin refund records the application fee Stripe actually returned instead
  of assuming all of it.

### Deploy note
- Before merging, confirm `JWT_SECRET_KEY` is set on Render. If it is not, the
  new deploy will fail to start (Render keeps the previous deploy serving).

## 2026-10-03 — Close the `?api=` override hole in the live site (Claude Code)

Day 0 task 1 of the Next.js migration plan, shipped on its own. Frontend only;
no API, environment variable, Stripe, Render or Vercel setting was changed.

### Problem
- `app.js` accepted `?api=<any URL>` on every host and saved it in
  `localStorage` (`candyLadyApiBase`). One crafted link to the real site made
  the visitor's browser send sign-in passwords and session tokens to that URL,
  on that visit and every later one.

### Fix
- Overrides (`?api=`, `window.CANDY_LADY_API_BASE_URL`) are honoured only when
  the page is served from `localhost` or `127.0.0.1`, and only for `http(s)`
  URLs.
- On any other host the frontend always uses
  `https://api.neighborhoodcandylady.com` and deletes a saved override, so
  browsers poisoned before this fix are cleaned on their next visit.
- `README.md` documents the local-only rule.

### Verified
- Headless Chromium, every network request intercepted, the site served under
  `www.neighborhoodcandylady.com` and under `localhost:5500`. Old code: a
  `?api=` link sent the buyer sign-in `POST /login` to the foreign host and
  kept it saved. New code: the live host only contacts the real API and the
  saved override is erased; localhost overrides still work.

### Still open
- Live only after this PR is merged and Vercel deploys `main`.
- `JWT_SECRET_KEY` confirmed set on Render by Joshua (Day 0 task 2).

## 2026-10-03 — Admin link in the site menu (Claude Code)

Frontend only; no API, environment, Stripe, Render or Vercel change.

- No page linked to `/admin.html`, so an admin could not find where to approve
  seller applications. A signed-in admin now gets an "Admin" link in the top
  menu of every page, before "Log out" where a page has one.
- Shown only when a session token is stored and the stored user's role is
  `admin`; it appears on sign-in and disappears on sign-out without a reload,
  including from another tab. This is a convenience, not access control: the
  dashboard and every admin API route still check the role on the server.
- Verified in headless Chromium against intercepted API responses: admin sees
  one link on 5 pages, buyers, signed-out visitors and a stale record without
  a token see none, no JavaScript errors.

## 2026-10-03 — Test-mode staging API, part 1 (Claude Code)

Day 0 task 3 of the Next.js migration plan. Production (Neon `production`
branch, Render `Candy-Lady-api`, live Stripe, DNS) was not changed.

### Done
- Day 0 task 2 closed: Joshua confirmed `JWT_SECRET_KEY` is set on the
  production API.
- Neon project `CandyLadyApp`: new branch `staging` (`br-muddy-fire-ay664xbo`),
  copied from `production` on 2026-10-03 (14 users, 2 sellers, 12 orders, none
  open). The branch's `neondb_owner` password was reset, so the staging
  connection string cannot open the production branch.
- Render: new web service `Candy-Lady-api-staging` (`srv-db0h0ls9v7es73bdencg`),
  free plan, Ohio, `main` with auto-deploy, build
  `cd backend && pip install -r requirements.txt`, start
  `cd backend && gunicorn app:app`, URL
  `https://candy-lady-api-staging.onrender.com`.
- Staging env set (values not logged): `DATABASE_URL` (staging branch),
  `JWT_SECRET_KEY` (new, different from production), `PUBLIC_SITE_URL` =
  `https://beta.neighborhoodcandylady.com`.
- Staging data scrubbed (Joshua's go, after a Codex review on PR #21), on the
  `staging` branch only: every user's name and email replaced with
  `Staging user <id>` / `user<id>@staging.invalid`, every password hash
  replaced with one for a discarded random password, photo keys cleared and
  Stripe Identity state reset to `unstarted` (session id, verified time and
  error code cleared); seller contact name/email replaced the same way and
  Stripe Connect ids and readiness flags cleared, so real logins do not work on
  staging and test-mode Connect onboarding starts fresh. Shops, items and
  orders are kept. Checked afterwards: 0 real emails, 0 live Connect ids.

### Still open (needs Joshua)
- Stripe test mode: set `STRIPE_SECRET_KEY` (`sk_test_…`) and
  `STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) on the staging service; add a
  test-mode webhook at `…/stripe/webhook` for `checkout.session.completed`,
  `checkout.session.expired`, `charge.refunded` and put its secret in
  `STRIPE_WEBHOOK_SECRET`. Until then staging has payments off.
- Custom domain `api-staging.neighborhoodcandylady.com`: add it to the staging
  service in Render, then add the CNAME Render shows in Vercel DNS.
- `CORS_ORIGINS` left unset (defaults to `*`); Day 0 task 5 sets it.
- No admin can log in to staging after the scrub: set `ADMIN_BOOTSTRAP_EMAIL`
  and `ADMIN_BOOTSTRAP_PASSWORD` on the staging service (staging-only values),
  redeploy, then remove them.
- Copied paid orders still carry live Stripe payment ids; refunding them on
  staging will fail in test mode.
## 2026-10-15 — Day 0 migration checklist checkpoint (Coda)

The Next.js migration plan document referenced in earlier entries is not in
the repo (checked `main`, both `park/` branches, and GitHub issues), so the
verified Day 0 status is recorded here.

| Task | Status |
| --- | --- |
| 1. Close the `?api=` hole | Done — PR #20 merged Oct 3 |
| 2. Confirm `JWT_SECRET_KEY` on Render | Done — confirmed by Joshua Oct 3 |
| 3. Test-mode staging API | Half done — Neon staging DB branch + Render staging service (`candy-lady-api-staging.onrender.com`) live, PII scrubbed (worklog entry in open PR #21). Still needed: Stripe test keys + test-mode webhook on the staging service, `api-staging.neighborhoodcandylady.com` DNS, one-time admin bootstrap |
| 4. Second Vercel project on Pro | Not started — no record in repo or worklog |
| 5. Add new site addresses to `CORS_ORIGINS` | Not done — staging still allows every origin |
| 6. Cloudflare R2 photo storage | Not started — no record in repo or worklog |

Shipped since the plan was written: PR #19 (order/payment correctness, Oct 2),
PR #23 (admin menu link, Oct 3). Still open: PR #21 (staging worklog, safe to
merge), PR #22 (stock-reservation fix, draft — needs un-draft, rebase onto
`main`, then merge), PR #10 (Sept 12 Cloud Agent dev environment, likely
stale). Next.js build not started; no `web/` folder yet.
## 2026-10-15 — Test-mode staging API, part 2 (Claude Code)

Day 0 task 3, resumed after the Oct 5 pause. Production records and services
were not changed.

- Vercel DNS: added `api-staging` CNAME → `candy-lady-api-staging.onrender.com`
  (TTL 60). Existing records untouched. Render still has to be told about the
  domain (staging service → Settings → Custom Domains) before it serves on it.
- Staging service checked on Render: still serving `e3b16fa`; no deploys or env
  changes since Oct 3, so Stripe test keys, webhook secret and admin bootstrap
  are still unset. Auto-deploy did not pick up later `main` merges (backend
  code unchanged since `e3b16fa`).

## 2026-10-16 — Migration plan copied into the repo (Claude Code)

- `docs/NEXTJS_MIGRATION_PLAN.md`: verbatim Markdown export of the Claude Doc
  plan (revision 34), with a separate Day 0 status note at the top taken from
  the Oct 15 checkpoint. No code, env or service changes.

## 2026-10-16 — Next.js Day 1 step 1: `web/` scaffold (Claude Code)

First coding task of the migration plan. No API, env, Stripe, Render, Vercel or
DNS change; the Vercel connect half waits for the second project.

- `create-next-app@latest` installs Next.js 16.4.2, so per Joshua the app was
  created with `create-next-app@15.5.28` and the same flags: Next 15.5.28,
  React 19.1.0, Tailwind 4, ESLint, App Router, no `src/`, `@/*` alias.
- Added `zustand`, `@tanstack/react-query` and dev `@playwright/test`.
- Root `.vercelignore` excludes `/web` so the static site does not publish it.
- Blocked: `shadcn init` / `shadcn add` need `ui.shadcn.com`, which this
  environment's network policy refuses (403). `npx playwright install
  chromium` was not run here; it only downloads a browser and adds no files.
- `npm audit --omit=dev`: Next 15 bundles a postcss with high-severity
  advisories; the only fix offered is Next 16.
- Checked: `npm run lint`, `tsc --noEmit` and `npm run build` pass.

## 2026-10-18 — Day 1 step 1 finished: shadcn, `.vercelignore`, staging logins (Claude Code)

- `ui.shadcn.com` allowed by Joshua. In `web/`: `npx shadcn@latest init`
  (defaults: `base-nova` style, Base UI, neutral, CSS variables) and
  `npx shadcn@latest add button card sheet dialog badge input tabs table sonner
  skeleton dropdown-menu`. `npm run lint`, `tsc --noEmit` and `npm run build`
  pass.
- Root `.vercelignore` now also excludes `/docs`, `/backend`,
  `/AGENT_WORKLOG.md` and `/REVIEW_NOTES.md`. Before this, the live static site
  served them (checked: `/AGENT_WORKLOG.md` and `/backend/requirements.txt`
  returned 200 on www). No HTML, JS, CSS, `vercel.json`, `robots.txt` or
  `sitemap.xml` references those paths.
- Staging only (Neon branch `staging`, never production), on Joshua's go:
  buyer `user1@staging.invalid` (user 1, has 2 orders) got a new
  staging-only password, and a seller login `seller1@staging.invalid` (user 16,
  role seller) was added for the existing shop Ms. Kiki's Snack Spot (seller 1);
  the copied data had no seller-role users. Passwords are stored only as
  `STAGING_TEST_BUYER_PASSWORD` and `STAGING_TEST_SELLER_PASSWORD` on the
  Render staging service's environment (the app does not read them). Setting
  them redeployed staging.

## 2026-10-18 — candy-beta build fix: keep web/ private without .vercelignore (Claude Code)

- candy-beta (Root Directory `web`) failed with `NEXT_NO_VERSION`. Its build
  log shows `Found .vercelignore (repository root)`: Vercel applies the
  repo-root `.vercelignore` to every project on this repo, so `/web` stripped
  `web/package.json`.
- Removed `/web` from `.vercelignore`. The static site (candy-app) now keeps
  `web/` private with two `redirects` in the root `vercel.json` (`/web` and
  `/web/:path*` to `/`). Redirects run before Vercel serves a static file, so
  no `web/` source is served; rewrites would not work, because a matching
  file wins over a rewrite. candy-beta reads `web/vercel.json` (none), not the
  root one, so it is unaffected. No Vercel or Render settings were changed.

## 2026-10-18 — Public contact email switched to hello@ (Claude Code)

- Every public page of the static site showed a personal Gmail address in the
  footer and contact text. All 22 occurrences in 12 HTML files (`index`,
  `about`, `faq`, `contact`, `privacy`, `terms`, `pickup`, `apply`, `seller`,
  `buyer`, `admin`, and `shop.html`, which serves `/s/<slug>`) now use
  `hello@neighborhoodcandylady.com`, including the `mailto:` links.
- Checked with no change needed: `web/`, `backend/` (no outbound email,
  error message or `/config` field carries a contact address), `app.js`,
  `README.md`, `robots.txt`, `sitemap.xml`. Internal docs are not published
  and were left alone. No Vercel or Render settings were changed.

## 2026-10-20 — Next.js Day 1 finished: layout, sign-in, proxy, info pages (Claude Code)

- Joshua's go (Oct 20): Days 1–5 of `docs/NEXTJS_MIGRATION_PLAN.md`, one PR
  per day into `staging`, stop at cutover. PR #22 and the staging Render
  branch are waiting on his decision and were not touched.
- `web/` now has the brand tokens (nine colours, 18/24/32 px radii, shadow),
  Baloo 2 and Nunito via `next/font`, the sticky header, footer and phone tab
  bar, `lib/session.ts`, `/api/auth/login|signup|logout|session`, the
  `/api/flask/[...path]` proxy, `middleware.ts`, `/login`, `/signup`,
  `lib/types.ts` and the six information pages (contact email is hello@).
- Added beyond the plan's code: `/api/auth/session` (answers "signed out"
  without calling Flask when there is no cookie, so the header never wakes
  Render), and the cookie is cleared with its full attributes, because
  browsers ignore a `__Host-` cookie set without Secure and Path=/.
- Codex plan question on CSP vs cached pages, default picked (Joshua can change it):
  nonce policy only on `/account`, `/seller`, `/admin`, `/login`, `/signup`,
  `/checkout`; cached public pages get a fixed policy with inline scripts
  allowed. Lint bans `dangerouslySetInnerHTML`.
- New `Web CI` workflow: lint, types, build, and Playwright tests against a
  local Flask on SQLite seeded by `backend/seed.py` (36 tests, phone and
  laptop). No Vercel or Render settings were changed.

## 2026-10-20 — Next.js Day 2: home, shops, shop pages, cart (Claude Code)

- `/`, `/shops` and `/s/[slug]` are server-rendered from `GET /shops` and
  `GET /shops/<slug>` (`lib/flask.ts`) and cached: `/` refreshes every 60 s,
  the others every 30 s. An unreachable API at build time builds the page
  empty instead of failing the deploy; after that a failed refresh keeps the
  last good copy.
- Cart: `store/cart.ts` (one shop per cart, never above stock), the drawer,
  `/cart` and the "Start a new cart?" dialog. Checkout itself is Day 3.
- Codex plan questions, defaults picked (Joshua can change them): seller logos
  on other hosts render unresized and any https image is allowed; the old
  `candyLadyCart`/`candyLadySellerId` keys are imported on first load and then
  kept in sync with the new cart for the rollback window (remove with the old
  site), while `candyLadyToken`, `candyLadyUser` and `candyLadyApiBase` are
  deleted.
- Found, not fixed (Flask, out of scope): `category_for_name` puts "Chocolate
  Bar" under drinks, because "chocolate" contains "cola".
- Browser tests now 50 (phone and laptop). No Vercel or Render settings changed.

## 2026-10-20 — Next.js Day 3: checkout, Stripe return, buyer account (Claude Code)

- Pay button (`components/cart/checkout-button.tsx`) posts the cart to Flask's
  `POST /orders` through the proxy and sends the buyer to Stripe. Signed-out
  buyers go to `/login?next=` and come back to the same shop. Flask's refusals
  (shop not set up for cards, cards off on this API, sold out, under $0.50)
  show as plain sentences in the cart.
- Stripe still returns to the old URLs Flask builds (`/buyer.html?order=` and
  `/s/<slug>?order=`); `next.config.ts` redirects both to `/checkout/return`,
  which confirms the payment, clears the cart when paid, offers "finish paying"
  or "release my snacks" when cancelled, and hands Android app buyers back to
  `candylady://checkout-return`.
- `/account` (change password, delete account, sign out) and `/account/orders`
  (last 25 orders with pickup codes).
- Browser tests now 64. A real Stripe test-card payment on beta is left for
  Joshua to try by hand. No Vercel or Render settings changed.

## 2026-10-20 — Next.js Day 4: seller screens (Claude Code)

- `/sell/apply` (application, then the new seller is signed in) and the seller
  dashboard: `/seller` pickup queue (refreshes every 30 s), `/seller/inventory`
  (stock toggles, own items in a dialog instead of `window.prompt`),
  `/seller/storefront` (link, tagline, logo, colours, live preview),
  `/seller/payouts` (Stripe Connect), `/seller/verify` (Stripe Identity) and
  `/seller/photos` (canvas re-encode that drops GPS data, then a signed upload
  straight to R2).
- Stripe's `/seller.html?stripe=…` and `?identity=return` returns redirect to
  the new pages with the query kept.
- New optional env var on the web project: `UPLOAD_ORIGIN`, the origin of the
  API's `STORAGE_ENDPOINT_URL`. It is added to connect-src; without it the
  browser blocks photo uploads. Not set anywhere yet (needs Joshua).
- PR #22 (stock reservations) is not folded in: it changes the API, and the
  staging API deploys from `main`. Waiting on Joshua's answer.
- Browser tests now 80. No Vercel or Render settings changed.

## 2026-10-20 — Next.js Day 5: admin, search engines, old addresses (Claude Code)

- Admin screens: `/admin` (approve or reject applications), `/admin/revenue`
  (totals, latest 200 orders, refund with a confirm step), `/admin/catalog`
  (category balance) and `/admin/photos` (photo review).
- `app/sitemap.ts` lists every approved shop; `app/robots.ts` and a `noindex`
  tag keep search engines out unless `NEXT_PUBLIC_SITE_URL` is the real
  domain, so beta is never indexed. At cutover that variable must become
  `https://neighborhoodcandylady.com`. A generated link-preview image.
- Every old `.html` address redirects permanently (308) to its new page.
- Lighthouse (mobile, local build with the production site URL): `/`,
  `/shops` and a shop page score 93+ performance, 100 accessibility, best
  practices and SEO.
- Browser tests now 100. Not done here: the manual pass on iPhone Safari and
  Android Chrome, and the Stripe test-mode flows (4, 6, 9) on beta.
- No Vercel or Render settings changed. Cutover not started.

## 2026-10-22 — Beta: approved shops show on /shops straight away (Claude Code)

- Joshua approved Beta Test Snacks on beta and it was missing from `/shops`
  while `/s/beta-test-snacks` loaded. Neon staging had it approved with a
  slug, so Flask was right; `/shops` and `/` are cached for 30 to 60 seconds
  and the first visit after a change gets the old copy (a cold Render API
  can keep it longer).
- New server action `web/app/actions/refresh-shops.ts` drops the cached `/`,
  `/shops`, shop pages and sitemap after an admin approves or rejects a shop
  and after a seller saves their shop page, items or stock.
- The admin browser test now loads `/shops` before approving and expects the
  shop right after; without the fix it fails the same way beta did.

## 2026-10-03 — Seller stock edits during open checkouts

- Seller stock saves set an absolute count with no row lock, so a save could
  overwrite a reservation that was committing, and a shelf count typed while
  a checkout held units was inflated when that checkout was abandoned
  (10 on the shelf, 3 held, seller types 10, release makes it 13).
- Both stock PUT routes now lock the shelf row (same lock as checkout and the
  sweep). The seller dashboard sends `on_hand_count` (what is on the shelf);
  the API subtracts units held by open checkouts. `inventory_count` alone keeps
  its old meaning. Seller inventory responses add `reserved_count` and
  `on_hand_count`.
- A payment that lands after the sweep released its stock, when that stock has
  since been sold, now records `order.stock_shortfall` (new column, boot
  migration, default 0) and logs a warning. The seller order queue shows it.
- Known limit: marking an item "out" while a checkout holds units still lets
  those units come back if that checkout is abandoned.
- Deploy order does not matter: the dashboard sends both fields.

## 2026-10-22 — Stock reservations (#22) folded into staging (Claude Code)

- Merged draft #22's branch into `staging` unchanged on the API side (row
  lock on seller stock saves, `on_hand_count`, `reserved_count`,
  `order.stock_shortfall` added by the boot migration).
- Ported its dashboard half to the Next.js seller screens: the stock dialog
  starts from the shelf count and sends `on_hand_count` (plus
  `inventory_count` for an older API), rows show "N held in open
  checkouts", and the pickup queue warns when a late payment left an order
  short.
- The staging API deploys from `staging`, so the new column lands on the
  Neon staging branch only. Production gets it only when `staging` reaches
  `main` at cutover.
- API tests: 245 passed, 8 skipped (SQLite). Browser tests: 102 passed.
- No Vercel or Render settings changed. Cutover not started.
- Later the same day: brought `staging` (#35's /shops refresh) into the
  branch, and the seller inventory read now takes the stock label from the
  same statement as the count and held units, so a sale in between cannot
  show "0 left" next to "In stock" (Codex finding).

## 2026-10-22 — Connect accounts created through Accounts v2 (Claude Code)

- Joshua turned on "Accounts v1 support" in the Stripe sandbox because the
  v1 account create was refused. `backend/connect.py` now creates accounts
  with `POST /v2/core/accounts` (Express dashboard, merchant `card_payments`
  and recipient `stripe_transfers` requested, fees and losses on the
  platform), retrieves them with v2 and opens onboarding with v2 Account
  Links. The Express login link stays on v1 (v2 has none); destination
  charges and refunds are unchanged.
- `connect.readiness` reads both shapes: the v1 `account.updated` webhook
  still sends `charges_enabled` / `details_submitted`.
- Checked against the request shapes in stripe-python 15.6.1 (API version
  2026-08-26.dahlia); Stripe's docs site is blocked from this container.
  Not yet tried against Stripe itself.
- API tests: 239 passed, 7 skipped. No Stripe, Vercel or Render settings
  changed. Cutover not started.

## 2026-10-24 — Merged main into staging before cutover (Claude Code)

- Joshua asked for `main` to be merged into `staging` so the later
  staging-to-main cutover PR is clean. `main` had one change staging lacked:
  PR #27 (public contact email switched to hello@ on the 12 static pages).
- The only conflict was this file. Both sides were kept in full; main's
  2026-10-18 entry sits before staging's 2026-10-20 entries so the log stays
  in date order. The 12 HTML files merged without conflict.
- No Vercel, Render, Stripe or DNS settings changed. Cutover not started.

## 2026-10-24 — Footer with a "Get it on Google Play" badge (Claude Code)

- The web/ footer now carries Google's "Get it on Google Play" badge,
  linking to https://play.google.com/store/apps/details?id=com.neighborhoodcandylady.app,
  next to the existing footer links, plus the trademark line Google's badge
  rules ask for ("Google Play and the Google Play logo are trademarks of
  Google LLC."). Badge is 48px tall with at least a quarter of its height
  clear around it, artwork unchanged.
- The footer was only on the store pages. It is now also on /login,
  /signup and the bare 404 page, so every web/ page has it.
- Badge served from web/public/badges/google-play-en.svg (no request to
  Google). play.google.com and Google's partner site are blocked from this
  container, so the file came from the npm package @mynameiskazim/storebadge
  (googleplay-en.svg), which is Google's current badge export. Swap in the
  file from Google's badge page if wanted; same name, nothing else changes.
- Browser tests: 112 passed (10 new). Lint, typecheck and build clean.
- No Vercel, Render, DNS or production settings changed. Cutover not started.

## 2026-10-24 — In-site messaging inbox (Claude Code)

- Ask 3 of Joshua's pre-cutover list, as its own PR into `staging`.
- API: `backend/messaging.py` blueprint plus six new tables (created by
  `db.create_all()` on boot, nothing existing altered). Support threads
  (buyers and shops to admin, any admin answers as "Candy Lady support"),
  shop-to-shop threads between approved shops, and one thread per paid order
  between buyer and shop. Unread counts, read markers, block/unblock,
  reports with an admin review list. Per-login rate limits and a 2000
  character cap. Account deletion keeps the other side's history but
  removes the link to the person.
- Site: `/account/messages` inbox, thread and new-message pages,
  `/admin/messages` support inbox with reported messages, an unread badge in
  the header, account menu and dashboard nav, and "Message the shop" /
  "Message the buyer" links on order cards and the pickup queue.
- Email notices: the API had no email setup, so `backend/mailer.py`
  (Resend HTTP API, stdlib only) is behind `MESSAGE_EMAIL_NOTIFICATIONS`,
  off by default. Turning it on needs a Resend account, the domain verified
  there (DNS records), and `RESEND_API_KEY` / `MESSAGE_EMAIL_FROM` /
  optionally `SUPPORT_NOTIFY_EMAIL` on Render. None of that was done here.
- Staging only: the new tables appear on the staging Neon branch when the
  staging API next deploys from `staging`. No Vercel, Render, Neon, DNS or
  production settings changed.
- Codex review fixes in the same PR: messaging caches keyed by the signed-in
  login, rate-limit checks serialized per login (row lock), read marker stops
  at the newest message the browser showed (and is updated under a row
  lock), inbox pages 50 at a time with previews fetched in one query.
- API tests: 279 passed, 8 skipped (SQLite). Browser tests: 104 passed.

## 2026-10-24 — Private seller pickup address (Claude Code)

- Joshua's ask 1 before cutover: buyers only saw the neighborhood and pickup
  hours after paying. Sellers now have a private `pickup_address` and
  `pickup_note` (new nullable columns, added by the boot migration; existing
  shops start empty, nothing guessed).
- Who sees them: the shop's owner and admins, and a buyer only on an order
  that is paid (same gate as the pickup code: `Order.pickup_dict`). Unpaid,
  expired and refunded orders get `pickup: null`. Public routes (`/sellers`,
  `/shops`, `/shops/<slug>`, storefront) are unchanged and tested not to
  contain them.
- Web: asked for in the shop application (address required in the form,
  optional in the API so older clients still apply), editable on a new
  seller page `/seller/pickup`, a dashboard prompt for shops without one,
  shown on the checkout return page, the order card and a new receipt page
  `/account/orders/<id>`. Admin applications list shows it.
- Demo seed: Ms. Kiki's gets a fake address; Northview stays empty (a shop
  from before this change).
- Codex finding, fixed: the browser's query cache survived sign-out, so a
  second account in the same tab could be shown the first one's cached
  receipt (address included). Every sign-in, sign-up and sign-out now drops
  all cached data except the session (`useRefreshSession`), with a browser
  test that switches accounts without reloading.
- API tests: 274 passed, 8 skipped (SQLite). Browser tests: 110 passed.
- No Vercel, Render, DNS or production changes. Cutover not started.

## Logging rule

Every agent (or Claude/Codex session) that merges code, changes env vars, or
changes Stripe/Render/Vercel/DNS settings adds a dated entry here in the same
PR or right after. No secret values.
