"""Regression tests for the order payment state machine and related logic.

Each test pins one defect found in the 2026-10-01 logic review.
"""

import os
import threading
import time
from datetime import timedelta

import pytest
from conftest import ADMIN_PASSWORD, BUYER_PASSWORD, SELLER_PASSWORD, login
from sqlalchemy import create_engine, event, text

import payments
from app import DEFAULT_JWT_SECRET, create_app
from migrations import run_migrations
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
    assert refunded["refunded_cents"] == order["total_cents"]

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


def test_a_paid_session_that_lost_a_resume_race_still_marks_the_order_paid(
    webhook_app, fake_stripe
):
    """Two overlapping resumes can each open a session; only one id is stored.

    If the buyer pays the other one, that is still this order's money.
    """
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()
    paid_session = fake_stripe.last_session_id

    with webhook_app.app_context():
        row = db.session.get(Order, order["id"])
        row.stripe_checkout_session_id = "cs_test_won_the_race"
        db.session.commit()

    fake_stripe.mark_paid(paid_session)
    body, headers = signed_webhook(
        checkout_completed_event(paid_session, order["id"], seller["id"])
    )
    assert client.post("/stripe/webhook", data=body, headers=headers).get_json()["handled"]

    paid = buyer.get(f"/orders/{order['id']}").get_json()
    assert paid["payment_status"] == "paid"
    assert paid["pickup_code"]
    with webhook_app.app_context():
        # The paid session becomes the current one, so confirm reads it.
        assert db.session.get(Order, order["id"]).stripe_checkout_session_id == paid_session


postgres_only = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="row locks need Postgres; SQLite serializes writers differently",
)


