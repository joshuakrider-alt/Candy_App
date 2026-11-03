"""Outgoing email, off unless configured.

The API had no email at all before in-site messaging, so this is deliberately
small: one plain-text message to one address through Resend's HTTP API, using
only the standard library. HTTP rather than SMTP because it needs no extra
dependency and no outbound mail port on the host.

Nothing is sent without RESEND_API_KEY and MESSAGE_EMAIL_FROM. On top of
that, each kind of email has its own switch: MESSAGE_EMAIL_NOTIFICATIONS for
message notices (is_configured) and PASSWORD_RESET_EMAILS for reset links
(password_reset.py). The sender address has to be on a domain that
is verified in Resend, which means DNS records only the domain owner can add.
"""

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 10


def can_send(config):
    """A Resend key and a sender address are both set."""
    return bool(config.get("RESEND_API_KEY") and config.get("MESSAGE_EMAIL_FROM"))


def is_configured(config):
    """Message notices are switched on and can be sent."""
    return bool(config.get("MESSAGE_EMAIL_NOTIFICATIONS") and can_send(config))


def send_email(config, to, subject, text):
    """Send one email. Returns True on success; never raises.

    A failed notification must not fail the request that caused it (the
    message itself is already saved), so every error is logged and swallowed.
    The address is not logged.
    """
    if not can_send(config):
        return False
    payload = json.dumps(
        {
            "from": config["MESSAGE_EMAIL_FROM"],
            "to": [to],
            "subject": subject,
            "text": text,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        RESEND_ENDPOINT,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {config['RESEND_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SEND_TIMEOUT_SECONDS) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        logger.warning("email notification failed to send", exc_info=True)
        return False
