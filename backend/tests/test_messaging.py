"""In-site messaging: who can talk to whom, unread counts, and abuse limits."""

import pytest

import mailer
from conftest import BUYER_PASSWORD, login
from models import Conversation, Message, Order, Seller, User, db


def seller_id(app, email):
    with app.app_context():
        return User.query.filter_by(email=email).one().seller_id


def make_order(app, buyer_email, shop_email, payment_status="paid"):
    with app.app_context():
        buyer = User.query.filter_by(email=buyer_email).one()
        shop = User.query.filter_by(email=shop_email).one().seller_id
        order = Order(user_id=buyer.id, seller_id=shop, total_cents=300, payment_status=payment_status)
        db.session.add(order)
        db.session.commit()
        return order.id


def support(api, body="Where is my order?", subject="Help"):
    return api.post("/conversations", json={"kind": "support", "subject": subject, "body": body})


# ----------------------------------------------------------------------
# Support
# ----------------------------------------------------------------------
def test_a_buyer_messages_support_and_an_admin_replies(buyer, admin):
    created = support(buyer)
    assert created.status_code == 201, created.get_json()
    thread = created.get_json()
    assert thread["with"]["name"] == "Candy Lady support"
    assert thread["messages"][0]["from_me"] is True

    assert admin.get("/messages/unread").get_json()["unread"] == 1
    listed = admin.get("/conversations").get_json()["conversations"]
    assert [c["id"] for c in listed] == [thread["id"]]
    assert listed[0]["with"]["name"] == "Alice Carter"
    assert listed[0]["unread_count"] == 1

    reply = admin.post(f"/conversations/{thread['id']}/messages", json={"body": "On its way!"})
    assert reply.status_code == 201
    assert reply.get_json()["sender_name"] == "Candy Lady support"

    # Replying marks the thread read for the admin; the buyer now has one.
    assert admin.get("/messages/unread").get_json()["unread"] == 0
    assert buyer.get("/messages/unread").get_json()["unread"] == 1
    assert buyer.post(f"/conversations/{thread['id']}/read").status_code == 204
    assert buyer.get("/messages/unread").get_json()["unread"] == 0


def test_a_shop_messages_support_as_the_shop(kiki_seller, admin):
    thread = support(kiki_seller, subject="Payout question").get_json()
    listed = admin.get("/conversations").get_json()["conversations"]
    assert listed[0]["id"] == thread["id"]
    assert listed[0]["with"] == {"type": "seller", "id": kiki_seller.user["seller_id"], "name": "Ms. Kiki's Snack Spot"}


def test_an_admin_can_open_a_support_thread_with_a_shop(app, admin, northview_seller):
    target = northview_seller.user["seller_id"]
    created = admin.post(
        "/conversations",
        json={"kind": "support", "seller_id": target, "subject": "Welcome", "body": "Hi!"},
    )
    assert created.status_code == 201
    assert northview_seller.get("/messages/unread").get_json()["unread"] == 1


def test_people_only_see_their_own_conversations(client, buyer, kiki_seller):
    thread = support(buyer).get_json()
    bob = login(client, "bob@example.com", BUYER_PASSWORD)
    assert bob.get(f"/conversations/{thread['id']}").status_code == 404
    assert bob.post(f"/conversations/{thread['id']}/messages", json={"body": "hi"}).status_code == 404
    assert kiki_seller.get(f"/conversations/{thread['id']}").status_code == 404
    assert bob.get("/conversations").get_json() == {"conversations": [], "next_offset": None}


def test_reading_stops_at_the_last_message_the_browser_showed(buyer, admin):
    thread = support(buyer).get_json()
    shown = thread["messages"][0]["id"]
    admin.post(f"/conversations/{thread['id']}/messages", json={"body": "first"})
    seen = buyer.get(f"/conversations/{thread['id']}").get_json()["messages"][-1]["id"]
    # A second reply lands after the browser fetched the thread.
    admin.post(f"/conversations/{thread['id']}/messages", json={"body": "second"})
    assert buyer.post(f"/conversations/{thread['id']}/read", json={"last_message_id": seen}).status_code == 204
    assert buyer.get("/messages/unread").get_json()["unread"] == 1
    assert shown < seen
    assert buyer.post(f"/conversations/{thread['id']}/read", json={"last_message_id": "x"}).status_code == 400


def test_the_inbox_pages_instead_of_dropping_old_threads(monkeypatch, buyer, admin):
    import messaging

    monkeypatch.setattr(messaging, "CONVERSATION_PAGE_SIZE", 2)
    ids = [support(buyer, subject=f"Help {n}").get_json()["id"] for n in range(3)]
    first = admin.get("/conversations").get_json()
    assert [c["id"] for c in first["conversations"]] == [ids[2], ids[1]]
    assert first["next_offset"] == 2
    second = admin.get("/conversations?offset=2").get_json()
    assert [c["id"] for c in second["conversations"]] == [ids[0]]
    assert second["next_offset"] is None


