"""Regression tests for the order payment state machine and related logic.

Each test pins one defect found in the 2026-10-01 logic review.
"""

from datetime import timedelta

import pytest
from conftest import ADMIN_PASSWORD, BUYER_PASSWORD, SELLER_PASSWORD, login
from sqlalchemy import create_engine, event, text

import payments
from app import DEFAULT_JWT_SECRET, create_app
from models import Order, SellerInventory, db, utcnow
from test_payments import (
    WEBHOOK_SECRET,
    checkout_completed_event,
    first_in_stock_item,
    inventory_count,
    place_order,
    signed_webhook,
)


def expired_event(session_id, order_id, seller_id):
    return {
        "id": "evt_test_expired",
        "type": "checkout.session.expired",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "status": "expired",
                "payment_status": "unpaid",
                "metadata": {"order_id": str(order_id), "seller_id": str(seller_id)},
            }
        },
    }


def charge_refunded_event(payment_intent, amount, amount_refunded):
    return {
        "id": "evt_test_charge_refunded",
        "type": "charge.refunded",
        "data": {
            "object": {
                "id": "ch_test_1",
                "object": "charge",
                "amount": amount,
                "amount_refunded": amount_refunded,
                "refunded": amount_refunded >= amount,
                "payment_intent": payment_intent,
            }
        },
    }


@pytest.fixture
def webhook_app(make_app):
    return make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)


@pytest.fixture
def stub_refunds(monkeypatch):
    refunds = []
    monkeypatch.setattr(
        payments.stripe.Refund,
        "create",
        lambda **params: refunds.append(params) or {"id": f"re_test_{len(refunds)}"},
    )
    return refunds


def paid_order(client, buyer, fake_stripe, quantity=1):
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"], quantity).get_json()
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    confirmed = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert confirmed["payment_status"] == "paid"
    return seller, item, confirmed


# --- A refunded order stays refunded ------------------------------------------


def test_reconfirming_a_refunded_order_does_not_mark_it_paid_again(
    webhook_app, fake_stripe, stub_refunds
):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    seller, _item, order = paid_order(client, buyer, fake_stripe)

    refunded = admin.post(f"/admin/orders/{order['id']}/refund").get_json()
    assert refunded["payment_status"] == "refunded"

    # The buyer reloads Stripe's return page; the session still says "paid".
    again = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert again["payment_status"] == "refunded"
    assert again["pickup_code"] is None

    # Stripe redelivers the original completed event.
    body, headers = signed_webhook(
        checkout_completed_event(fake_stripe.last_session_id, order["id"], seller["id"])
    )
    assert client.post("/stripe/webhook", data=body, headers=headers).status_code == 200
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "refunded"

    kiki = login(client, "kiki@example.com", SELLER_PASSWORD)
    queue = kiki.get(f"/sellers/{seller['id']}/orders").get_json()
    assert order["id"] not in [row["id"] for row in queue]


# --- Webhooks for a replaced Checkout Session are ignored ---------------------


def test_a_late_expired_event_for_a_replaced_session_leaves_the_live_one_alone(
    webhook_app, fake_stripe
):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    start = item["inventory_count"]
    order = place_order(buyer, seller["id"], item["candy_id"], quantity=2).get_json()

    old_session = fake_stripe.last_session_id
    fake_stripe.mark_expired(old_session)
    resumed = buyer.post(f"/orders/{order['id']}/checkout").get_json()
    new_session = fake_stripe.last_session_id
    assert new_session != old_session
    assert resumed["checkout_url"].endswith(new_session)

    body, headers = signed_webhook(expired_event(old_session, order["id"], seller["id"]))
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.get_json() == {"received": True, "handled": False}

    still = buyer.get(f"/orders/{order['id']}").get_json()
    assert still["payment_status"] == "pending"
    assert inventory_count(client, seller["id"], item["candy_id"]) == start - 2


