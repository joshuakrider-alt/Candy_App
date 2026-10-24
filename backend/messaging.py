"""In-site messaging: support threads, shop-to-shop threads, order threads.

Who may talk to whom is decided here and nowhere else:

| Kind      | Started by                      | Between                        |
| --------- | ------------------------------- | ------------------------------ |
| `support` | anyone signed in, or an admin   | that buyer or shop, and support |
| `seller`  | an approved shop                | two different approved shops   |
| `order`   | the buyer or the shop           | the order's buyer and its shop |

Every login acts as one party (see models.py): a buyer as itself, a seller
login as its shop, an admin as "support". Admins read support threads only;
they see another conversation's messages only when someone reports one.

Abuse protection is deliberately plain: a length cap on every message, a
per-login rate limit counted from the database (so it holds across gunicorn
workers), blocking between non-support parties, and reports an admin reviews.
Support can never be blocked, so nobody can lock themselves out of help.
"""

import logging
import threading
from datetime import timedelta

from flask import Blueprint, abort, current_app, jsonify, request
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError

import mailer
from auth import current_user, require_roles
from models import (
    MESSAGE_REPORT_STATUSES,
    Conversation,
    ConversationParty,
    ConversationRead,
    Message,
    MessageBlock,
    MessageReport,
    Order,
    Seller,
    User,
    db,
    utcnow,
)

logger = logging.getLogger(__name__)

bp = Blueprint("messaging", __name__)

SUPPORT_LABEL = "Candy Lady support"
DELETED_LABEL = "Deleted account"

MAX_SUBJECT_LENGTH = 120
MAX_REPORT_REASON_LENGTH = 500
PREVIEW_LENGTH = 140
REPORT_CONTEXT_MESSAGES = 5

# Orders a buyer actually paid for. Unpaid and expired checkouts never became
# a sale, so they do not open a channel to the shop.
MESSAGEABLE_PAYMENT_STATUSES = ("paid", "pay_at_pickup", "refunded")


def configure(app, env_int, env_bool, environ):
    """Read the messaging settings into app.config (called by create_app)."""
    app.config.setdefault("MESSAGE_MAX_LENGTH", env_int("MESSAGE_MAX_LENGTH", 2000))
    app.config.setdefault(
        "MESSAGE_RATE_PER_MINUTE", env_int("MESSAGE_RATE_PER_MINUTE", 6)
    )
    app.config.setdefault("MESSAGE_RATE_PER_HOUR", env_int("MESSAGE_RATE_PER_HOUR", 60))
    app.config.setdefault(
        "CONVERSATION_RATE_PER_DAY", env_int("CONVERSATION_RATE_PER_DAY", 10)
    )
    app.config.setdefault(
        "MESSAGE_EMAIL_NOTIFICATIONS", env_bool("MESSAGE_EMAIL_NOTIFICATIONS", False)
    )
    app.config.setdefault("RESEND_API_KEY", environ.get("RESEND_API_KEY", ""))
    app.config.setdefault("MESSAGE_EMAIL_FROM", environ.get("MESSAGE_EMAIL_FROM", ""))
    app.config.setdefault("SUPPORT_NOTIFY_EMAIL", environ.get("SUPPORT_NOTIFY_EMAIL", ""))
    # Tests send inline so they can see what went out.
    app.config.setdefault("MESSAGE_EMAIL_SYNC", False)


# ----------------------------------------------------------------------
# Parties
# ----------------------------------------------------------------------
def party_of(user):
    """The (type, id) a login reads and writes as."""
    if user.role == "admin":
        return ("support", None)
    if user.role == "seller" and user.seller_id:
        return ("seller", user.seller_id)
    return ("user", user.id)


def _matches(type_column, id_column, party):
    """SQL for "this row's party is `party`", NULL-safe for support."""
    party_type, party_id = party
    id_match = id_column.is_(None) if party_id is None else id_column == party_id
    return and_(type_column == party_type, id_match)


