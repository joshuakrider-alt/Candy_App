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

## 2026-09-25 — Seller-owned shop items

- Added additive candy ownership and active-state fields so existing catalog rows remain global.
- Added seller item create, edit, stock, price, and soft-remove APIs and dashboard controls.
- Kept custom items scoped to their owner in inventory, storefront, and checkout flows.
