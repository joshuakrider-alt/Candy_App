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


# What a shop's account needs for destination charges: card payments on the
# merchant side, and transfers into its Stripe balance on the recipient side.
CONFIGURATIONS = ["merchant", "recipient"]
ACCOUNT_INCLUDE = ["configuration.merchant", "configuration.recipient", "requirements"]


def _client(api_key):
    return stripe.StripeClient(api_key)


def create_express_account(seller):
    """Open an Express-dashboard account for a shop. Stripe collects the rest.

    Uses Accounts v2 (POST /v2/core/accounts): new platforms have the v1
    create call switched off, which is what refused account creation on the
    sandbox before "Accounts v1 support" was turned on. The account is the
    same acct_... id to every other call, so destination charges, refunds and
    the Express login link are unchanged.

    Only the email we already hold and our own seller id go to Stripe up front;
    legal name, DOB, bank details and the rest are entered on Stripe's hosted
    onboarding and never pass through this server.
    """
    api_key = require_stripe()
    params = {
        "dashboard": "express",
        # As with a v1 Express account taking destination charges: the
        # platform pays Stripe's fees and covers refunds and disputes.
        "defaults": {
            "responsibilities": {
                "fees_collector": "application",
                "losses_collector": "application",
            },
        },
        "identity": {"country": "US", "entity_type": "individual"},
        "configuration": {
            "merchant": {"capabilities": {"card_payments": {"requested": True}}},
            "recipient": {
                "capabilities": {
                    "stripe_balance": {"stripe_transfers": {"requested": True}},
                },
            },
        },
        "display_name": seller.shop_name,
        "metadata": {"seller_id": str(seller.id)},
        "include": ACCOUNT_INCLUDE,
    }
    if seller.contact_email:
        params["contact_email"] = seller.contact_email
    try:
        account = _client(api_key).v2.core.accounts.create(params)
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
    """The account as Accounts v2 reports it (works for v1-created ones too)."""
    api_key = require_stripe()
    try:
        account = _client(api_key).v2.core.accounts.retrieve(
            account_id, {"include": ACCOUNT_INCLUDE}
        )
    except stripe.StripeError as error:
        logger.error("connect account retrieve failed for %s: %s", account_id, error)
        abort(502, description="Stripe could not report on this payout account. Try again.")
    return to_plain_dict(account)


def create_account_link(account_id, refresh_url, return_url):
    """A one-time hosted onboarding link (Accounts v2). Expires in minutes."""
    api_key = require_stripe()
    try:
        link = _client(api_key).v2.core.account_links.create(
            {
                "account": account_id,
                "use_case": {
                    "type": "account_onboarding",
                    "account_onboarding": {
                        "configurations": CONFIGURATIONS,
                        "refresh_url": refresh_url,
                        "return_url": return_url,
                    },
                },
            }
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
    charges, details = readiness(account)
    changed = (
        charges != bool(seller.stripe_charges_enabled)
        or details != bool(seller.stripe_details_submitted)
    )
    seller.stripe_charges_enabled = charges
    seller.stripe_details_submitted = details
    seller.stripe_connect_updated_at = now
    return changed


def _status(account, *path):
    value = account
    for key in path:
        value = (value or {}).get(key)
    return value


def readiness(account):
    """(charges_enabled, details_submitted) from a v1 or v2 account.

    The v2 API reads (create, retrieve) have no such flags, so they are worked
    out the way v1 did: charges once card payments and transfers are both
    active, details once nothing is due now or overdue. The v1 account.updated
    webhook still sends the flags themselves.
    """
    if account.get("object") != "v2.core.account":
        return bool(account.get("charges_enabled")), bool(account.get("details_submitted"))
    cards = _status(
        account, "configuration", "merchant", "capabilities", "card_payments", "status"
    )
    transfers = _status(
        account,
        "configuration",
        "recipient",
        "capabilities",
        "stripe_balance",
        "stripe_transfers",
        "status",
    )
    charges = cards == "active" and transfers == "active"
    requirements = account.get("requirements")
    if requirements is None:
        return charges, charges
    due = [
        entry
        for entry in requirements.get("entries") or []
        if _status(entry, "minimum_deadline", "status") in ("currently_due", "past_due")
    ]
    return charges, charges or not due
