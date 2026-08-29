"""Account helpers and role-aware route guards."""

import re
from functools import wraps

from flask import abort, g
from flask_jwt_extended import create_access_token, get_jwt_identity, verify_jwt_in_request

from models import ROLES, User

MINIMUM_PASSWORD_LENGTH = 8
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value):
    return (value or "").strip().lower()


def validate_email(value):
    email = normalize_email(value)
    if not EMAIL_PATTERN.match(email):
        abort(400, description="a valid email is required")
    return email


def validate_password(value):
    password = value or ""
    if len(password) < MINIMUM_PASSWORD_LENGTH:
        abort(
            400,
            description=(
                f"password must be at least {MINIMUM_PASSWORD_LENGTH} characters"
            ),
        )
    return password


def validate_role(value):
    if value not in ROLES:
        abort(400, description=f"role must be one of: {', '.join(ROLES)}")
    return value


def issue_token(user):
    return create_access_token(
        identity=str(user.id),
        additional_claims={
            "email": user.email,
            "role": user.role,
            "seller_id": user.seller_id,
        },
    )


def load_current_user():
    """Resolve the JWT subject to a live user row, or 401."""
    if "current_user" in g:
        return g.current_user

    identity = get_jwt_identity()
    user = None
    if identity is not None:
        try:
            user = db_get_user(int(identity))
        except (TypeError, ValueError):
            user = None
    if user is None:
        abort(401, description="this session is no longer valid; log in again")

    g.current_user = user
    return user


def db_get_user(user_id):
    return User.query.get(user_id)


def require_roles(*roles):
    """Require a valid token, and optionally one of the given roles."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = load_current_user()
            if roles and user.role not in roles:
                abort(403, description="your account does not have access to this")
            return view(*args, **kwargs)

        return wrapper

    return decorator


def current_user():
    return g.get("current_user")


def is_admin(user):
    return bool(user) and user.role == "admin"


def assert_seller_access(user, seller_id):
    """Admins can act on any shop; a seller only on the shop they own."""
    if is_admin(user):
        return
    if user.role == "seller" and user.seller_id == int(seller_id):
        return
    abort(403, description="you can only manage your own shop")


def assert_order_access(user, order):
    if is_admin(user):
        return
    if user.role == "buyer" and order.user_id == user.id:
        return
    if user.role == "seller" and user.seller_id == order.seller_id:
        return
    abort(403, description="you do not have access to this order")
