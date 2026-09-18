# The Candy Lady — experimental look

Preview of a cream / cherry neighborhood marketplace UI, plus Direct Charges money flow.

**This is not production.** The live Flask app on `main` is unchanged. This folder is a standalone web preview so we can judge the new look without touching Vercel, Render, Android, or iOS.

## What this is

- Shop directory, storefront, cart, pickup codes
- Direct Charges: buyer pays on the seller’s Stripe; Candy Lady never holds funds
- Split on cart: seller net, 10% Candy Lady fee, Stripe 2.9% + 30¢ + 0.25% Connect
- Launch HQ (`/launch`) — roadmap, money, trust
- Seller apply / sell dashboard, admin moderation
- Terms, privacy, refunds

## What this is not

- Not a drop-in for the Flask backend
- Payments here are simulated (same split math, no live Stripe Connect yet)
- Identity / Connect onboarding is a demo of the flow, not the live Stripe Identity you already shipped on `main`

## How it relates to `main`

| | `main` (live) | this folder |
|---|---|---|
| Stack | Flask + static HTML | TanStack Start + React |
| Payments | Stripe Checkout (current) | Direct Charges preview |
| Deploy | Render + Vercel | Grok preview only |

Do not merge this into `main` as-is.