def _not_from(party):
    """SQL for "this message was not sent by `party`"."""
    party_type, party_id = party
    if party_id is None:
        return or_(
            Message.sender_party_type != party_type,
            Message.sender_party_id.isnot(None),
        )
    return or_(
        Message.sender_party_type != party_type,
        Message.sender_party_id.is_(None),
        Message.sender_party_id != party_id,
    )


def party_label(party_type, party_id):
    if party_type == "support":
        return SUPPORT_LABEL
    if party_id is None:
        return DELETED_LABEL
    if party_type == "seller":
        seller = db.session.get(Seller, party_id)
        return seller.shop_name if seller else "A shop"
    user = db.session.get(User, party_id)
    return user.name if user else DELETED_LABEL


def _party_tuple(row):
    return (row.party_type, row.party_id)


def other_parties(conversation, party):
    return [p for p in conversation.parties if _party_tuple(p) != party]


def logins_for(party):
    """The accounts that read as `party`, for notifications."""
    party_type, party_id = party
    if party_type == "support":
        return User.query.filter_by(role="admin").all()
    if party_id is None:
        return []
    if party_type == "seller":
        return User.query.filter_by(seller_id=party_id, role="seller").all()
    user = db.session.get(User, party_id)
    return [user] if user else []


# ----------------------------------------------------------------------
# Blocks
# ----------------------------------------------------------------------
def _block_between(first, second):
    """The block rows between two parties, in either direction."""
    if first[0] == "support" or second[0] == "support":
        return []
    if first[1] is None or second[1] is None:
        return []
    return MessageBlock.query.filter(
        or_(
            and_(
                MessageBlock.blocker_type == first[0],
                MessageBlock.blocker_id == first[1],
                MessageBlock.blocked_type == second[0],
                MessageBlock.blocked_id == second[1],
            ),
            and_(
                MessageBlock.blocker_type == second[0],
                MessageBlock.blocker_id == second[1],
                MessageBlock.blocked_type == first[0],
                MessageBlock.blocked_id == first[1],
            ),
        )
    ).all()


def block_state(me, others):
    by_me = by_them = False
    for other in others:
        for block in _block_between(me, _party_tuple(other)):
            if (block.blocker_type, block.blocker_id) == me:
                by_me = True
            else:
                by_them = True
    return {"by_me": by_me, "by_them": by_them}


def reply_problem(conversation, me):
    """Why `me` cannot post here right now, or None."""
    others = other_parties(conversation, me)
    if not others or all(p.party_type != "support" and p.party_id is None for p in others):
        return "the other person deleted their account"
    blocks = block_state(me, others)
    if blocks["by_me"]:
        return "you blocked this conversation; unblock it to reply"
    if blocks["by_them"]:
        return "you can't send messages in this conversation"
    return None


# ----------------------------------------------------------------------
# Validation and rate limits
# ----------------------------------------------------------------------
def clean_body(value):
    if not isinstance(value, str):
        abort(400, description="write a message first")
    body = value.replace("\x00", "").strip()
    if not body:
        abort(400, description="write a message first")
    limit = current_app.config["MESSAGE_MAX_LENGTH"]
    if len(body) > limit:
        abort(400, description=f"messages can be at most {limit} characters")
    return body


def clean_subject(value, fallback=None):
    subject = (value if isinstance(value, str) else "").replace("\x00", "").strip()
    if not subject:
        if fallback:
            return fallback
        abort(400, description="add a subject")
    if len(subject) > MAX_SUBJECT_LENGTH:
        abort(400, description=f"subjects can be at most {MAX_SUBJECT_LENGTH} characters")
    return subject


