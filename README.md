# The Candy Lady

Neighborhood snack marketplace at [neighborhoodcandylady.com](https://www.neighborhoodcandylady.com).

Approved sellers offer an approved catalog of candy, chips, and drinks for local
pickup. Buyers create an account, pay by card at checkout, and collect with a
pickup code.

## Live

- Site: https://www.neighborhoodcandylady.com (static frontend on Vercel)
- API: https://api.neighborhoodcandylady.com (Flask on Render; also `candy-lady-api.onrender.com`)
- Database: Neon Postgres via `DATABASE_URL`
- Stripe: **live mode** on production as of 2026-09-22 (`GET /config` → `stripe_mode: "live"`)
- Agent ops log: [`AGENT_WORKLOG.md`](AGENT_WORKLOG.md)

## Pages

- `index.html` — brand and how it works
- `buyer.html` — account, shop picker, cart, card checkout, pickup codes
- `shop.html` — one shop's own branded page, served at `/s/<slug>`
- `seller.html` — seller login, stock toggles, paid pickup queue, Stripe payouts, shop page settings
- `admin.html` — admin login, seller approval, catalog, platform earnings
- `apply.html` — seller application, including the password the seller will use

## What works today

- Real accounts with per-account hashed passwords for buyers, sellers, and admins
- Buyers browse and order from **any** approved shop, not one hardcoded seller
- Card payment through Stripe Checkout when the order is placed, paid out to
  the shop's own Stripe Express account (Stripe Connect)
- A platform fee on every order, kept by the platform as Stripe's
  `application_fee_amount`, with admin totals
- A public page per shop at `/s/<slug>`, in the shop's own colours
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

## Payments (Stripe)

The buyer pays on the platform's Stripe Checkout page, and the charge is a
**Stripe Connect destination charge**: Stripe sends the order total to the
shop's Express account and keeps `platform_fee_cents` for the platform as
`application_fee_amount`. Stripe pays sellers; nobody settles up by hand.

A shop can only take card orders once its Stripe account is ready
(`charges_enabled`). Until then its page says "Card orders coming soon" and the
API answers 409 before reserving any stock — there is no fallback to the
platform collecting the money. **Every shop that is live today starts out not
connected**, so after this deploys each seller has to click "Connect Stripe" on
`seller.html` before buyers can pay them again.

Orders placed before Connect keep `payout_method: "manual"`; `/admin/revenue`
reports what is still owed on those separately. `backend/README.md` has the
full Connect, webhook and refund details.

### Stripe Connect setup (one time, Stripe Dashboard)

1. **Enable Connect** on the platform account: Dashboard → Connect → Get
   started, choose Express accounts, and fill in the platform profile. Until
   this is done, "Connect Stripe" on `seller.html` shows "Stripe Connect is not
   enabled on the platform's Stripe account yet".
2. **Add a Connected accounts webhook**: Developers → Webhooks → Add endpoint →
   "Events on Connected accounts", URL
   `https://api.neighborhoodcandylady.com/stripe/webhook`, event
   `account.updated`. Put its signing secret in Render as
   `STRIPE_CONNECT_WEBHOOK_SECRET`. (Optional — the seller page checks status
   when Stripe sends the seller back — but it is how later restrictions reach
   the app.)
3. Refunds: use the admin refund endpoint, or tick "Reverse transfer" and
   "Refund application fee" when refunding in the Dashboard.

### How a seller gets paid

1. Apply on `apply.html`, get approved by an admin (unchanged). Approval also
   gives the shop its `/s/<slug>` link.
2. On `seller.html`, click **Connect Stripe** and finish Stripe's hosted
   onboarding (bank account, identity, tax info — entered at Stripe, never
   stored here).
3. Back on `seller.html` the Payouts panel reads "Ready"; buyers can now pay.

### Shop pages (`/s/<slug>`)

Each approved shop gets a public page with only its own items, name, tagline,
neighborhood, pickup hours and optional logo, in its chosen colours. Sellers
edit the address, tagline, colours and logo link under "Your shop page" on
`seller.html`, and can copy the link from there. `buyer.html` still lists every
shop and links each card to its page. Slugs are lowercase kebab-case, 3–48
characters, unique, and cannot be reserved words like `admin` or `privacy`.

### Not in this slice

- Self-serve seller onboarding (apply → admin approval is still required; the
  shop's `slug` and Connect status are the hooks a guided signup will use)
- Custom domains per shop
- Logo file uploads (the logo is an https link for now)
- Partial refunds through the API

**Production (2026-09-22):** Render `Candy-Lady-api` uses **live** Stripe keys
(`pk_live_…` / `sk_live_…`). `GET https://api.neighborhoodcandylady.com/config`
reports `stripe_mode: "live"`. A live webhook is registered at
`https://api.neighborhoodcandylady.com/stripe/webhook` for
`checkout.session.completed`, `checkout.session.expired`, and `charge.refunded`.

**Still needed for platform payouts:** link a USD bank account in the Stripe
Dashboard (Balances / settings) so the platform's own fees can be paid out.
Each seller links their own bank during Connect onboarding.

Use `sk_test_…` / `pk_test_…` only for local development. Never commit keys.

### Render service `Candy-Lady-api`

Set these environment variables (Render dashboard → Environment). **Never put
keys in the repo.**

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Production: `sk_live_…`. Local: `sk_test_…` |
| `STRIPE_PUBLISHABLE_KEY` | Production: `pk_live_…`. Local: `pk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the live (or test) webhook endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | optional: `whsec_…` from the "Connected accounts" endpoint (`account.updated`) |
| `PUBLIC_SITE_URL` | `https://www.neighborhoodcandylady.com` |
| `CORS_ORIGINS` | `https://www.neighborhoodcandylady.com,https://neighborhoodcandylady.com` |
| `JWT_SECRET_KEY` | a long random string |
| `PLATFORM_FEE_PERCENT` | `10` (or whatever commission you want) |
| `PLATFORM_FEE_FLAT_CENTS` | `0` |

Remove `PROTOTYPE_LOGIN_PASSWORD`.

If `STRIPE_SECRET_KEY` is missing, placing an order fails with a 503 that names
the variable, and no stock is reserved.

### Photo uploads and identity verification

Photos go from the browser straight to an S3-compatible bucket; they never pass
through the API. Leave these unset and uploads simply stay switched off — the
frontend hides the controls rather than offering a button that cannot work.

| Variable | Value |
| --- | --- |
| `STORAGE_ENDPOINT_URL` | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_BUCKET` | the bucket name, e.g. `candy-lady-photos` |
| `STORAGE_ACCESS_KEY_ID` | from the R2 API token |
| `STORAGE_SECRET_ACCESS_KEY` | from the same token |
| `STORAGE_PUBLIC_BASE_URL` | the bucket's public URL, e.g. `https://photos.neighborhoodcandylady.com` |
| `STORAGE_REGION` | `auto` for R2; a real region for S3 |
| `MAX_UPLOAD_BYTES` | optional, defaults to 8MB |
| `MAX_SELLER_PHOTOS` | optional, defaults to 12 per shop |
| `REQUIRE_SELLER_IDENTITY` | `false` by default; set `true` to block approving an unverified shop |

Identity verification reuses `STRIPE_SECRET_KEY`. There is no separate key.

Two things have to be done outside this repo:

1. **R2 CORS.** The browser PUTs directly to the bucket, so the bucket must
   allow it. In the R2 dashboard, add a CORS rule permitting `PUT` from
   `https://www.neighborhoodcandylady.com` with the `Content-Type` header.
   Without this, uploads fail in the browser and nowhere else.
2. **Stripe webhook events.** Add `identity.verification_session.verified`,
   `.requires_input` and `.canceled` to the existing webhook endpoint. This is
   optional: `POST /identity/refresh` pulls the verdict on demand, so
   verification still completes with no webhook configured. It just means a
   seller who closes the tab early has to reopen the page for the result.

Nothing about a seller's ID document or selfie is stored here. Stripe collects
both, performs the face match, and returns a verdict; what lands in Postgres is
a status, a `vs_…` session id, and a timestamp.

### Vercel

Nothing to configure. The frontend reads the publishable key, Stripe mode, and
fee settings from `GET /config` on the API, so no key ever lives in the static
bundle or in Vercel env vars.

### Webhook

Stripe → Developers → Webhooks → Add endpoint (use **live** mode for production):

- URL: `https://api.neighborhoodcandylady.com/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
  (also add Identity events listed above when using seller ID verification)
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

Production already has this live endpoint as of 2026-09-22.

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

**0. Seller connects Stripe (test mode)**

1. Log in on `seller.html` as a shop's seller. The Payouts panel reads "Not connected" and the shop profile says cards are off.
2. Click "Connect Stripe" and complete Stripe's test onboarding (use Stripe's test values, e.g. routing `110000000`, account `000123456789`).
3. Back on `seller.html` the panel reads "Ready — card orders pay out to you".
4. "Your shop page" shows the `/s/<slug>` link; "Copy link" copies it, "Open page" shows the shop in its colours with only its items.

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
