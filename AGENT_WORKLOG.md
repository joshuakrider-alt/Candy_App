# Agent worklog — Candy_App

Chronological ops notes from agents working on Neighborhood Candy Lady.
Do not put secret values here — prefixes and status only.

---

## 2026-09-22 — Stripe live cutover (Chief of Staff)

### Goal
Get production API out of Stripe test mode so real-card checkout works.

### What we did
1. Confirmed Stripe account `neighborhoodcand…` is live-capable (payments/payouts active, tax verified).
2. Joshua completed Stripe email verification so the live Secret key could be revealed.
3. On Render service **Candy-Lady-api**, set live env vars (values never logged):
   - `STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
   - `STRIPE_SECRET_KEY` → `sk_live_…`
   - `STRIPE_WEBHOOK_SECRET` → `whsec_…`
4. Created live Stripe webhook:
   - URL: `https://api.neighborhoodcandylady.com/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
5. Redeployed Render; verified `GET /config` → `stripe_enabled: true`, `stripe_mode: "live"`, publishable prefix `pk_live_`.

### Still open
- **USD payout bank** not linked in Stripe (“Add a bank account”). Charges can work; platform payouts to bank will not until Joshua adds one.
- Photo uploads still off (`uploads_enabled: false`) until R2/STORAGE_* env is set.
- No live end-to-end card charge was run in this session (optional next step with Joshua’s OK).

### Docs
- Root `README.md` Payments section updated for live production status.
