"""Stripe Checkout integration and platform fee math.

Keys are only ever read from configuration that comes from the environment.
Nothing in this module contains or logs a secret.

Money model. The buyer always pays the cart subtotal on the platform's
Checkout page, and `platform_fee_cents` is always recorded on the order.

* New orders are Stripe Connect destination charges (see connect.py).
  `transfer_data.destination` sends the total to the shop's Express account
  and `application_fee_amount = platform_fee_cents` keeps the commission on
  the platform. Stripe pays the seller. A shop without a ready account cannot
  take card orders (the API answers 409).
* Orders from before Connect have no destination: the platform collected the
  whole amount and `seller_payout_cents` is what it owes the seller by hand.

Buyer-facing prices are unaffected by the fee either way.
"""

import logging
import time

import stripe
from flask import abort, current_app

logger = logging.getLogger(__name__)

MINIMUM_CHARGE_CENTS = 50  # Stripe's minimum USD charge.
MINIMUM_SESSION_TTL_MINUTES = 31  # Stripe requires expires_at >= 30 minutes out.


def to_plain_dict(value):
    """Normalize a Stripe response into plain dicts and lists.

    Stripe objects stopped behaving like dicts in stripe-python v8, so callers
    get a plain structure instead of leaking SDK types into the route layer.
    """
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if isinstance(value, dict):
        return {key: to_plain_dict(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_plain_dict(item) for item in value]
    return value


def secret_key():
    return (current_app.config.get("STRIPE_SECRET_KEY") or "").strip()


def publishable_key():
    return (current_app.config.get("STRIPE_PUBLISHABLE_KEY") or "").strip()


def webhook_secret():
    return (current_app.config.get("STRIPE_WEBHOOK_SECRET") or "").strip()


def connect_webhook_secret():
    """Signing secret of the separate "Connected accounts" webhook endpoint.

    Stripe only delivers events that happen *on* a connected account (such as
    `account.updated` for a shop's Express account) to an endpoint created in
    Connect mode, and that endpoint has its own `whsec_`. Both endpoints can
    point at the same URL; the handler accepts either signature.
    """
    return (current_app.config.get("STRIPE_CONNECT_WEBHOOK_SECRET") or "").strip()


def stripe_enabled():
    return bool(secret_key())


def stripe_mode():
    key = secret_key()
    if not key:
        return "unconfigured"
    return "live" if key.startswith(("sk_live_", "rk_live_")) else "test"


def require_stripe():
    if not stripe_enabled():
        abort(
            503,
            description=(
                "Card payments are not configured. Set STRIPE_SECRET_KEY "
                "(and STRIPE_PUBLISHABLE_KEY) in the API environment."
            ),
        )
    return secret_key()


def platform_fee_for(subtotal_cents):
    """Commission on one order, in cents, clamped to the order subtotal."""
    percent = float(current_app.config.get("PLATFORM_FEE_PERCENT") or 0)
    flat = int(current_app.config.get("PLATFORM_FEE_FLAT_CENTS") or 0)
    fee = round(subtotal_cents * percent / 100) + flat
    return max(0, min(int(fee), int(subtotal_cents)))


def checkout_return_base(request_origin):
    """Where Stripe sends the buyer back to.

    Uses the requesting origin when it is explicitly allowed, so local and
    preview frontends work, and never trusts an arbitrary caller-supplied URL.
    """
    allowed = current_app.config.get("CORS_ORIGIN_LIST") or []
    origin = (request_origin or "").rstrip("/")
    if origin and origin in allowed:
        return origin
    return (current_app.config.get("PUBLIC_SITE_URL") or "").rstrip("/")


def return_page_for(order, return_to):
    """Path Stripe returns the buyer to: the shop's own page or the marketplace.

    Built only from our own data (the shop's slug), never from a caller-given
    path, so it cannot be turned into an open redirect.
    """
    if return_to == "shop" and order.seller is not None and order.seller.slug:
        return f"/s/{order.seller.slug}"
    return "/buyer.html"


def create_checkout_session(
    order, user, return_base, destination_account_id, return_to=None
):
    """Open Checkout for an order as a Connect destination charge.

    The platform keeps exactly `order.platform_fee_cents`; the rest lands in
    `destination_account_id`, the shop's Express account.
    """
    api_key = require_stripe()
    if not destination_account_id:
        # Callers check readiness first; this is the backstop that keeps a
        # platform-only charge from ever being created by accident.
        abort(409, description="This shop cannot accept card payments yet.")

    if order.total_cents < MINIMUM_CHARGE_CENTS:
        abort(
            400,
            description=(
                f"Card payments need a total of at least "
                f"${MINIMUM_CHARGE_CENTS / 100:.2f}. Add another snack."
            ),
        )

    line_items = []
    for item in order.items:
        candy_name = item.candy.name if item.candy else "Snack"
        line_items.append(
            {
                "quantity": item.quantity,
                "price_data": {
                    "currency": order.currency,
                    "unit_amount": item.unit_price_cents,
                    "product_data": {
                        "name": candy_name,
                        "description": (
                            order.seller.shop_name if order.seller else "Neighborhood pickup"
                        ),
                    },
                },
            }
        )

    ttl_minutes = max(
        MINIMUM_SESSION_TTL_MINUTES,
        int(current_app.config.get("CHECKOUT_SESSION_TTL_MINUTES") or 0),
    )
    base = return_base.rstrip("/")
    page = return_page_for(order, return_to)

    metadata = {
        "order_id": str(order.id),
        "seller_id": str(order.seller_id),
        "platform_fee_cents": str(order.platform_fee_cents),
    }
    payment_intent_data = {
        "description": (
            f"Candy Lady pickup order #{order.id} - "
            f"{order.seller.shop_name if order.seller else 'shop'}"
        ),
        "metadata": dict(metadata),
    }
    metadata["connect_destination"] = destination_account_id
    payment_intent_data["metadata"]["connect_destination"] = destination_account_id
    payment_intent_data["application_fee_amount"] = int(order.platform_fee_cents)
    payment_intent_data["transfer_data"] = {"destination": destination_account_id}

    try:
        session = stripe.checkout.Session.create(
            api_key=api_key,
            mode="payment",
            line_items=line_items,
            client_reference_id=str(order.id),
            customer_email=user.email,
            expires_at=int(time.time()) + ttl_minutes * 60,
            success_url=(
                f"{base}{page}?order={order.id}&session_id={{CHECKOUT_SESSION_ID}}"
            ),
            cancel_url=f"{base}{page}?order={order.id}&payment=cancelled",
            metadata=metadata,
            payment_intent_data=payment_intent_data,
        )
    except stripe.StripeError as error:
        logger.error("stripe checkout session failed for order %s: %s", order.id, error)
        abort(502, description="Stripe could not start the checkout. Try again.")

    return to_plain_dict(session)


def retrieve_checkout_session(session_id):
    api_key = require_stripe()
    try:
        return to_plain_dict(stripe.checkout.Session.retrieve(session_id, api_key=api_key))
    except stripe.StripeError as error:
        logger.error("stripe session retrieve failed for %s: %s", session_id, error)
        abort(502, description="Stripe could not confirm this payment. Try again.")


def refund_order(order):
    """Fully refund an order's payment through Stripe.

    For a destination charge the transfer to the shop is reversed and the
    platform's application fee is refunded too, so the buyer's money comes back
    out of the shop's balance and the platform's commission in proportion --
    nobody ends up holding money for a sale that did not happen. A pre-Connect
    order (no destination) is a plain refund from the platform balance.
    """
    api_key = require_stripe()
    if not order.stripe_payment_intent_id:
        abort(400, description="this order has no Stripe payment to refund")
    params = {
        "api_key": api_key,
        "payment_intent": order.stripe_payment_intent_id,
        "metadata": {"order_id": str(order.id), "seller_id": str(order.seller_id)},
    }
    if order.stripe_destination_account_id:
        params["reverse_transfer"] = True
        params["refund_application_fee"] = True
    try:
        return to_plain_dict(stripe.Refund.create(**params))
    except stripe.StripeError as error:
        logger.error("stripe refund failed for order %s: %s", order.id, error)
        abort(502, description="Stripe could not refund this order. Try again.")


def construct_webhook_event(payload, signature_header):
    secrets = [secret for secret in (webhook_secret(), connect_webhook_secret()) if secret]
    if not secrets:
        # Refusing unverified webhooks keeps an anonymous caller from marking
        # orders as paid. The authenticated confirm endpoint covers the gap.
        abort(
            503,
            description="STRIPE_WEBHOOK_SECRET is not set, so webhooks are rejected.",
        )
    for secret in secrets:
        try:
            return to_plain_dict(
                stripe.Webhook.construct_event(payload, signature_header, secret)
            )
        except ValueError:
            abort(400, description="invalid webhook payload")
        except stripe.SignatureVerificationError:
            continue
    abort(400, description="invalid webhook signature")


def public_config():
    return {
        "stripe_enabled": stripe_enabled(),
        "stripe_mode": stripe_mode(),
        "stripe_publishable_key": publishable_key() or None,
        "currency": current_app.config.get("CURRENCY", "usd"),
        "platform_fee_percent": float(current_app.config.get("PLATFORM_FEE_PERCENT") or 0),
        "platform_fee_flat_cents": int(current_app.config.get("PLATFORM_FEE_FLAT_CENTS") or 0),
        # Connect has no extra key: it runs on STRIPE_SECRET_KEY, so it is
        # available exactly when card payments are.
        "connect_enabled": stripe_enabled(),
    }