def enforce_rate_limit(user, new_conversation=False):
    """429 when a login is sending faster than a person types. Admins are exempt."""
    if user.role == "admin":
        return
    config = current_app.config
    now = utcnow()
    sent = Message.query.filter(Message.sender_user_id == user.id)
    if sent.filter(Message.created_at >= now - timedelta(minutes=1)).count() >= config[
        "MESSAGE_RATE_PER_MINUTE"
    ]:
        abort(429, description="you're sending messages too quickly; wait a minute")
    if sent.filter(Message.created_at >= now - timedelta(hours=1)).count() >= config[
        "MESSAGE_RATE_PER_HOUR"
    ]:
        abort(429, description="you've sent a lot of messages this hour; try again later")
    if new_conversation:
        started = Conversation.query.filter(
            Conversation.created_by_user_id == user.id,
            Conversation.created_at >= now - timedelta(days=1),
        ).count()
        if started >= config["CONVERSATION_RATE_PER_DAY"]:
            abort(
                429,
                description="you've started a lot of conversations today; try again tomorrow",
            )


# ----------------------------------------------------------------------
# Reads and unread counts
# ----------------------------------------------------------------------
def _unread_query(user, party):
    return (
        db.session.query(Message.conversation_id, func.count(Message.id))
        .join(
            ConversationParty,
            and_(
                ConversationParty.conversation_id == Message.conversation_id,
                _matches(ConversationParty.party_type, ConversationParty.party_id, party),
            ),
        )
        .outerjoin(
            ConversationRead,
            and_(
                ConversationRead.conversation_id == Message.conversation_id,
                ConversationRead.user_id == user.id,
            ),
        )
        .filter(Message.id > func.coalesce(ConversationRead.last_read_message_id, 0))
        .filter(_not_from(party))
        .group_by(Message.conversation_id)
    )


def unread_by_conversation(user):
    return dict(_unread_query(user, party_of(user)).all())


def mark_read(user, conversation):
    latest = (
        db.session.query(func.max(Message.id))
        .filter(Message.conversation_id == conversation.id)
        .scalar()
        or 0
    )
    row = ConversationRead.query.filter_by(
        conversation_id=conversation.id, user_id=user.id
    ).first()
    if row is None:
        row = ConversationRead(conversation_id=conversation.id, user_id=user.id)
        db.session.add(row)
    row.last_read_message_id = max(row.last_read_message_id or 0, latest)


# ----------------------------------------------------------------------
# Serialization
# ----------------------------------------------------------------------
def message_dict(message, me):
    sender = (message.sender_party_type, message.sender_party_id)
    return {
        "id": message.id,
        "body": message.body,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "from_me": sender == me,
        "sender_name": party_label(*sender),
        "sender_type": message.sender_party_type,
    }


def conversation_dict(conversation, user, unread=0, include_messages=False):
    me = party_of(user)
    others = other_parties(conversation, me)
    other = others[0] if others else None
    last = conversation.messages[-1] if conversation.messages else None
    data = {
        "id": conversation.id,
        "kind": conversation.kind,
        "subject": conversation.subject,
        "order_id": conversation.order_id,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "last_message_at": conversation.last_message_at.isoformat()
        if conversation.last_message_at
        else None,
        "with": {
            "type": other.party_type if other else None,
            "id": other.party_id if other else None,
            "name": party_label(other.party_type, other.party_id) if other else DELETED_LABEL,
        },
        "unread_count": unread,
        "last_message": {
            "preview": last.body[:PREVIEW_LENGTH],
            "from_me": (last.sender_party_type, last.sender_party_id) == me,
            "created_at": last.created_at.isoformat() if last.created_at else None,
        }
        if last
        else None,
        "blocked": block_state(me, others),
        "can_block": bool(
            other and other.party_type != "support" and other.party_id is not None
            and me[0] != "support"
        ),
    }
    if include_messages:
        data["messages"] = [message_dict(m, me) for m in conversation.messages]
        data["reply_problem"] = reply_problem(conversation, me)
    return data


# ----------------------------------------------------------------------
# Loading with access checks
# ----------------------------------------------------------------------
def conversation_for(user, conversation_id):
    """The conversation if `user` is a party to it; 404 otherwise.

    404 rather than 403 so ids do not reveal which conversations exist.
    """
    conversation = db.session.get(Conversation, conversation_id)
    me = party_of(user)
    if conversation is None or not any(
        _party_tuple(p) == me for p in conversation.parties
    ):
        abort(404, description="conversation not found")
    return conversation


