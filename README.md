# The Candy Lady

Neighborhood snack marketplace at [neighborhoodcandylady.com](https://www.neighborhoodcandylady.com).

Approved sellers offer an approved catalog of candy, chips, and drinks for local
pickup. Buyers create an account, pay by card at checkout, and collect with a
pickup code.

## Live

- Site: https://www.neighborhoodcandylady.com (static frontend on Vercel)
- API: https://candy-lady-api.onrender.com (Flask on Render)
- Database: Neon Postgres via `DATABASE_URL`

## Pages

- `index.html` — brand and how it works
- `buyer.html` — account, shop picker, cart, card checkout, pickup codes
- `seller.html` — seller login, stock toggles, paid pickup queue
- `admin.html` — admin login, seller approval, catalog, platform earnings
- `apply.html` — seller application, including the password the seller will use

## What works today

- Real accounts with per-account hashed passwords for buyers, sellers, and admins
- Buyers browse and order from **any** approved shop, not one hardcoded seller
- Card payment through Stripe Checkout when the order is placed
- A platform fee recorded on every order, with admin totals
- Pickup codes released only after payment clears
- Sellers see and fulfill only their own paid orders
- Admins approve sellers, who then log in with the password they chose
- Buyers and sellers can permanently delete their own account (`DELETE /me`)

## Accounts and roles

| Role | How to get one | Can do |
| --- | --- | --- |
| Buyer | "Create account" on `buyer.html` | Browse shops, pay for orders, see pickup codes and history |
| Seller | Apply on `apply.html` (choose email + password), then wait for approval | Manage that shop's stock, work its paid pickup queue |
| Admin | `manage.py`, or the `ADMIN_BOOTSTRAP_*` env vars | Approve/reject sellers, manage catalog and accounts, see fee earnings |

A seller login works the moment the application is submitted, but the shop stays
invisible to buyers until an admin approves it. Roles are enforced in the API,
not only in the UI: a buyer token cannot read the approval queue, and a seller
token cannot touch another shop's inventory or orders.

The shared prototype password and the "Reset demo" button are gone.

Accounts created before this change have no password. Set one with
`python manage.py set-password --email … --password …`, or from the admin API
(`PUT /users/<id>/password`).

### Deleting an account

`DELETE /me`, with the account's own token, permanently deletes that login. The
mobile app needs this: App Store guideline 5.1.1(v) requires in-app account
deletion from any app that creates accounts.

```
curl -X DELETE https://api.neighborhoodcandylady.com/me \
  -H "Authorization: Bearer <token>"
```

The user row is gone, so the email and name are gone with it and the account
cannot log in again. Orders stay, de-identified: a seller can still hand over a
bag that was already paid for, and the platform can still account for the money
it took, but nothing on the order points back to a person. A seller who was the
last login for a shop takes the shop off the buyer-facing list (back to
pending) instead of taking its inventory or other buyers' orders with them.
Admins cannot delete themselves this way; another admin removes them.
`backend/README.md` has the full breakdown.

## Payments (Stripe test mode)

The buyer pays the cart subtotal to the platform's Stripe account. Nothing is
split automatically yet: each order records `platform_fee_cents` (the
platform's commission) and `seller_payout_cents` (what the platform owes the
seller). Stripe Connect payouts are intentionally not part of this slice.

### Render service `Candy-Lady-api`

Set these environment variables (Render dashboard → Environment). **Never put
keys in the repo.**

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` from Stripe → Developers → API keys (test mode) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` from the same page |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint below (optional but recommended) |
| `PUBLIC_SITE_URL` | `https://www.neighborhoodcandylady.com` |
| `CORS_ORIGINS` | `https://www.neighborhoodcandylady.com,https://neighborhoodcandylady.com` |
| `JWT_SECRET_KEY` | a long random string |
| `PLATFORM_FEE_PERCENT` | `10` (or whatever commission you want) |
| `PLATFORM_FEE_FLAT_CENTS` | `0` |

Remove `PROTOTYPE_LOGIN_PASSWORD`.

If `STRIPE_SECRET_KEY` is missing, placing an order fails with a 503 that names
the variable, and no stock is reserved.

### Vercel

Nothing to configure. The frontend reads the publishable key, Stripe mode, and
fee settings from `GET /config` on the API, so no key ever lives in the static
bundle or in Vercel env vars.

### Webhook (optional)

Stripe → Developers → Webhooks → Add endpoint:

- URL: `https://candy-lady-api.onrender.com/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

Without the secret the endpoint returns 503 and refuses unverified calls; the
buyer's browser still confirms the payment against Stripe when it returns from
Checkout, so the flow works either way. The webhook is what catches a buyer who
closes the tab right after paying.

### Test cards

Stripe test mode only:

- Success: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP
- Declined: `4000 0000 0000 0002`

## Manual test plan

Run against the deployed site (or locally, see below). You need an admin
account and Stripe test keys set.

**1. Buyer pays and gets a pickup code**

1. Open `buyer.html`. The shop grid lists every approved shop with its in-stock count.
2. In "Your account", pick "Create account" and sign up. The cart button changes from "Sign in to pay" to "Pay $… & reserve".
3. Click "Shop this spot" on a shop, add two different items, and check the total.
4. Click "Pay … & reserve". You land on Stripe Checkout showing the shop name and line items.
5. Pay with `4242 4242 4242 4242`. Stripe returns you to `buyer.html`, which shows a green "Payment received" banner with a `CL-XXXXX` pickup code.
6. "Your orders" shows the order as Paid with the same code.

**2. Payment is actually required**

1. Repeat steps 1–4, then click Stripe's back arrow to cancel.
2. `buyer.html` shows a "Payment cancelled" banner with "Finish paying" and "Release items".
3. "Release items" returns the stock: the item count on the shop card goes back up.
4. Check "Your orders": the cancelled order is Expired and has no pickup code.

**3. Seller with a real password fulfills the paid order**

1. Open `seller.html` and log in as the shop's seller (the email/password from its application, or one set with `manage.py`).
2. The paid order from test 1 is in the queue with its pickup code, the buyer's name, and "you keep $…" after the platform fee. The cancelled order from test 2 is not there.
3. Click "Start packing" → "Mark ready" → "Complete". The order leaves the queue.
4. Toggle an item to "Mark out". Reload `buyer.html`: that item is gone from the shelf and the shop's in-stock count dropped.

**4. Admin approves a new seller who then logs in**

1. Open `apply.html`. Submit a new shop with a fresh email and a password of at least 8 characters.
2. The status card shows Pending and the login email. `buyer.html` does **not** list the new shop yet.
3. Open `admin.html`, log in as admin. The new application is in the review list with its login email.
4. Click Approve. Reload `buyer.html`: the new shop is now listed.
5. Open `seller.html` and log in with the new seller's email and password. The dashboard loads with a full catalog of stock toggles, all out of stock.
6. Mark one item in stock, then confirm it appears on that shop's storefront in `buyer.html`.

**5. Roles are enforced**

1. Signed in as a buyer on `buyer.html`, open `admin.html`. It refuses with "That account is not an admin."
2. Same for `seller.html` with a buyer account.
3. As admin, `admin.html` shows "Platform earnings": paid order count, collected total, platform fee earned, and owed to sellers.

**6. A buyer deletes their account**

The web pages have no delete button yet — this is for the mobile app — so drive
it with `curl`.

1. Sign up as a throwaway buyer on `buyer.html`, then pay for an order at a shop you can also log into as the seller.
2. In that tab's DevTools console, run `localStorage.getItem("candyLadyToken")` and copy the token.
3. `curl -i -X DELETE https://api.neighborhoodcandylady.com/me -H "Authorization: Bearer <token>"` → `204 No Content`.
4. Try to log in on `buyer.html` with that email and password: it fails. Sign up again with the same email and you get a fresh, empty account.
5. Open `seller.html` as the shop. The paid order is still in the queue with its pickup code and total, and the buyer's name now reads "Deleted account".

## Local development

Backend (see `backend/README.md` for details):

```
cd backend
pip install -r requirements.txt
python manage.py init-db
python manage.py seed-demo        # prints demo passwords once
STRIPE_SECRET_KEY=sk_test_... STRIPE_PUBLISHABLE_KEY=pk_test_... \
  CORS_ORIGINS=http://localhost:5500 python app.py
```

Frontend:

```
python -m http.server 5500
```

Then open `http://localhost:5500/buyer.html`. A frontend served from
`localhost` targets `http://127.0.0.1:5000` automatically. To point it somewhere
else, load any page with `?api=https://your-api.example.com` (remembered in
`localStorage`) or set `window.CANDY_LADY_API_BASE_URL` before `app.js` runs.

Because `CORS_ORIGINS` includes `http://localhost:5500`, Stripe returns the
buyer to the local frontend instead of the production domain.

## Tests

```
cd backend
python -m pytest tests -q
```
