"""Stripe Connect (Express) for seller payouts.

Each approved shop can link an Express connected account. Once Stripe reports
`charges_enabled` on it, checkout becomes a destination charge: the buyer still
pays on the platform's Checkout page, Stripe moves the order total to the
shop's account, and keeps `application_fee_amount` -- the same
`platform_fee_cents` the order has always recorded -- on the platform.

A shop without a ready account cannot take card orders (checkout answers 409)
rather than silently falling back to the platform collecting on its behalf.

The account id (acct_...) is a Stripe object id, not a credential. Nothing in
this module reads or logs a secret key beyond passing it to the SDK.
"""

import logging

import stripe
from flask import abort

from payments import require_stripe, to_plain_dict

logger = logging.getLogger(__name__)


def create_express_account(seller):
    """Open an Express account for a shop. Stripe collects everything else.

    Only the email we already hold and our own seller id go to Stripe up front;
    legal name, DOB, bank details and the rest are entered on Stripe's hosted
    onboarding and never pass through this server.
    """
    api_key = require_stripe()
    params = {
        "api_key": api_key,
        "type": "express",
        "country": "US",
        "capabilities": {
            "card_payments": {"requested": True},
            "transfers": {"requested": True},
        },
        "business_type": "individual",
        "business_profile": {
            "product_description": "Neighborhood snack pickup on The Candy Lady",
        },
        "metadata": {"seller_id": str(seller.id)},
    }
    if seller.contact_email:
        params["email"] = seller.contact_email
    try:
        account = stripe.Account.create(**params)
    except stripe.InvalidRequestError as error:
        logger.error("connect account create refused for seller %s: %s", seller.id, error)
        if _connect_not_enabled(error):
            # A platform-side setup gap, not something the seller can fix.
            abort(
                503,
                description=(
                    "Stripe Connect is not enabled on the platform's Stripe "
                    "account yet, so payout accounts cannot be created. The "
                    "platform admin needs to turn on Connect in the Stripe "
                    "Dashboard."
                ),
            )
        abort(502, description="Stripe refused to open a payout account. Try again.")
    except stripe.StripeError as error:
        logger.error("connect account create failed for seller %s: %s", seller.id, error)
        abort(502, description="Stripe could not open a payout account. Try again.")
    return to_plain_dict(account)


def _connect_not_enabled(error):
    """Stripe's refusal when the platform never signed up for Connect.

    Stripe has no dedicated error code for this; the message is the signal
    ("...signed up for Connect..."), matched loosely so a rewording that keeps
    the word "Connect" still produces the helpful 503.
    """
    message = str(getattr(error, "user_message", None) or error or "").lower()
    return "connect" in message and ("sign" in message or "enable" in message)


def retrieve_account(account_id):
    api_key = require_stripe()
    try:
        return to_plain_dict(stripe.Account.retrieve(account_id, api_key=api_key))
    except stripe.StripeError as error:
        logger.error("connect account retrieve failed for %s: %s", account_id, error)
        abort(502, description="Stripe could not report on this payout account. Try again.")


def create_account_link(account_id, refresh_url, return_url):
    """A one-time hosted onboarding (or update) link. Expires in minutes."""
    api_key = require_stripe()
    try:
        link = stripe.AccountLink.create(
            api_key=api_key,
            account=account_id,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )
    except stripe.StripeError as error:
        logger.error("connect account link failed for %s: %s", account_id, error)
        abort(502, description="Stripe could not open onboarding. Try again.")
    return to_plain_dict(link)


def create_login_link(account_id):
    """Express dashboard link, for a shop that has finished onboarding."""
    api_key = require_stripe()
    try:
        link = stripe.Account.create_login_link(account_id, api_key=api_key)
    except stripe.StripeError as error:
        logger.error("connect login link failed for %s: %s", account_id, error)
        abort(502, description="Stripe could not open your payout dashboard. Try again.")
    return to_plain_dict(link)


def apply_account(seller, account, now):
    """Mirror Stripe's view of an account onto the shop row. Caller commits.

    Returns True when anything changed. Refuses to apply an account that is
    not the one stored on the shop, so a stale or misrouted webhook cannot
    re-point a shop's payouts.
    """
    account_id = (account or {}).get("id")
    if not account_id or account_id != seller.stripe_account_id:
        return False
    charges = bool(account.get("charges_enabled"))
    details = bool(account.get("details_submitted"))
    changed = (
        charges != bool(seller.stripe_charges_enabled)
        or details != bool(seller.stripe_details_submitted)
    )
    seller.stripe_charges_enabled = charges
    seller.stripe_details_submitted = details
    seller.stripe_connect_updated_at = now
    return changed