# ----------------------------------------------------------------------
# Sending
# ----------------------------------------------------------------------
def post_message(conversation, user, body):
    me = party_of(user)
    problem = reply_problem(conversation, me)
    if problem:
        abort(403, description=problem)
    # Who already had something waiting, so a burst of messages sends one
    # email per conversation rather than one per message.
    recipients = _first_unread_recipients(conversation, me)
    message = Message(
        conversation=conversation,
        sender_user_id=user.id,
        sender_party_type=me[0],
        sender_party_id=me[1],
        body=body,
    )
    db.session.add(message)
    conversation.last_message_at = utcnow()
    db.session.flush()
    mark_read(user, conversation)
    return message, recipients


def _first_unread_recipients(conversation, sender_party):
    recipients = []
    for party in other_parties(conversation, sender_party):
        target = _party_tuple(party)
        for login in logins_for(target):
            pending = (
                _unread_query(login, target)
                .filter(Message.conversation_id == conversation.id)
                .first()
            )
            if not pending:
                recipients.append(login.email)
    override = current_app.config.get("SUPPORT_NOTIFY_EMAIL")
    if override and sender_party[0] != "support":
        # One shared inbox (hello@) instead of each admin's own address.
        admin_emails = {u.email for u in logins_for(("support", None))}
        if admin_emails & set(recipients):
            recipients = [r for r in recipients if r not in admin_emails] + [override]
    return sorted(set(recipients))


def notify(conversation, sender_name, recipients):
    """Email each recipient that a message is waiting. Never includes the text.

    The body stays on the site: an email copy could not be taken back after a
    report, and a link-only notice is harder to spoof into a phishing lure.
    """
    config = current_app.config
    if not recipients or not mailer.is_configured(config):
        return
    site = config.get("PUBLIC_SITE_URL", "").rstrip("/")
    link = f"{site}/account/messages/{conversation.id}"
    subject = f"New message from {sender_name} on The Candy Lady"
    text = (
        f"{sender_name} sent you a message about \"{conversation.subject}\".\n\n"
        f"Read and reply here: {link}\n\n"
        "You're getting this because you have an account on The Candy Lady. "
        "Questions? hello@neighborhoodcandylady.com"
    )
    settings = {key: config.get(key) for key in (
        "MESSAGE_EMAIL_NOTIFICATIONS", "RESEND_API_KEY", "MESSAGE_EMAIL_FROM",
    )}

    def send_all():
        for address in recipients:
            mailer.send_email(settings, address, subject, text)

    if config.get("MESSAGE_EMAIL_SYNC"):
        send_all()
    else:
        threading.Thread(target=send_all, daemon=True).start()


def _commit_and_notify(conversation, user, recipients):
    db.session.commit()
    notify(conversation, party_label(*party_of(user)), recipients)


# ----------------------------------------------------------------------
# Account deletion
# ----------------------------------------------------------------------
def forget_user(user):
    """De-identify a deleted login's messaging rows. Flushes, never commits.

    Messages stay so the other side keeps its history, but nothing ties them
    to the account any more. Read markers and blocks the person set go.
    """
    Conversation.query.filter_by(created_by_user_id=user.id).update(
        {"created_by_user_id": None}, synchronize_session=False
    )
    Message.query.filter_by(sender_user_id=user.id).update(
        {"sender_user_id": None}, synchronize_session=False
    )
    Message.query.filter_by(sender_party_type="user", sender_party_id=user.id).update(
        {"sender_party_id": None}, synchronize_session=False
    )
    ConversationParty.query.filter_by(party_type="user", party_id=user.id).update(
        {"party_id": None}, synchronize_session=False
    )
    ConversationRead.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    MessageBlock.query.filter(
        or_(
            and_(MessageBlock.blocker_type == "user", MessageBlock.blocker_id == user.id),
            and_(MessageBlock.blocked_type == "user", MessageBlock.blocked_id == user.id),
        )
    ).delete(synchronize_session=False)
    MessageReport.query.filter_by(reporter_user_id=user.id).update(
        {"reporter_user_id": None}, synchronize_session=False
    )
    MessageReport.query.filter_by(resolved_by_user_id=user.id).update(
        {"resolved_by_user_id": None}, synchronize_session=False
    )
    db.session.flush()


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@bp.route("/messages/unread", methods=["GET"])
@require_roles()
def unread_count():
    counts = unread_by_conversation(current_user())
    return jsonify(unread=sum(counts.values()), conversations=len(counts))