def test_a_completed_event_for_another_session_does_not_mark_the_order_paid(
    webhook_app, fake_stripe
):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    body, headers = signed_webhook(
        checkout_completed_event("cs_test_somebody_else", order["id"], seller["id"])
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"


# --- The abandonment sweep measures from the current session ------------------


def test_the_sweep_does_not_expire_a_checkout_that_was_just_resumed(
    app, client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    fake_stripe.mark_expired(fake_stripe.last_session_id)
    buyer.post(f"/orders/{order['id']}/checkout")

    with app.app_context():
        row = db.session.get(Order, order["id"])
        row.created_at = utcnow() - timedelta(hours=2)
        db.session.commit()

    client.get("/shops")  # runs the sweep
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"

    # Once the resumed session itself is old, the sweep still does its job.
    with app.app_context():
        row = db.session.get(Order, order["id"])
        row.checkout_started_at = utcnow() - timedelta(hours=2)
        db.session.commit()
    client.get("/shops")
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "expired"


def test_the_sweep_never_undercuts_the_stripe_session_lifetime(make_app, fake_stripe):
    app = make_app(PENDING_ORDER_TTL_MINUTES=5, CHECKOUT_SESSION_TTL_MINUTES=31)
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    with app.app_context():
        row = db.session.get(Order, order["id"])
        row.created_at = utcnow() - timedelta(minutes=20)
        row.checkout_started_at = row.created_at
        db.session.commit()
    client.get("/shops")
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"


# --- Cancelling closes the Stripe page ----------------------------------------


def test_cancelling_an_order_expires_its_stripe_session(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    start = item["inventory_count"]
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    session_id = fake_stripe.last_session_id

    cancelled = buyer.post(f"/orders/{order['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.get_json()["payment_status"] == "expired"
    assert session_id in fake_stripe.expired_sessions
    assert fake_stripe.session_state[session_id]["status"] == "expired"
    assert inventory_count(client, seller_id, item["candy_id"]) == start


def test_cancelling_an_order_that_was_just_paid_keeps_it_paid(
    client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    fake_stripe.mark_paid(fake_stripe.last_session_id)  # paid, webhook not here yet

    response = buyer.post(f"/orders/{order['id']}/cancel")
    assert response.status_code == 409
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "paid"


def test_deleting_an_account_expires_its_open_stripe_sessions(
    client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    place_order(buyer, seller_id, item["candy_id"])
    session_id = fake_stripe.last_session_id

    assert buyer.delete("/me").status_code == 204
    assert session_id in fake_stripe.expired_sessions


# --- Stripe failures and row locks --------------------------------------------


def test_a_stripe_failure_gives_the_stock_back(client, buyer, kiki_seller, fake_stripe, monkeypatch):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    start = item["inventory_count"]

    def refuse(**_params):
        raise payments.stripe.APIConnectionError("network down")

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", refuse)
    response = place_order(buyer, seller_id, item["candy_id"], quantity=2)
    assert response.status_code == 502
    assert inventory_count(client, seller_id, item["candy_id"]) == start


def test_the_stock_reservation_is_committed_before_stripe_is_called(
    app, client, buyer, kiki_seller, fake_stripe, monkeypatch
):
    """Committing first is what releases the row locks during the Stripe call."""
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    seen = {}
    original = fake_stripe.create_session

    def observe(**params):
        engine = create_engine(app.config["SQLALCHEMY_DATABASE_URI"])
        with engine.connect() as connection:
            seen["count"] = connection.execute(
                text(
                    "SELECT inventory_count FROM seller_inventory "
                    "WHERE seller_id = :s AND candy_id = :c"
                ),
                {"s": seller_id, "c": item["candy_id"]},
            ).scalar()
        engine.dispose()
        return original(**params)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", observe)
    assert place_order(buyer, seller_id, item["candy_id"], quantity=2).status_code == 201
    assert seen["count"] == item["inventory_count"] - 2


# --- Retiring a catalog item ---------------------------------------------------


def test_retiring_a_catalog_item_that_has_orders_works_with_foreign_keys_on(
    make_app, fake_stripe
):
    app = make_app()
    with app.app_context():
        if db.engine.dialect.name == "sqlite":

            @event.listens_for(db.engine, "connect")
            def enforce_foreign_keys(dbapi_connection, _record):
                dbapi_connection.execute("PRAGMA foreign_keys=ON")

            db.engine.dispose()

    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    assert admin.delete(f"/candies/{item['candy_id']}").status_code == 204
    assert client.get(f"/candies/{item['candy_id']}").status_code == 404
    assert item["candy_id"] not in [c["id"] for c in client.get("/candies").get_json()]
    assert inventory_count(client, seller["id"], item["candy_id"]) == 0

    # The order still names what was bought.
    history = buyer.get(f"/orders/{order['id']}").get_json()
    assert history["items"][0]["candy"]["name"] == item["candy"]["name"]

    with app.app_context():
        rows = SellerInventory.query.filter_by(candy_id=item["candy_id"]).all()
        assert rows and all(row.status == "out-of-stock" for row in rows)


# --- Input validation ----------------------------------------------------------


@pytest.mark.parametrize("quantity", ["two", 1.9, True, 0, -1, None])
def test_a_malformed_quantity_is_a_400(client, buyer, kiki_seller, fake_stripe, quantity):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = buyer.post(
        "/orders",
        json={"seller_id": seller_id, "items": [{"candy_id": item["candy_id"], "quantity": quantity}]},
    )
    assert response.status_code == 400
    assert "quantity" in response.get_json()["error"]


def test_a_whole_number_float_quantity_is_accepted(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = buyer.post(
        "/orders",
        json={"seller_id": seller_id, "items": [{"candy_id": item["candy_id"], "quantity": 2.0}]},
    )
    assert response.status_code == 201
    assert response.get_json()["items"][0]["quantity"] == 2


def test_a_null_inventory_status_is_a_400(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{item['candy_id']}", json={"status": None}
    )
    assert response.status_code == 400


@pytest.mark.parametrize("count", ["lots", -3, 2.5, False])
def test_a_malformed_inventory_count_is_a_400(client, kiki_seller, count):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{item['candy_id']}", json={"inventory_count": count}
    )
    assert response.status_code == 400


@pytest.mark.parametrize("price", [-500, "free", 1.5, None])
def test_admin_catalog_prices_must_be_whole_non_negative_cents(client, admin, price):
    created = admin.post("/candies", json={"name": "Sour Straws", "price_cents": price})
    assert created.status_code == 400

    existing = client.get("/candies").get_json()[0]
    updated = admin.put(f"/candies/{existing['id']}", json={"price_cents": price})
    assert updated.status_code == 400


# --- Inventory status follows the count ---------------------------------------


def test_restocking_by_count_alone_puts_the_item_back_on_the_shelf(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    url = f"/sellers/{seller_id}/inventory/{item['candy_id']}"

    assert kiki_seller.put(url, json={"status": "out-of-stock"}).get_json()["status"] == "out-of-stock"

    restocked = kiki_seller.put(url, json={"inventory_count": 10}).get_json()
    assert restocked["status"] == "in-stock"
    assert inventory_count(client, seller_id, item["candy_id"]) == 10

    assert kiki_seller.put(url, json={"inventory_count": 3}).get_json()["status"] == "low-stock"


def test_zero_units_cannot_be_labelled_in_stock(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    row = kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{item['candy_id']}",
        json={"inventory_count": 0, "status": "in-stock"},
    ).get_json()
    assert row["status"] == "out-of-stock"
    assert row["inventory_count"] == 0


# --- Partial refunds ------------------------------------------------------------


def test_a_partial_refund_keeps_the_order_collectable(webhook_app, fake_stripe):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    _seller, _item, order = paid_order(client, buyer, fake_stripe, quantity=2)
    intent = f"pi_test_{fake_stripe.last_session_id}"

    body, headers = signed_webhook(charge_refunded_event(intent, order["total_cents"], 100))
    client.post("/stripe/webhook", data=body, headers=headers)
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "paid"

    body, headers = signed_webhook(
        charge_refunded_event(intent, order["total_cents"], order["total_cents"])
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "refunded"


# --- A mistyped password does not sign the person out ---------------------------


def test_a_wrong_current_password_is_403_and_the_session_survives(buyer):
    changed = buyer.put(
        "/me/password", json={"current_password": "wrong-one", "new_password": "new-password-1"}
    )
    assert changed.status_code == 403
    assert buyer.delete("/me", json={"password": "wrong-one"}).status_code == 403
    assert buyer.get("/me").status_code == 200


# --- Boot guard -----------------------------------------------------------------


def test_the_api_refuses_to_start_on_a_real_database_with_the_default_jwt_secret(
    monkeypatch,
):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        create_app(
            {
                "SQLALCHEMY_DATABASE_URI": "postgresql://user:pw@127.0.0.1:1/never_reached",
                "JWT_SECRET_KEY": DEFAULT_JWT_SECRET,
            }
        )
