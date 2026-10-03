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
  replaced with one for a discarded random password, photo keys and identity
  session ids cleared; seller contact name/email replaced the same way and
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

## Logging rule

Every agent (or Claude/Codex session) that merges code, changes env vars, or
changes Stripe/Render/Vercel/DNS settings adds a dated entry here in the same
PR or right after. No secret values.