@bp.route("/conversations", methods=["GET"])
@require_roles()
def list_conversations():
    user = current_user()
    me = party_of(user)
    conversations = (
        Conversation.query.join(
            ConversationParty, ConversationParty.conversation_id == Conversation.id
        )
        .filter(_matches(ConversationParty.party_type, ConversationParty.party_id, me))
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
        .limit(100)
        .all()
    )
    unread = unread_by_conversation(user)
    return jsonify(
        [conversation_dict(c, user, unread.get(c.id, 0)) for c in conversations]
    )


@bp.route("/conversations", methods=["POST"])
@require_roles()
def start_conversation():
    user = current_user()
    me = party_of(user)
    data = request.get_json() or {}
    kind = data.get("kind")
    body = clean_body(data.get("body"))

    if kind == "order":
        return _start_order_conversation(user, me, data, body)

    if kind == "support":
        if me[0] == "support":
            target = _admin_support_target(data)
        else:
            target = me
        parties = [target, ("support", None)]
    elif kind == "seller":
        if me[0] != "seller":
            abort(403, description="only shops can message other shops")
        own = db.session.get(Seller, me[1])
        if own is None or own.status != "approved":
            abort(403, description="your shop has to be approved before it can message other shops")
        target_id = data.get("seller_id")
        if not isinstance(target_id, int) or isinstance(target_id, bool):
            abort(400, description="pick a shop to message")
        if target_id == me[1]:
            abort(400, description="you can't message your own shop")
        other = db.session.get(Seller, target_id)
        if other is None or other.status != "approved":
            abort(404, description="shop not found")
        target = ("seller", target_id)
        if _block_between(me, target):
            abort(403, description="you can't message this shop")
        parties = [me, target]
    else:
        abort(400, description="kind must be one of: support, seller, order")

    subject = clean_subject(data.get("subject"))
    enforce_rate_limit(user, new_conversation=True)
    conversation = Conversation(kind=kind, subject=subject, created_by_user_id=user.id)
    for party_type, party_id in parties:
        conversation.parties.append(ConversationParty(party_type=party_type, party_id=party_id))
    db.session.add(conversation)
    db.session.flush()
    _, recipients = post_message(conversation, user, body)
    _commit_and_notify(conversation, user, recipients)
    return jsonify(conversation_dict(conversation, user, include_messages=True)), 201


def _admin_support_target(data):
    """An admin opening a support thread names who it is with."""
    if isinstance(data.get("seller_id"), int):
        seller = db.session.get(Seller, data["seller_id"])
        if seller is None:
            abort(404, description="shop not found")
        return ("seller", seller.id)
    if isinstance(data.get("user_id"), int):
        target = db.session.get(User, data["user_id"])
        if target is None or target.role == "admin":
            abort(404, description="account not found")
        return party_of(target)
    abort(400, description="say which shop (seller_id) or buyer (user_id) to message")


