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

## Logging rule

Every agent (or Claude/Codex session) that merges code, changes env vars, or
changes Stripe/Render/Vercel/DNS settings adds a dated entry here in the same
PR or right after. No secret values.
