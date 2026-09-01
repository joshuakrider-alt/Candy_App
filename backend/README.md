# Candy Lady API

Flask + SQLAlchemy + JWT backend for The Candy Lady.

By default the API uses SQLite at `backend/data.db`. If `DATABASE_URL` is set,
Flask-SQLAlchemy uses that database instead (Neon Postgres in production).

## Local setup

1. `cd backend`
2. `python -m venv .venv`
3. Activate the virtual environment
4. `pip install -r requirements.txt`
5. `python manage.py init-db`
6. `python manage.py seed-demo` (prints the generated demo passwords once)
7. `python app.py`

The API listens on `http://127.0.0.1:5000`. A frontend served from
`localhost`/`127.0.0.1` points at that URL automatically.

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | production | SQLite file | Neon Postgres connection string |
| `JWT_SECRET_KEY` | production | dev placeholder | Rotating it signs everyone out |
| `CORS_ORIGINS` | production | `*` | Comma separated; also the allowlist for Stripe return URLs |
| `PUBLIC_SITE_URL` | no | `https://www.neighborhoodcandylady.com` | Fallback base for Stripe return URLs |
| `STRIPE_SECRET_KEY` | for payments | empty | `sk_test_...` in test mode. Never commit it |
| `STRIPE_PUBLISHABLE_KEY` | no | empty | Served to the frontend by `GET /config` |
| `STRIPE_WEBHOOK_SECRET` | no | empty | Without it `POST /stripe/webhook` returns 503 |
| `PLATFORM_FEE_PERCENT` | no | `10` | Commission percent of the order subtotal |
| `PLATFORM_FEE_FLAT_CENTS` | no | `0` | Extra flat commission per order |
| `CURRENCY` | no | `usd` | Stripe currency code |
| `JWT_ACCESS_TOKEN_HOURS` | no | `12` | Access token lifetime |
| `CHECKOUT_SESSION_TTL_MINUTES` | no | `31` | Stripe requires at least 30 |
| `PENDING_ORDER_TTL_MINUTES` | no | `45` | When abandoned checkouts release their stock |
| `ADMIN_BOOTSTRAP_EMAIL` | no | unset | See "First admin" below |
| `ADMIN_BOOTSTRAP_PASSWORD` | no | unset | See "First admin" below |
| `ADMIN_BOOTSTRAP_NAME` | no | `Platform Admin` | Only used when creating the account |

`PROTOTYPE_LOGIN_PASSWORD` is gone. If it is still set, the API logs a warning
and ignores it; remove it from Render.

## Accounts and roles

Every account has its own hashed password (`werkzeug.security`, PBKDF2). There
is no shared password and no anonymous ordering.

| Role | Gets one by | Can do |
| --- | --- | --- |
| `buyer` | `POST /signup` | Browse shops, place and pay for orders, see own orders |
| `seller` | `POST /applications`, or an admin via `manage.py` | Manage its own shop's stock, see and advance its own paid orders |
| `admin` | `manage.py`, `ADMIN_BOOTSTRAP_*`, or another admin | Approve sellers, edit the catalog, manage accounts, see revenue |

A seller account is bound to one `seller_id`. Requests for another shop's
inventory or orders return 403, and a buyer can only read its own orders.

Accounts that predate this change have no password, so they cannot log in until
one is set. `POST /login` returns 403 with a clear message for those.

### Deleting an account

`DELETE /me` permanently deletes the signed-in account. App Store guideline
5.1.1(v) requires an app that creates accounts to offer this in the app, and it
has to be a real deletion, not a deactivation.

Authentication is the same as every other `/me` route: a valid JWT and nothing
else. A client that wants a confirmation step may also send
`{"password": "..."}`; if that field is present it has to be correct, otherwise
the call returns 401 and nothing is deleted. Success returns `204 No Content`.

What happens:

| Data | Result |
| --- | --- |
| The `user` row (name, email, password hash, role, `seller_id`) | Deleted |
| The caller's access token | Stops working immediately — every guarded route resolves the token to a user row first |
| Orders | Kept, with `user_id` set to NULL. Totals, items, payment ids, pickup codes and status stay so the seller can still fulfill them and the platform can still account for the money |
| Checkouts still holding stock (`unpaid`/`pending`) | Marked `expired` and their reserved units returned to the shelf |
| The seller queue | Anonymized orders stay in it, with `buyer_name` reading "Deleted account" |
| That person's shop, if they were a seller | Not deleted. Contact details that were theirs are cleared, and if they were the shop's last login it goes back to `pending`, which hides it from buyers without touching its inventory or other buyers' orders |
| Everyone else's data | Untouched |

Admins cannot delete themselves through this endpoint: it returns 403. That is
the deliberately conservative choice — an admin is a staff account rather than
the consumer account the guideline is about, and a self-service delete could
leave the platform with nobody who can approve sellers or reset passwords.
Another admin removes such an account instead.

Deleting the account does not reach into Stripe. Stripe keeps its own record of
a payment, including the email used at checkout; that copy is governed by
Stripe's retention policy.

### First admin

Render's free tier has no shell, so set `ADMIN_BOOTSTRAP_EMAIL` and
`ADMIN_BOOTSTRAP_PASSWORD` in the service environment and redeploy. On boot the
API creates (or repairs) that one admin account, then logs that it applied the
bootstrap. Unset both variables afterwards.