def run_together(*calls):
    results = [None] * len(calls)
    barrier = threading.Barrier(len(calls))

    def run(index, call):
        barrier.wait()
        results[index] = call()

    threads = [threading.Thread(target=run, args=(i, c)) for i, c in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    return results


@postgres_only
def test_overlapping_resumes_open_only_one_new_session(app, client, buyer, kiki_seller, fake_stripe, monkeypatch):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    fake_stripe.mark_expired(fake_stripe.last_session_id)
    before = len(fake_stripe.created_sessions)

    original = fake_stripe.create_session

    def slow_create(**params):
        time.sleep(0.5)
        return original(**params)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", slow_create)
    url = f"/orders/{order['id']}/checkout"
    first, second = run_together(lambda: buyer.post(url), lambda: buyer.post(url))

    assert first.status_code == 200 and second.status_code == 200
    assert len(fake_stripe.created_sessions) == before + 1
    assert first.get_json()["checkout_url"] == second.get_json()["checkout_url"]


@postgres_only
def test_concurrent_payment_confirmations_reserve_stock_once(app, client, buyer, kiki_seller, fake_stripe, monkeypatch):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    start = item["inventory_count"]
    order = place_order(buyer, seller_id, item["candy_id"], quantity=2).get_json()
    session_id = fake_stripe.last_session_id

    # The sweep already released the stock; then the buyer's payment lands.
    with app.app_context():
        row = db.session.get(Order, order["id"])
        row.checkout_started_at = utcnow() - timedelta(hours=2)
        db.session.commit()
    client.get("/shops")
    assert inventory_count(client, seller_id, item["candy_id"]) == start
    fake_stripe.mark_paid(session_id)

    original = fake_stripe.retrieve_session

    def slow_retrieve(sid, **kwargs):
        time.sleep(0.5)
        return original(sid, **kwargs)

    monkeypatch.setattr(payments.stripe.checkout.Session, "retrieve", slow_retrieve)
    url = f"/orders/{order['id']}/payment/confirm"
    run_together(lambda: buyer.post(url), lambda: buyer.post(url))

    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "paid"
    assert inventory_count(client, seller_id, item["candy_id"]) == start - 2


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


def test_an_order_released_while_stripe_answers_does_not_go_live(
    app, client, buyer, kiki_seller, fake_stripe, monkeypatch
):
    """Account deletion can release a new order during the Stripe call."""
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    original = fake_stripe.create_session

    def released_meanwhile(**params):
        order_id = int(params["client_reference_id"])
        Order.query.filter_by(id=order_id).update(
            {"payment_status": "expired", "inventory_released_at": utcnow()},
            synchronize_session=False,
        )
        db.session.commit()
        return original(**params)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", released_meanwhile)
    response = place_order(buyer, seller_id, item["candy_id"])
    assert response.status_code == 409
    session_id = fake_stripe.last_session_id
    assert session_id in fake_stripe.expired_sessions

    with app.app_context():
        order = Order.query.order_by(Order.id.desc()).first()
        assert order.payment_status == "expired"
        assert order.stripe_checkout_session_id != session_id


def test_resume_waits_for_the_first_checkout_to_finish_opening(
    app, client, buyer, kiki_seller, fake_stripe, monkeypatch
):
    """A resume during POST /orders' Stripe call must not open a second session."""
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    original = fake_stripe.create_session
    seen = {}

    def resume_meanwhile(**params):
        if "resume" not in seen:
            order_id = int(params["client_reference_id"])
            seen["resume"] = buyer.post(f"/orders/{order_id}/checkout")
        return original(**params)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", resume_meanwhile)
    created = place_order(buyer, seller_id, item["candy_id"])
    assert seen["resume"].status_code == 409
    assert created.status_code == 201
    assert len(fake_stripe.created_sessions) == 1


def test_a_session_attached_while_stripe_answers_wins(
    app, client, buyer, kiki_seller, fake_stripe, monkeypatch
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    original = fake_stripe.create_session

    def attached_meanwhile(**params):
        order_id = int(params["client_reference_id"])
        Order.query.filter_by(id=order_id).update(
            {"stripe_checkout_session_id": "cs_test_attached_elsewhere"},
            synchronize_session=False,
        )
        db.session.commit()
        return original(**params)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", attached_meanwhile)
    response = place_order(buyer, seller_id, item["candy_id"])
    assert response.status_code == 409
    assert fake_stripe.last_session_id in fake_stripe.expired_sessions
    with app.app_context():
        order = Order.query.order_by(Order.id.desc()).first()
        assert order.stripe_checkout_session_id == "cs_test_attached_elsewhere"


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

    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    before = admin.get("/admin/revenue").get_json()

    body, headers = signed_webhook(charge_refunded_event(intent, order["total_cents"], 100))
    client.post("/stripe/webhook", data=body, headers=headers)
    partial = buyer.get(f"/orders/{order['id']}").get_json()
    assert partial["payment_status"] == "paid"
    assert partial["refunded_cents"] == 100
    assert partial["seller_payout_cents"] == order["seller_payout_cents"] - 100

    after = admin.get("/admin/revenue").get_json()
    assert after["paid_order_count"] == before["paid_order_count"]
    assert after["gross_cents"] == before["gross_cents"] - 100
    assert after["partially_refunded_cents"] == before["partially_refunded_cents"] + 100
    assert after["connect_seller_payout_cents"] == before["connect_seller_payout_cents"] - 100

    # A redelivered event does not count the same refund twice.
    client.post("/stripe/webhook", data=body, headers=headers)
    assert buyer.get(f"/orders/{order['id']}").get_json()["refunded_cents"] == 100

    body, headers = signed_webhook(
        charge_refunded_event(intent, order["total_cents"], order["total_cents"])
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    full = buyer.get(f"/orders/{order['id']}").get_json()
    assert full["payment_status"] == "refunded"
    assert full["refunded_cents"] == order["total_cents"]


def test_a_full_refund_that_arrives_before_the_payment_wins(webhook_app, fake_stripe):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    start = item["inventory_count"]
    order = place_order(buyer, seller["id"], item["candy_id"], quantity=2).get_json()
    session_id = fake_stripe.last_session_id
    fake_stripe.mark_paid(session_id)

    refund = charge_refunded_event(
        f"pi_test_{session_id}", order["total_cents"], order["total_cents"]
    )
    refund["data"]["object"]["metadata"] = {"order_id": str(order["id"])}
    body, headers = signed_webhook(refund)
    assert client.post("/stripe/webhook", data=body, headers=headers).status_code == 200
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"

    body, headers = signed_webhook(
        checkout_completed_event(session_id, order["id"], seller["id"])
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    final = buyer.get(f"/orders/{order['id']}").get_json()
    assert final["payment_status"] == "refunded"
    assert final["pickup_code"] is None
    assert final["refunded_cents"] == order["total_cents"]
    assert inventory_count(client, seller["id"], item["candy_id"]) == start


def test_a_refund_for_an_unknown_payment_is_left_for_stripe_to_redeliver(webhook_app, fake_stripe):
    client = webhook_app.test_client()
    body, headers = signed_webhook(charge_refunded_event("pi_test_not_seen_yet", 500, 500))
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.status_code == 409


def test_seller_payout_totals_clamp_each_order_at_zero(webhook_app, fake_stripe):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    _seller, _item, heavy = paid_order(client, buyer, fake_stripe)
    heavy_intent = f"pi_test_{fake_stripe.last_session_id}"
    _seller, _item, intact = paid_order(client, buyer, fake_stripe)

    # Refund more than the seller's share, but not the whole order.
    refunded = heavy["total_cents"] - heavy["platform_fee_cents"] + 5
    assert refunded < heavy["total_cents"]
    body, headers = signed_webhook(
        charge_refunded_event(heavy_intent, heavy["total_cents"], refunded)
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    assert buyer.get(f"/orders/{heavy['id']}").get_json()["seller_payout_cents"] == 0

    revenue = admin.get("/admin/revenue").get_json()
    assert revenue["seller_payout_cents"] == intact["seller_payout_cents"]
    assert revenue["connect_seller_payout_cents"] == intact["seller_payout_cents"]


def test_a_refund_that_also_returns_the_fee_is_netted_out_of_both_sides(
    webhook_app, fake_stripe, monkeypatch
):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    _seller, _item, order = paid_order(client, buyer, fake_stripe, quantity=2)
    before = admin.get("/admin/revenue").get_json()

    # Half the order refunded with "Refund application fee": Stripe returns
    # half the fee to the shop.
    refund = order["total_cents"] // 2
    fee_back = order["platform_fee_cents"] // 2
    monkeypatch.setattr(
        payments.stripe.ApplicationFee,
        "retrieve",
        lambda fee_id, **_kwargs: {"id": fee_id, "amount_refunded": fee_back},
    )
    event = charge_refunded_event(
        f"pi_test_{fake_stripe.last_session_id}", order["total_cents"], refund
    )
    event["data"]["object"]["application_fee"] = "fee_test_1"
    body, headers = signed_webhook(event)
    assert client.post("/stripe/webhook", data=body, headers=headers).status_code == 200

    row = buyer.get(f"/orders/{order['id']}").get_json()
    assert row["platform_fee_refunded_cents"] == fee_back
    expected_payout = (order["total_cents"] - refund) - (order["platform_fee_cents"] - fee_back)
    assert row["seller_payout_cents"] == expected_payout

    after = admin.get("/admin/revenue").get_json()
    assert after["platform_fee_cents"] == before["platform_fee_cents"] - fee_back
    assert after["connect_seller_payout_cents"] == (
        before["connect_seller_payout_cents"] - order["seller_payout_cents"] + expected_payout
    )


@pytest.mark.parametrize("fee_returned_share", [1.0, 0.5])
def test_an_admin_refund_records_the_fee_stripe_actually_returned(
    webhook_app, fake_stripe, monkeypatch, fee_returned_share
):
    """After an earlier partial refund that kept the fee, only part comes back."""
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    _seller, _item, order = paid_order(client, buyer, fake_stripe, quantity=2)
    fee_back = int(order["platform_fee_cents"] * fee_returned_share)
    refunds = []

    monkeypatch.setattr(
        payments.stripe.Refund,
        "create",
        lambda **params: refunds.append(params) or {"id": "re_test_1", "charge": "ch_test_1"},
    )
    monkeypatch.setattr(
        payments.stripe.Charge,
        "retrieve",
        lambda charge_id, **_kwargs: {
            "id": charge_id,
            "application_fee": {"id": "fee_test_1", "amount_refunded": fee_back},
        },
    )
    refunded = admin.post(f"/admin/orders/{order['id']}/refund").get_json()
    assert refunds[-1]["refund_application_fee"] is True
    assert refunded["payment_status"] == "refunded"
    assert refunded["platform_fee_refunded_cents"] == fee_back


def test_an_admin_refund_leaves_the_fee_to_the_webhook_if_stripe_cannot_say(
    webhook_app, fake_stripe, stub_refunds
):
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    _seller, _item, order = paid_order(client, buyer, fake_stripe)
    refunded = admin.post(f"/admin/orders/{order['id']}/refund")
    assert refunded.status_code == 200
    assert refunded.get_json()["platform_fee_refunded_cents"] == 0


def test_a_refund_event_records_the_real_amount_on_an_order_already_refunded(
    webhook_app, fake_stripe
):
    """The old handler marked partial refunds "refunded" without an amount."""
    client = webhook_app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    _seller, _item, order = paid_order(client, buyer, fake_stripe)
    with webhook_app.app_context():
        row = db.session.get(Order, order["id"])
        row.payment_status = "refunded"
        row.refunded_cents = 0
        db.session.commit()

    body, headers = signed_webhook(
        charge_refunded_event(f"pi_test_{fake_stripe.last_session_id}", order["total_cents"], 100)
    )
    client.post("/stripe/webhook", data=body, headers=headers)
    after = buyer.get(f"/orders/{order['id']}").get_json()
    assert after["refunded_cents"] == 100
    assert after["payment_status"] == "refunded"


def test_upgrading_does_not_guess_the_amount_of_an_old_refund(app, client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()

    with app.app_context():
        db.session.get(Order, order["id"]).payment_status = "refunded"
        db.session.commit()
        # Back to the previous release's schema, then boot-migrate again.
        with db.engine.begin() as connection:
            for column in ("refunded_cents", "platform_fee_refunded_cents"):
                connection.execute(text(f'ALTER TABLE "order" DROP COLUMN {column}'))
        db.session.remove()
        run_migrations()
        db.session.remove()
        row = db.session.get(Order, order["id"])
        assert row.payment_status == "refunded"
        assert row.refunded_cents == 0


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


# --- Seller stock edits while checkouts hold units -----------------------------


def seller_row(seller, seller_id, candy_id):
    rows = seller.get(f"/sellers/{seller_id}/inventory").get_json()
    return next(row for row in rows if row["candy_id"] == candy_id)


def let_the_sweep_release(app, client, order_id):
    with app.app_context():
        row = db.session.get(Order, order_id)
        row.checkout_started_at = utcnow() - timedelta(hours=2)
        db.session.commit()
    client.get("/shops")


def test_the_dashboard_shows_units_held_by_open_checkouts(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    kiki_seller.put(f"/sellers/{seller_id}/inventory/{candy_id}", json={"on_hand_count": 10})

    place_order(buyer, seller_id, candy_id, quantity=3)

    row = seller_row(kiki_seller, seller_id, candy_id)
    assert row["inventory_count"] == 7
    assert row["reserved_count"] == 3
    assert row["on_hand_count"] == 10


def test_a_shelf_count_typed_during_a_checkout_is_not_inflated_when_it_is_abandoned(
    app, client, buyer, kiki_seller, fake_stripe
):
    """10 on the shelf, 3 held. The seller counts 10; the release must not make 13."""
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    url = f"/sellers/{seller_id}/inventory/{candy_id}"
    kiki_seller.put(url, json={"on_hand_count": 10})
    order = place_order(buyer, seller_id, candy_id, quantity=3).get_json()

    saved = kiki_seller.put(url, json={"on_hand_count": 10}).get_json()
    assert saved["inventory_count"] == 7
    assert saved["on_hand_count"] == 10

    let_the_sweep_release(app, client, order["id"])
    assert inventory_count(client, seller_id, candy_id) == 10


def test_resaving_the_shelf_count_does_not_wipe_a_reservation(client, buyer, kiki_seller, fake_stripe):
    """The seller's screen predates the checkout; saving it must keep the 3 sold."""
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    url = f"/sellers/{seller_id}/inventory/{candy_id}"
    kiki_seller.put(url, json={"on_hand_count": 10})
    on_screen = seller_row(kiki_seller, seller_id, candy_id)["on_hand_count"]

    order = place_order(buyer, seller_id, candy_id, quantity=3).get_json()
    kiki_seller.put(url, json={"on_hand_count": on_screen})
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    assert buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()["payment_status"] == "paid"

    assert inventory_count(client, seller_id, candy_id) == 7


def test_a_shelf_count_below_the_held_units_leaves_nothing_for_sale(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    url = f"/sellers/{seller_id}/inventory/{candy_id}"
    kiki_seller.put(url, json={"on_hand_count": 10})
    place_order(buyer, seller_id, candy_id, quantity=3)

    row = kiki_seller.put(url, json={"on_hand_count": 2}).get_json()
    assert row["inventory_count"] == 0
    assert row["status"] == "out-of-stock"


def test_on_hand_count_wins_over_the_legacy_field(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    url = f"/sellers/{seller_id}/inventory/{candy_id}"
    kiki_seller.put(url, json={"on_hand_count": 10})
    place_order(buyer, seller_id, candy_id, quantity=3)

    row = kiki_seller.put(url, json={"on_hand_count": 10, "inventory_count": 10}).get_json()
    assert row["inventory_count"] == 7
    # On its own the legacy field still sets the sellable count directly.
    assert kiki_seller.put(url, json={"inventory_count": 4}).get_json()["inventory_count"] == 4


def test_editing_an_own_item_takes_the_shelf_count(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    created = kiki_seller.post(
        f"/sellers/{seller_id}/items",
        json={"name": "Shelf Test Taffy", "price_cents": 150, "inventory_count": 10},
    ).get_json()
    candy_id = created["candy_id"]
    assert created["on_hand_count"] == 10
    place_order(buyer, seller_id, candy_id, quantity=3)

    row = kiki_seller.put(
        f"/sellers/{seller_id}/items/{candy_id}",
        json={"name": "Shelf Test Taffy", "price_cents": 150, "on_hand_count": 10},
    ).get_json()
    assert row["inventory_count"] == 7
    assert row["reserved_count"] == 3


@pytest.mark.parametrize("count", [-1, 1.5, "ten", True])
def test_a_malformed_on_hand_count_is_a_400(client, kiki_seller, count):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{item['candy_id']}", json={"on_hand_count": count}
    )
    assert response.status_code == 400


@postgres_only
def test_a_stock_edit_waits_for_a_reservation_that_is_committing(
    app, client, buyer, kiki_seller, fake_stripe
):
    """A checkout holds the row lock; the seller's save must see its result."""
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    url = f"/sellers/{seller_id}/inventory/{candy_id}"
    kiki_seller.put(url, json={"on_hand_count": 10})

    order_id = place_order(buyer, seller_id, candy_id, quantity=3).get_json()["id"]
    let_the_sweep_release(app, client, order_id)

    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    locked = threading.Event()

    def checkout_in_flight():
        # Stands in for create_order between its lock and its commit.
        with engine.begin() as connection:
            connection.execute(
                text(
                    "SELECT 1 FROM seller_inventory WHERE seller_id = :s AND candy_id = :c FOR UPDATE"
                ),
                {"s": seller_id, "c": candy_id},
            )
            locked.set()
            time.sleep(0.5)
            connection.execute(
                text(
                    "UPDATE seller_inventory SET inventory_count = inventory_count - 3 "
                    "WHERE seller_id = :s AND candy_id = :c"
                ),
                {"s": seller_id, "c": candy_id},
            )
            connection.execute(
                text(
                    "UPDATE \"order\" SET payment_status = 'pending', inventory_released_at = NULL, "
                    "checkout_started_at = now() AT TIME ZONE 'utc' WHERE id = :o"
                ),
                {"o": order_id},
            )

    worker = threading.Thread(target=checkout_in_flight)
    worker.start()
    locked.wait(5)
    saved = kiki_seller.put(url, json={"on_hand_count": 10}).get_json()
    worker.join(10)
    engine.dispose()

    assert saved["reserved_count"] == 3
    assert saved["inventory_count"] == 7
    assert inventory_count(client, seller_id, candy_id) == 7


# --- A payment that lands after its stock was resold ----------------------------


def test_a_late_payment_for_resold_stock_is_flagged_as_short(app, client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    kiki_seller.put(f"/sellers/{seller_id}/inventory/{candy_id}", json={"on_hand_count": 3})
    order = place_order(buyer, seller_id, candy_id, quantity=3).get_json()
    late_session = fake_stripe.last_session_id

    let_the_sweep_release(app, client, order["id"])
    # The released units go to a second buyer, then the first one pays.
    place_order(buyer, seller_id, candy_id, quantity=2)
    fake_stripe.mark_paid(late_session)
    paid = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()

    assert paid["payment_status"] == "paid"
    assert paid["stock_shortfall"] == 2
    assert inventory_count(client, seller_id, candy_id) == 0
    queue = kiki_seller.get(f"/sellers/{seller_id}/orders").get_json()
    assert next(row for row in queue if row["id"] == order["id"])["stock_shortfall"] == 2


def test_a_late_payment_with_stock_still_on_the_shelf_is_not_flagged(
    app, client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    candy_id = first_in_stock_item(client, seller_id)["candy_id"]
    kiki_seller.put(f"/sellers/{seller_id}/inventory/{candy_id}", json={"on_hand_count": 5})
    order = place_order(buyer, seller_id, candy_id, quantity=3).get_json()
    let_the_sweep_release(app, client, order["id"])
    fake_stripe.mark_paid(fake_stripe.last_session_id)

    paid = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert paid["stock_shortfall"] == 0
    assert inventory_count(client, seller_id, candy_id) == 2