# ----------------------------------------------------------------------
# Shop to shop
# ----------------------------------------------------------------------
def test_approved_shops_can_message_each_other(kiki_seller, northview_seller):
    created = kiki_seller.post(
        "/conversations",
        json={
            "kind": "seller",
            "seller_id": northview_seller.user["seller_id"],
            "subject": "Swap some Takis?",
            "body": "I have extra.",
        },
    )
    assert created.status_code == 201, created.get_json()
    listed = northview_seller.get("/conversations").get_json()["conversations"]
    assert listed[0]["with"]["name"] == "Ms. Kiki's Snack Spot"
    assert listed[0]["unread_count"] == 1


def test_buyers_and_pending_shops_cannot_message_shops_directly(app, client, buyer, kiki_seller):
    kiki = kiki_seller.user["seller_id"]
    refused = buyer.post(
        "/conversations", json={"kind": "seller", "seller_id": kiki, "subject": "Hi", "body": "Hi"}
    )
    assert refused.status_code == 403

    with app.app_context():
        pending = Seller.query.filter_by(status="pending").first()
        pending_id = pending.id
    to_pending = kiki_seller.post(
        "/conversations", json={"kind": "seller", "seller_id": pending_id, "subject": "Hi", "body": "Hi"}
    )
    assert to_pending.status_code == 404
    to_self = kiki_seller.post(
        "/conversations", json={"kind": "seller", "seller_id": kiki, "subject": "Hi", "body": "Hi"}
    )
    assert to_self.status_code == 400


# ----------------------------------------------------------------------
# Orders
# ----------------------------------------------------------------------
def test_a_buyer_messages_the_shop_about_a_paid_order(app, buyer, kiki_seller):
    order_id = make_order(app, "alice@example.com", "kiki@example.com")
    first = buyer.post("/conversations", json={"kind": "order", "order_id": order_id, "body": "Running late"})
    assert first.status_code == 201, first.get_json()
    assert first.get_json()["subject"] == f"Order #{order_id}"

    # The shop answering through the same endpoint lands in the same thread.
    again = kiki_seller.post("/conversations", json={"kind": "order", "order_id": order_id, "body": "No problem"})
    assert again.status_code == 200
    assert again.get_json()["id"] == first.get_json()["id"]
    assert len(again.get_json()["messages"]) == 2
    with app.app_context():
        assert Conversation.query.filter_by(order_id=order_id).count() == 1


def test_order_threads_need_a_paid_order_and_the_right_people(app, client, buyer, northview_seller):
    unpaid = make_order(app, "alice@example.com", "kiki@example.com", payment_status="pending")
    assert (
        buyer.post("/conversations", json={"kind": "order", "order_id": unpaid, "body": "hi"}).status_code
        == 403
    )
    paid = make_order(app, "alice@example.com", "kiki@example.com")
    bob = login(client, "bob@example.com", BUYER_PASSWORD)
    for outsider in (bob, northview_seller):
        response = outsider.post("/conversations", json={"kind": "order", "order_id": paid, "body": "hi"})
        assert response.status_code == 404


# ----------------------------------------------------------------------
# Abuse protection
# ----------------------------------------------------------------------
def test_messages_have_a_length_cap_and_cannot_be_blank(buyer):
    assert support(buyer, body="   ").status_code == 400
    assert support(buyer, body="x" * 2001).status_code == 400
    assert support(buyer, body="x" * 2000).status_code == 201
    long_subject = buyer.post("/conversations", json={"kind": "support", "subject": "s" * 121, "body": "hi"})
    assert long_subject.status_code == 400


def test_sending_too_fast_is_rate_limited(make_app):
    app = make_app(MESSAGE_RATE_PER_MINUTE=3)
    buyer = login(app.test_client(), "alice@example.com", BUYER_PASSWORD)
    thread = support(buyer).get_json()
    for _ in range(2):
        assert buyer.post(f"/conversations/{thread['id']}/messages", json={"body": "hello"}).status_code == 201
    limited = buyer.post(f"/conversations/{thread['id']}/messages", json={"body": "hello"})
    assert limited.status_code == 429


def test_opening_too_many_conversations_is_rate_limited(make_app):
    app = make_app(CONVERSATION_RATE_PER_DAY=2)
    buyer = login(app.test_client(), "alice@example.com", BUYER_PASSWORD)
    assert support(buyer).status_code == 201
    assert support(buyer).status_code == 201
    assert support(buyer).status_code == 429


def test_blocking_stops_both_sides_and_unblocking_restores_it(app, buyer, kiki_seller):
    order_id = make_order(app, "alice@example.com", "kiki@example.com")
    thread = buyer.post("/conversations", json={"kind": "order", "order_id": order_id, "body": "hi"}).get_json()
    assert thread["can_block"] is True

    blocked = kiki_seller.post(f"/conversations/{thread['id']}/block")
    assert blocked.status_code == 200
    assert blocked.get_json()["blocked"] == {"by_me": True, "by_them": False}

    refused = buyer.post(f"/conversations/{thread['id']}/messages", json={"body": "hello?"})
    assert refused.status_code == 403
    assert buyer.get(f"/conversations/{thread['id']}").get_json()["reply_problem"]
    assert kiki_seller.post(f"/conversations/{thread['id']}/messages", json={"body": "x"}).status_code == 403

    assert kiki_seller.delete(f"/conversations/{thread['id']}/block").status_code == 200
    assert buyer.post(f"/conversations/{thread['id']}/messages", json={"body": "hello?"}).status_code == 201