With shell access, use the CLI instead:

```
python manage.py create-user --name "Joshua" --email you@example.com \
    --role admin --password '...'
```

## Management CLI

```
python manage.py init-db                      # create tables + add new columns
python manage.py list-users                   # roles and who is missing a password
python manage.py list-sellers                 # shop ids and contact/login emails
python manage.py set-password --email a@b.com --password '...'
python manage.py create-user --name N --email a@b.com --role seller --seller-id 3 --password '...'
python manage.py set-role --email a@b.com --role seller --seller-id 3
python manage.py seed-demo                    # insert missing demo rows only
```

## Payments

Stripe Checkout in test mode, with the platform's own Stripe account (no
Connect yet).

1. `POST /orders` validates the cart, reserves stock, prices the order, records
   `platform_fee_cents`, opens a Stripe Checkout Session, and returns
   `checkout_url`. The order is `payment_status="pending"`.
2. The buyer pays on Stripe's hosted page.
3. The order becomes `paid` through whichever arrives first:
   - `POST /stripe/webhook` handling `checkout.session.completed` (requires
     `STRIPE_WEBHOOK_SECRET`), or
   - `POST /orders/<id>/payment/confirm`, which the buyer's browser calls when
     Stripe returns it to `buyer.html`. The result is read from Stripe, so a
     caller cannot fake a payment.
4. Only `paid` orders (plus legacy `pay_at_pickup` ones) appear in the seller's
   queue, and the pickup code stays hidden until then.

If `STRIPE_SECRET_KEY` is missing, `POST /orders` fails with 503 and a message
naming the variable. No stock is reserved in that case.

Abandoned checkouts: the Checkout Session expires after
`CHECKOUT_SESSION_TTL_MINUTES`, and orders still `pending` after
`PENDING_ORDER_TTL_MINUTES` are marked `expired` with their stock returned to
the shelf. That sweep runs when shops or storefronts are read and when an order
is created. `checkout.session.expired` and `POST /orders/<id>/cancel` do the
same thing immediately.

### Platform fee

The buyer pays the cart subtotal; the fee does not change buyer prices. The
whole charge lands in the platform's Stripe account, and the order records:

- `total_cents` — what the buyer paid
- `platform_fee_cents` — `round(subtotal * PLATFORM_FEE_PERCENT / 100) + PLATFORM_FEE_FLAT_CENTS`, clamped to the subtotal
- `seller_payout_cents` — `total_cents - platform_fee_cents`, what the platform owes the seller

`GET /admin/revenue` totals these across paid orders. Stripe Connect (automatic
seller payouts and `application_fee_amount`) is deliberately out of scope; the
recorded fee is what a Connect migration would later charge.

## Schema migrations

There is no Alembic yet. `backend/migrations.py` adds the new columns in place
with `ALTER TABLE` and backfills them, and it runs on every boot after
`db.create_all()`. It is idempotent and never drops anything, so production rows
survive a deploy. Legacy orders are backfilled to
`payment_status="pay_at_pickup"` and `pickup_code="CL-<id>"` so they stay
visible and fulfillable.

`order.user_id` also gets its `NOT NULL` relaxed there, which is what lets a
deleted account leave its orders behind. Postgres drops the constraint in
place; SQLite has no `ALTER COLUMN`, so the table is rebuilt from the model and
the rows are copied into it. Unlike the rest of the file this step is not
wrapped in a `try/except`: `DELETE /me` cannot work without it, so a deploy that
cannot apply it should fail instead of half-shipping the feature.

`seed.py` is non-destructive. `python seed.py --reset` also requires
`CANDY_ALLOW_DESTRUCTIVE_SEED=1` so it cannot wipe production by accident.

## Endpoints

Public:

- `GET /health`
- `GET /config` — Stripe publishable key, mode, fee settings
- `POST /signup`, `POST /login`
- `GET /candies`, `GET /candies/<id>`
- `GET /sellers` — approved shops with in-stock counts
- `GET /sellers/<id>/storefront` — one approved shop's in-stock items
- `POST /applications` — apply to sell, creates the seller login
- `POST /stripe/webhook`

Signed in:

- `GET /me`, `PUT /me/password`, `DELETE /me`, `GET /me/orders`
- `GET /orders/<id>`
- `POST /orders`, `POST /orders/<id>/checkout`, `POST /orders/<id>/payment/confirm`, `POST /orders/<id>/cancel` (buyer)
- `GET /sellers/<id>/inventory`, `PUT /sellers/<id>/inventory/<candy_id>`, `GET /sellers/<id>/orders`, `PUT /orders/<id>/status` (that shop's seller, or admin)

Admin only:

- `GET /applications`, `PUT /applications/<seller_id>`
- `GET /users`, `POST /users`, `GET /users/<id>`, `PUT /users/<id>/password`
- `POST /candies`, `PUT /candies/<id>`, `DELETE /candies/<id>`
- `GET /orders`, `GET /admin/revenue`

## Tests

```
cd backend
python -m pytest tests -q
```

Stripe is stubbed, so no network or real keys are needed. The suite covers
per-account passwords, role enforcement, the paid pickup flow, fee math,
webhook signature verification, account deletion, and the migration of a legacy
database.

To run the same suite against Postgres (what production uses):

```
createdb candy_test
TEST_DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1/candy_test \
    python -m pytest tests -q
```
