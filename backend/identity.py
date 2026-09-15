"""Seller identity verification through Stripe Identity.

The deliberate design choice here is that the ID document and the selfie never
touch this server. Stripe collects both on its own hosted page, does the face
match, and hands back a verdict. We store the verdict, the session id, and
nothing else.

That is not laziness. A government ID plus a matching selfie is the exact
package an identity thief wants, and the selfie-to-document comparison is
biometric processing, which several states regulate specifically -- Illinois'
BIPA carries a private right of action, and neighborhoods near a state line do
not sort themselves by jurisdiction. Not holding the images means there is no
breach to have, no retention schedule to enforce, and no biometric template in
our custody. Stripe is already in this stack for payments, so it adds no new
vendor relationship.

`verified_outputs` from Stripe contains the extracted name, address and date of
birth. We do not read or persist any of it. If shop-name-to-legal-name matching
is ever wanted, that is a separate decision to make on purpose, not something
to acquire by accident.
"""

import logging

import stripe
from flask import abort, current_app

logger = logging.getLogger(__name__)

# Our own vocabulary, kept small on purpose. Stripe has more states than a
# seller needs to understand.
UNSTARTED = "unstarted"
PROCESSING = "processing"
REQUIRES_INPUT = "requires_input"
VERIFIED = "verified"
CANCELED = "canceled"

IDENTITY_STATUSES = (UNSTARTED, PROCESSING, REQUIRES_INPUT, VERIFIED, CANCELED)

# Stripe session status -> ours. "requires_input" means the seller has to redo
# something; "processing" means Stripe is still deciding and nobody needs to act.
_STATUS_MAP = {
    "requires_input": REQUIRES_INPUT,
    "processing": PROCESSING,
    "verified": VERIFIED,
    "canceled": CANCELED,
}

# Stripe's failure codes are terse. These are what a seller is actually shown.
_ERROR_MESSAGES = {
    "document_expired": "That ID has expired. Try a current one.",
    "document_unverified_other": "That ID could not be read. Try again in better light.",
    "document_type_not_supported": "That kind of ID is not accepted. Try a driver's licence or passport.",
    "selfie_document_missing_photo": "That ID has no photo on it, so it cannot be matched to a selfie.",
    "selfie_face_mismatch": "The selfie did not match the photo on the ID.",
    "selfie_manipulated": "That selfie could not be accepted. Take a new one, without filters.",
    "selfie_unverified_other": "The selfie could not be checked. Try again in better light.",
    "under_supported_age": "Stripe could not verify this ID.",
    "consent_declined": "Verification was declined. You can start it again when you are ready.",
}


def secret_key():
    return (current_app.config.get("STRIPE_SECRET_KEY") or "").strip()


def identity_enabled():
    return bool(secret_key())


def require_stripe():
    if not identity_enabled():
        abort(
            503,
            description=(
                "Identity verification is not configured. Set STRIPE_SECRET_KEY "
                "in the API environment."
            ),
        )
    return secret_key()


def to_plain_dict(value):
    """Same normalization payments.py does: stripe-python v8 objects are not dicts."""
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if isinstance(value, dict):
        return {key: to_plain_dict(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_plain_dict(item) for item in value]
    return value


def map_status(stripe_status):
    return _STATUS_MAP.get(stripe_status, PROCESSING)


def friendly_error(code):
    if not code:
        return None
    return _ERROR_MESSAGES.get(code, "Verification did not go through. You can try again.")


def create_verification_session(user, return_url):
    """Start a document + selfie check for one person.

    `require_matching_selfie` is what turns this from "is this a real ID" into
    "is the person holding it the person on it", which is the whole point for a
    marketplace where a stranger hands food to a neighbour.
    """
    api_key = require_stripe()
    try:
        session = stripe.identity.VerificationSession.create(
            api_key=api_key,
            type="document",
            options={"document": {"require_matching_selfie": True}},
            # Ties the verdict back to a row without putting anything
            # identifying in Stripe's metadata.
            metadata={"user_id": str(user.id)},
            return_url=return_url,
        )
    except stripe.StripeError as error:
        logger.error("identity session create failed for user %s: %s", user.id, error)
        abort(502, description="Stripe could not start verification. Try again.")
    return to_plain_dict(session)


def retrieve_verification_session(session_id):
    api_key = require_stripe()
    try:
        session = stripe.identity.VerificationSession.retrieve(session_id, api_key=api_key)
    except stripe.StripeError as error:
        logger.error("identity session retrieve failed for %s: %s", session_id, error)
        abort(502, description="Stripe could not report on this verification. Try again.")
    return to_plain_dict(session)


def cancel_verification_session(session_id):
    """Used when a seller restarts: an abandoned session should not sit open."""
    api_key = require_stripe()
    try:
        session = stripe.identity.VerificationSession.cancel(session_id, api_key=api_key)
        return to_plain_dict(session)
    except stripe.StripeError:
        # A session that is already verified or already canceled cannot be
        # canceled again, and neither case should block starting a new one.
        logger.info("identity session %s could not be canceled", session_id, exc_info=True)
        return None


def error_code_from_session(session):
    """Pull the failure code out of whichever field Stripe populated."""
    if not isinstance(session, dict):
        return None
    last_error = session.get("last_error") or {}
    code = last_error.get("code")
    if code:
        return code
    report = session.get("last_verification_report")
    if isinstance(report, dict):
        for section in ("document", "selfie"):
            error = (report.get(section) or {}).get("error") or {}
            if error.get("code"):
                return error["code"]
    return None