def test_support_cannot_be_blocked(buyer, admin):
    thread = support(buyer).get_json()
    assert thread["can_block"] is False
    assert buyer.post(f"/conversations/{thread['id']}/block").status_code == 400
    assert admin.post(f"/conversations/{thread['id']}/block").status_code == 400


def test_a_report_reaches_the_admin_with_context(app, buyer, kiki_seller, northview_seller, admin):
    created = kiki_seller.post(
        "/conversations",
        json={"kind": "seller", "seller_id": northview_seller.user["seller_id"], "subject": "Hi", "body": "rude words"},
    ).get_json()
    message_id = created["messages"][0]["id"]

    assert kiki_seller.post(f"/messages/{message_id}/report", json={}).status_code == 400  # own message
    assert buyer.post(f"/messages/{message_id}/report", json={}).status_code == 404  # cannot see it
    reported = northview_seller.post(f"/messages/{message_id}/report", json={"reason": "abusive"})
    assert reported.status_code == 201
    assert northview_seller.post(f"/messages/{message_id}/report", json={}).status_code == 200  # no duplicate

    reports = admin.get("/admin/message-reports").get_json()
    assert len(reports) == 1
    assert reports[0]["message"]["body"] == "rude words"
    assert reports[0]["message"]["sender_name"] == "Ms. Kiki's Snack Spot"
    assert reports[0]["reporter_name"] == "Northview Snack Stop"

    resolved = admin.put(f"/admin/message-reports/{reports[0]['id']}", json={"status": "resolved"})
    assert resolved.status_code == 200
    assert admin.get("/admin/message-reports").get_json() == []
    assert kiki_seller.get("/admin/message-reports").status_code == 403


# ----------------------------------------------------------------------
# Account deletion and email
# ----------------------------------------------------------------------
def test_deleting_an_account_keeps_the_shop_history_without_the_person(app, buyer, kiki_seller):
    order_id = make_order(app, "alice@example.com", "kiki@example.com")
    thread = buyer.post("/conversations", json={"kind": "order", "order_id": order_id, "body": "hi"}).get_json()
    assert buyer.delete("/me").status_code == 204

    seen = kiki_seller.get(f"/conversations/{thread['id']}").get_json()
    assert seen["with"]["name"] == "Deleted account"
    assert seen["messages"][0]["sender_name"] == "Deleted account"
    assert seen["reply_problem"] == "the other person deleted their account"
    with app.app_context():
        assert Message.query.filter(Message.sender_user_id.isnot(None)).count() == 0


@pytest.fixture
def sent(monkeypatch):
    outbox = []
    monkeypatch.setattr(
        mailer, "send_email", lambda config, to, subject, text: outbox.append((to, subject, text)) or True
    )
    return outbox


def test_no_email_goes_out_unless_switched_on(buyer, sent):
    support(buyer)
    assert sent == []


def test_email_notice_once_per_unread_thread_without_the_text(make_app, sent):
    app = make_app(
        MESSAGE_EMAIL_NOTIFICATIONS=True,
        RESEND_API_KEY="re_test_placeholder",
        MESSAGE_EMAIL_FROM="The Candy Lady <hello@neighborhoodcandylady.com>",
        SUPPORT_NOTIFY_EMAIL="hello@neighborhoodcandylady.com",
        MESSAGE_EMAIL_SYNC=True,
    )
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    thread = support(buyer, body="secret pickup details").get_json()
    assert [to for to, _, _ in sent] == ["hello@neighborhoodcandylady.com"]
    assert "secret pickup details" not in sent[0][2]
    assert f"/account/messages/{thread['id']}" in sent[0][2]

    # A second message before anyone has read the first sends nothing more.
    buyer.post(f"/conversations/{thread['id']}/messages", json={"body": "again"})
    assert len(sent) == 1


def test_the_mailer_stays_off_until_fully_configured():
    assert not mailer.is_configured({})
    assert not mailer.is_configured({"MESSAGE_EMAIL_NOTIFICATIONS": True, "RESEND_API_KEY": "re_x"})
    assert not mailer.is_configured({"RESEND_API_KEY": "re_x", "MESSAGE_EMAIL_FROM": "a@b.c"})
    assert mailer.is_configured(
        {"MESSAGE_EMAIL_NOTIFICATIONS": True, "RESEND_API_KEY": "re_x", "MESSAGE_EMAIL_FROM": "a@b.c"}
    )
    # Off means nothing is attempted at all.
    assert mailer.send_email({}, "someone@example.com", "s", "t") is False