def _start_order_conversation(user, me, data, body):
    order_id = data.get("order_id")
    if not isinstance(order_id, int) or isinstance(order_id, bool):
        abort(400, description="order_id is required")
    order = db.session.get(Order, order_id)
    is_buyer = order is not None and me == ("user", order.user_id)
    is_shop = order is not None and me == ("seller", order.seller_id)
    if not (is_buyer or is_shop):
        abort(404, description="order not found")
    if order.payment_status not in MESSAGEABLE_PAYMENT_STATUSES:
        abort(403, description="you can message the shop once this order is paid")
    if order.user_id is None:
        abort(403, description="the buyer deleted their account")

    conversation = Conversation.query.filter_by(order_id=order.id).first()
    created = conversation is None
    if created:
        enforce_rate_limit(user, new_conversation=True)
        conversation = Conversation(
            kind="order",
            subject=f"Order #{order.id}",
            order_id=order.id,
            created_by_user_id=user.id,
        )
        conversation.parties.append(ConversationParty(party_type="user", party_id=order.user_id))
        conversation.parties.append(ConversationParty(party_type="seller", party_id=order.seller_id))
        db.session.add(conversation)
        try:
            db.session.flush()
        except IntegrityError:
            # The other side opened it in the same instant; use theirs.
            db.session.rollback()
            conversation = Conversation.query.filter_by(order_id=order.id).one()
            created = False
    else:
        enforce_rate_limit(user)
    _, recipients = post_message(conversation, user, body)
    _commit_and_notify(conversation, user, recipients)
    return (
        jsonify(conversation_dict(conversation, user, include_messages=True)),
        201 if created else 200,
    )


@bp.route("/conversations/<int:conversation_id>", methods=["GET"])
@require_roles()
def get_conversation(conversation_id):
    user = current_user()
    conversation = conversation_for(user, conversation_id)
    unread = unread_by_conversation(user).get(conversation.id, 0)
    return jsonify(conversation_dict(conversation, user, unread, include_messages=True))


@bp.route("/conversations/<int:conversation_id>/messages", methods=["POST"])
@require_roles()
def reply(conversation_id):
    user = current_user()
    conversation = conversation_for(user, conversation_id)
    body = clean_body((request.get_json() or {}).get("body"))
    enforce_rate_limit(user)
    message, recipients = post_message(conversation, user, body)
    _commit_and_notify(conversation, user, recipients)
    return jsonify(message_dict(message, party_of(user))), 201


@bp.route("/conversations/<int:conversation_id>/read", methods=["POST"])
@require_roles()
def read_conversation(conversation_id):
    user = current_user()
    conversation = conversation_for(user, conversation_id)
    mark_read(user, conversation)
    try:
        db.session.commit()
    except IntegrityError:
        # Two tabs marked it read at once; the other one already did the job.
        db.session.rollback()
    return "", 204


@bp.route("/conversations/<int:conversation_id>/block", methods=["POST"])
@require_roles()
def block_conversation(conversation_id):
    user = current_user()
    conversation = conversation_for(user, conversation_id)
    me = party_of(user)
    if me[0] == "support":
        abort(400, description="support can't block anyone; resolve a report instead")
    targets = [
        _party_tuple(p)
        for p in other_parties(conversation, me)
        if p.party_type != "support" and p.party_id is not None
    ]
    if not targets:
        abort(400, description="support can't be blocked")
    for target in targets:
        exists = MessageBlock.query.filter_by(
            blocker_type=me[0], blocker_id=me[1], blocked_type=target[0], blocked_id=target[1]
        ).first()
        if exists is None:
            db.session.add(
                MessageBlock(
                    blocker_type=me[0], blocker_id=me[1], blocked_type=target[0], blocked_id=target[1]
                )
            )
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
    return jsonify(conversation_dict(conversation, user, include_messages=True))


