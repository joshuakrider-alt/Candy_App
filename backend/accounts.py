"""Permanent deletion of the signed-in account.

App Store guideline 5.1.1(v) requires an app that creates accounts to let the
person delete theirs from inside the app, and "delete" has to mean the account
is gone, not disabled.

Deleting a login removes the person, not the shop's books. Orders are kept in
de-identified form (`user_id` set to NULL) because a seller may still owe
someone a bag of candy, and the platform still has to account for money it
took. Nothing that identifies the deleted account survives that: name, email,
password hash, role, and shop link all go with the row.
"""

import logging

from flask import abort

from models import Order, Seller, User, db

logger = logging.getLogger(__name__)

# What a seller sees in the pickup queue where a buyer name used to be.
ANONYMOUS_BUYER_LABEL = "Deleted account"

# Orders that never became a sale. Their reserved stock goes back on the shelf
# instead of sitting on a checkout nobody can finish any more.
CANCELLABLE_PAYMENT_STATUSES = ("unpaid", "pending")


def assert_self_deletable(user):
    """Refuse to let an admin delete itself through the account endpoint.

    The safer of the two options in the brief: admins are staff accounts, not
    the consumer accounts 5.1.1(v) is about, and a self-service delete could
    leave the platform with no one who can approve sellers or reset passwords.
    Another admin removes them deliberately instead.
    """
    if user.role == "admin":
        abort(
            403,
            description=(
                "admin accounts cannot be deleted here; ask another admin to "
                "remove this account"
            ),
        )


def orders_to_release(user):
    """The user's checkouts that still hold stock nobody will pay for."""
    return Order.query.filter(
        Order.user_id == user.id,
        Order.payment_status.in_(CANCELLABLE_PAYMENT_STATUSES),
        Order.inventory_released_at.is_(None),
    ).all()


def delete_account(user):
    """Delete the user row and de-identify what has to be kept.

    The caller owns the transaction: this flushes but never commits, so a
    failure anywhere in the request leaves the account intact.
    """
    orders = Order.query.filter_by(user_id=user.id).all()
    for order in orders:
        order.user_id = None

    seller_delisted = False
    seller = Seller.query.get(user.seller_id) if user.seller_id else None
    if seller is not None:
        _scrub_seller_contact(seller, user)
        if _is_last_login(seller, user):
            # Delist rather than delete: the shop's inventory, its history and
            # other buyers' orders all hang off this row. Back to "pending"
            # hides it from buyers until an admin re-approves it with a new
            # owner attached.
            seller.status = "pending"
            seller_delisted = True

    user_id = user.id
    db.session.delete(user)
    db.session.flush()

    summary = {
        "user_id": user_id,
        "orders_anonymized": len(orders),
        "seller_id": seller.id if seller is not None else None,
        "seller_delisted": seller_delisted,
    }
    # Deliberately no email or name in the log line.
    logger.info(
        "account %s deleted: %s orders anonymized, seller %s delisted=%s",
        user_id,
        summary["orders_anonymized"],
        summary["seller_id"],
        seller_delisted,
    )
    return summary


def _scrub_seller_contact(seller, user):
    """Drop shop contact details that are really the departing person's."""
    if seller.contact_email and seller.contact_email == user.email:
        seller.contact_email = None
    if seller.contact_name and seller.contact_name == user.name:
        seller.contact_name = ANONYMOUS_BUYER_LABEL


def _is_last_login(seller, user):
    remaining = User.query.filter(
        User.seller_id == seller.id, User.id != user.id
    ).count()
    return remaining == 0
