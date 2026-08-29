"""Stripe Checkout integration and platform fee math.

Keys are only ever read from configuration that comes from the environment.
Nothing in this module contains or logs a secret.

Money model for this slice (no Stripe Connect yet): the buyer pays the cart
subtotal to the platform's Stripe account. `platform_fee_cents` is recorded on
the order as the platform's commission, and `seller_payout_cents` is what the
platform owes the seller. Buyer-facing prices are unaffected by the fee.
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


def create_checkout_session(order, user, return_base):
    api_key = require_stripe()

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

    try:
        session = stripe.checkout.Session.create(
            api_key=api_key,
            mode="payment",
            line_items=line_items,
            client_reference_id=str(order.id),
            customer_email=user.email,
            expires_at=int(time.time()) + ttl_minutes * 60,
            success_url=(
                f"{base}/buyer.html?order={order.id}&session_id={{CHECKOUT_SESSION_ID}}"
            ),
            cancel_url=f"{base}/buyer.html?order={order.id}&payment=cancelled",
            metadata={
                "order_id": str(order.id),
                "seller_id": str(order.seller_id),
                "platform_fee_cents": str(order.platform_fee_cents),
            },
            payment_intent_data={
                "description": (
                    f"Candy Lady pickup order #{order.id} - "
                    f"{order.seller.shop_name if order.seller else 'shop'}"
                ),
                "metadata": {
                    "order_id": str(order.id),
                    "seller_id": str(order.seller_id),
                    "platform_fee_cents": str(order.platform_fee_cents),
                },
            },
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


def construct_webhook_event(payload, signature_header):
    secret = webhook_secret()
    if not secret:
        # Refusing unverified webhooks keeps an anonymous caller from marking
        # orders as paid. The authenticated confirm endpoint covers the gap.
        abort(
            503,
            description="STRIPE_WEBHOOK_SECRET is not set, so webhooks are rejected.",
        )
    try:
        return to_plain_dict(
            stripe.Webhook.construct_event(payload, signature_header, secret)
        )
    except ValueError:
        abort(400, description="invalid webhook payload")
    except stripe.SignatureVerificationError:
        abort(400, description="invalid webhook signature")


def public_config():
    return {
        "stripe_enabled": stripe_enabled(),
        "stripe_mode": stripe_mode(),
        "stripe_publishable_key": publishable_key() or None,
        "currency": current_app.config.get("CURRENCY", "usd"),
        "platform_fee_percent": float(current_app.config.get("PLATFORM_FEE_PERCENT") or 0),
        "platform_fee_flat_cents": int(current_app.config.get("PLATFORM_FEE_FLAT_CENTS") or 0),
    }