@bp.route("/conversations/<int:conversation_id>/block", methods=["DELETE"])
@require_roles()
def unblock_conversation(conversation_id):
    user = current_user()
    conversation = conversation_for(user, conversation_id)
    me = party_of(user)
    for party in other_parties(conversation, me):
        if party.party_id is None:
            continue
        MessageBlock.query.filter_by(
            blocker_type=me[0],
            blocker_id=me[1],
            blocked_type=party.party_type,
            blocked_id=party.party_id,
        ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify(conversation_dict(conversation, user, include_messages=True))


@bp.route("/messages/<int:message_id>/report", methods=["POST"])
@require_roles()
def report_message(message_id):
    user = current_user()
    message = db.session.get(Message, message_id)
    if message is None:
        abort(404, description="message not found")
    # Only someone who can see the message can report it.
    conversation_for(user, message.conversation_id)
    if (message.sender_party_type, message.sender_party_id) == party_of(user):
        abort(400, description="you can't report your own message")
    reason = (request.get_json() or {}).get("reason")
    reason = (reason if isinstance(reason, str) else "").strip()[:MAX_REPORT_REASON_LENGTH] or None
    existing = MessageReport.query.filter_by(
        message_id=message.id, reporter_user_id=user.id
    ).first()
    if existing is not None:
        return jsonify(report_dict(existing)), 200
    report = MessageReport(message_id=message.id, reporter_user_id=user.id, reason=reason)
    db.session.add(report)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        report = MessageReport.query.filter_by(
            message_id=message.id, reporter_user_id=user.id
        ).one()
        return jsonify(report_dict(report)), 200
    logger.info("message %s reported (report %s)", message.id, report.id)
    return jsonify(report_dict(report)), 201


def report_dict(report, include_context=False):
    message = report.message
    reporter = db.session.get(User, report.reporter_user_id) if report.reporter_user_id else None
    data = {
        "id": report.id,
        "status": report.status,
        "reason": report.reason,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "resolved_at": report.resolved_at.isoformat() if report.resolved_at else None,
        "message_id": report.message_id,
    }
    if include_context:
        conversation = message.conversation
        earlier = (
            Message.query.filter(
                Message.conversation_id == conversation.id, Message.id <= message.id
            )
            .order_by(Message.id.desc())
            .limit(REPORT_CONTEXT_MESSAGES + 1)
            .all()
        )
        data.update(
            {
                "reporter_name": party_label(*party_of(reporter)) if reporter else DELETED_LABEL,
                "conversation": {
                    "id": conversation.id,
                    "kind": conversation.kind,
                    "subject": conversation.subject,
                },
                "message": {
                    "id": message.id,
                    "body": message.body,
                    "sender_name": party_label(message.sender_party_type, message.sender_party_id),
                    "sender_type": message.sender_party_type,
                    "created_at": message.created_at.isoformat() if message.created_at else None,
                },
                "context": [
                    {
                        "id": m.id,
                        "body": m.body,
                        "sender_name": party_label(m.sender_party_type, m.sender_party_id),
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                    }
                    for m in reversed(earlier)
                ],
            }
        )
    return data


@bp.route("/admin/message-reports", methods=["GET"])
@require_roles("admin")
def list_reports():
    status = request.args.get("status", "open")
    if status not in MESSAGE_REPORT_STATUSES:
        abort(400, description=f"status must be one of: {', '.join(MESSAGE_REPORT_STATUSES)}")
    reports = (
        MessageReport.query.filter_by(status=status)
        .order_by(MessageReport.created_at.asc())
        .limit(100)
        .all()
    )
    return jsonify([report_dict(r, include_context=True) for r in reports])


@bp.route("/admin/message-reports/<int:report_id>", methods=["PUT"])
@require_roles("admin")
def update_report(report_id):
    report = db.session.get(MessageReport, report_id)
    if report is None:
        abort(404, description="report not found")
    status = (request.get_json() or {}).get("status")
    if status not in MESSAGE_REPORT_STATUSES:
        abort(400, description=f"status must be one of: {', '.join(MESSAGE_REPORT_STATUSES)}")
    report.status = status
    if status == "resolved":
        report.resolved_at = utcnow()
        report.resolved_by_user_id = current_user().id
    else:
        report.resolved_at = None
        report.resolved_by_user_id = None
    db.session.commit()
    return jsonify(report_dict(report, include_context=True))
