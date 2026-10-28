"""The "Forgot password?" flow: email a single-use link that sets a new password.

Two calls, both public:

- POST /password-reset/request {"email"} always answers 202 with the same
  body, whether or not an account uses that address, so the form cannot be
  used to find out who has an account. When one does, a token is made and a
  link to PUBLIC_SITE_URL/reset-password#token=... is emailed. The token sits
  in the fragment, which browsers never send to a server, so it stays out of
  Vercel's and Render's access logs and out of Referer headers.
- POST /password-reset/confirm {"token", "password"} sets the new password
  if the token is known, unused and unexpired, then spends it (and every
  other outstanding link for that account).

Only a SHA-256 of each token is stored. Tokens expire after
PASSWORD_RESET_TOKEN_MINUTES (60) and an account gets at most
PASSWORD_RESET_MAX_PER_HOUR (3) links an hour, which also stops the form
being used to flood someone's inbox.

Fails safe: nothing is created or sent unless PASSWORD_RESET_EMAILS is on and
mailer.can_send() (RESEND_API_KEY and MESSAGE_EMAIL_FROM). Until then a
request still gets the same 202, with "email_enabled": false so the page can
say to contact support instead of leaving someone waiting for an email. That
flag is the same for every address, so it gives nothing away.
"""

import hashlib
import logging
import secrets
import threading
from datetime import timedelta

from flask import Blueprint, abort, current_app, jsonify, request

import mailer
from auth import EMAIL_PATTERN, normalize_email, validate_password
from models import PasswordResetToken, User, db, utcnow

logger = logging.getLogger(__name__)

bp = Blueprint("password_reset", __name__)

INVALID_TOKEN = "this reset link is invalid or has expired; ask for a new one"
# Well above what token_urlsafe(32) produces (43 characters).
MAX_TOKEN_LENGTH = 200


def configure(app, env_int, env_bool):
    """Read the reset settings into app.config (called by create_app)."""
    app.config.setdefault("PASSWORD_RESET_EMAILS", env_bool("PASSWORD_RESET_EMAILS", False))
    app.config.setdefault(
        "PASSWORD_RESET_TOKEN_MINUTES", env_int("PASSWORD_RESET_TOKEN_MINUTES", 60)
    )
    app.config.setdefault(
        "PASSWORD_RESET_MAX_PER_HOUR", env_int("PASSWORD_RESET_MAX_PER_HOUR", 3)
    )


def is_enabled(config):
    return bool(config.get("PASSWORD_RESET_EMAILS") and mailer.can_send(config))


def hash_token(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _accepted(config):
    minutes = config["PASSWORD_RESET_TOKEN_MINUTES"]
    return (
        jsonify(
            status="accepted",
            email_enabled=is_enabled(config),
            expires_in_minutes=minutes,
        ),
        202,
    )


def _issue(user, config):
    """Make a token for `user` and email the link. Returns the raw token, or None."""
    # Hold the login's row so two requests at once count each other's token
    # (the same pattern as messaging.enforce_rate_limit).
    db.session.query(User.id).filter(User.id == user.id).with_for_update().one()
    now = utcnow()
    recent = PasswordResetToken.query.filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.created_at >= now - timedelta(hours=1),
    ).count()
    if recent >= config["PASSWORD_RESET_MAX_PER_HOUR"]:
        db.session.rollback()
        # No email or address in the log line.
        logger.info("password reset limit reached for user %s", user.id)
        return None

    # Only the newest link works: asking again retires the older ones.
    PasswordResetToken.query.filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)

    raw = secrets.token_urlsafe(32)
    minutes = config["PASSWORD_RESET_TOKEN_MINUTES"]
    db.session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            created_at=now,
            expires_at=now + timedelta(minutes=minutes),
        )
    )
    db.session.commit()

    site = config.get("PUBLIC_SITE_URL", "").rstrip("/")
    link = f"{site}/reset-password#token={raw}"
    subject = "Reset your Candy Lady password"
    text = (
        "Someone asked to reset the password for your account on The Candy Lady.\n\n"
        f"Choose a new password here (the link works once, for {minutes} minutes):\n"
        f"{link}\n\n"
        "If that wasn't you, ignore this email; your password stays the same.\n"
        "Questions? hello@neighborhoodcandylady.com"
    )
    settings = {key: config.get(key) for key in ("RESEND_API_KEY", "MESSAGE_EMAIL_FROM")}
    address = user.email

    def send():
        mailer.send_email(settings, address, subject, text)

    # Sent off the request thread so a slow Resend call does not make a known
    # address answer noticeably slower than an unknown one.
    if config.get("MESSAGE_EMAIL_SYNC"):
        send()
    else:
        threading.Thread(target=send, daemon=True).start()
    return raw


@bp.route("/password-reset/request", methods=["POST"])
def request_reset():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email"))
    # Only the address's shape is checked here, never whether it has an account.
    if not EMAIL_PATTERN.match(email):
        abort(400, description="a valid email is required")

    config = current_app.config
    if not is_enabled(config):
        logger.warning(
            "password reset requested but reset emails are off; set "
            "PASSWORD_RESET_EMAILS, RESEND_API_KEY and MESSAGE_EMAIL_FROM"
        )
        return _accepted(config)

    user = User.query.filter_by(email=email).first()
    if user is not None:
        _issue(user, config)
    return _accepted(config)


@bp.route("/password-reset/confirm", methods=["POST"])
def confirm_reset():
    data = request.get_json(silent=True) or {}
    raw = data.get("token")
    if not isinstance(raw, str) or not raw or len(raw) > MAX_TOKEN_LENGTH:
        abort(400, description=INVALID_TOKEN)
    password = validate_password(data.get("password"))

    # Locked so two submits of the same link cannot both succeed.
    row = (
        PasswordResetToken.query.filter_by(token_hash=hash_token(raw))
        .with_for_update()
        .first()
    )
    now = utcnow()
    if row is None or row.used_at is not None or row.expires_at <= now:
        abort(400, description=INVALID_TOKEN)
    user = db.session.get(User, row.user_id)
    if user is None:
        abort(400, description=INVALID_TOKEN)

    user.set_password(password)
    PasswordResetToken.query.filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    db.session.commit()
    logger.info("password reset completed for user %s", user.id)
    return jsonify(status="password_updated")


def forget_user(user):
    """Drop a deleted login's reset tokens. Flushes, never commits."""
    PasswordResetToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
