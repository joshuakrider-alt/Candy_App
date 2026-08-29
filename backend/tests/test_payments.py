import hashlib
import hmac
import json
import time

import pytest
from conftest import BUYER_PASSWORD, login
from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app import seller_inventory_lock_query
from migrations import USER_ROLE_CONSTRAINT, _ensure_user_role_check_constraint
from models import db

WEBHOOK_SECRET = "whsec_test_secret"


def first_in_stock_item(client, seller_id):
    storefront = client.get(f"/sellers/{seller_id}/storefront").get_json()
    return storefront["items"][0]


def place_order(buyer, seller_id, candy_id, quantity=1):
    return buyer.post(
        "/orders",
        json={"seller_id": seller_id, "items": [{"candy_id": candy_id, "quantity": quantity}]},
    )


def inventory_count(client, seller_id, candy_id):
    items = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    row = next((item for item in items if item["candy_id"] == candy_id), None)
    # Sold-out items drop off the storefront entirely.
    return row["inventory_count"] if row else 0


def user_role_constraint_exists():
    return (
        db.session.execute(
            text(
                "SELECT 1 FROM pg_constraint constraint_row "
                "JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid "
                "WHERE constraint_row.conname = :name AND table_row.relname = 'user'"
            ),
            {"name": USER_ROLE_CONSTRAINT},
        ).first()
        is not None
    )


def signed_webhook(payload, secret=WEBHOOK_SECRET):
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{body.decode()}".encode(), hashlib.sha256
    ).hexdigest()
    return body, {
        "Stripe-Signature": f"t={timestamp},v1={signature}",
        "Content-Type": "application/json",
    }


def checkout_completed_event(session_id, order_id, seller_id, payment_status="paid"):
    return {
        "id": "evt_test_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "status": "complete",
                "payment_status": payment_status,
                "payment_intent": "pi_test_webhook",
                "client_reference_id": str(order_id),
                "metadata": {"order_id": str(order_id), "seller_id": str(seller_id)},
            }
        },
    }


def test_config_exposes_the_publishable_key_but_no_secret(client):
    body = client.get("/config").get_json()
    assert body["stripe_enabled"] is True
    assert body["stripe_mode"] == "test"
    assert body["stripe_publishable_key"].startswith("pk_test_")
    assert body["platform_fee_percent"] == 10
    assert "secret" not in json.dumps(body).lower()


def test_placing_an_order_requires_a_login(client, kiki_seller):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    response = client.post(
        "/orders",
        json={
            "seller_id": kiki_seller.user["seller_id"],
            "items": [{"candy_id": item["candy_id"], "quantity": 1}],
        },
    )
    assert response.status_code == 401


def test_order_creation_fails_clearly_without_stripe_keys(make_app):
    app = make_app(STRIPE_SECRET_KEY="", STRIPE_PUBLISHABLE_KEY="")
    client = app.test_client()
    assert client.get("/config").get_json()["stripe_enabled"] is False

    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    sellers = client.get("/sellers").get_json()
    item = first_in_stock_item(client, sellers[0]["id"])
    before = item["inventory_count"]

    response = place_order(buyer, sellers[0]["id"], item["candy_id"])
    assert response.status_code == 503
    assert "STRIPE_SECRET_KEY" in response.get_json()["error"]

    # Nothing was reserved, so the shelf is untouched.
    after = client.get(f"/sellers/{sellers[0]['id']}/storefront").get_json()["items"]
    assert next(row for row in after if row["candy_id"] == item["candy_id"])[
        "inventory_count"
    ] == before


def test_full_paid_pickup_flow(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    starting_count = item["inventory_count"]

    created = place_order(buyer, seller_id, item["candy_id"], quantity=2)
    assert created.status_code == 201, created.get_json()
    order = created.get_json()

    assert order["payment_status"] == "pending"
    assert order["checkout_url"].startswith("https://checkout.stripe.test/")
    assert order["total_cents"] == item["candy"]["price_cents"] * 2
    assert order["platform_fee_cents"] == round(order["total_cents"] * 0.10)
    assert order["seller_payout_cents"] == order["total_cents"] - order["platform_fee_cents"]
    # The pickup code is not handed out until the money arrives.
    assert order["pickup_code"] is None

    # Stock is reserved while the buyer is on Stripe's page.
    reserved = first_in_stock_item(client, seller_id)
    assert reserved["candy_id"] == item["candy_id"]
    assert reserved["inventory_count"] == starting_count - 2

    # An unpaid order is invisible to the seller and cannot be advanced.
    assert kiki_seller.get(f"/sellers/{seller_id}/orders").get_json() == []
    blocked = kiki_seller.put(f"/orders/{order['id']}/status", json={"status": "packing"})
    assert blocked.status_code == 400
    assert "not been paid" in blocked.get_json()["error"]

    fake_stripe.mark_paid(fake_stripe.last_session_id)
    confirmed = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert confirmed["payment_status"] == "paid"
    assert confirmed["pickup_code"].startswith("CL-")
    assert confirmed["paid_at"] is not None

    queue = kiki_seller.get(f"/sellers/{seller_id}/orders").get_json()
    assert [row["id"] for row in queue] == [order["id"]]
    assert queue[0]["buyer_name"] == "Alice Carter"
    assert queue[0]["pickup_code"] == confirmed["pickup_code"]

    for status in ("packing", "ready", "completed"):
        response = kiki_seller.put(f"/orders/{order['id']}/status", json={"status": status})
        assert response.status_code == 200
        assert response.get_json()["status"] == status

    assert kiki_seller.get(f"/sellers/{seller_id}/orders").get_json() == []


def test_checkout_session_carries_order_metadata_and_return_urls(
    client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()

    params = fake_stripe.created_sessions[-1]
    assert params["mode"] == "payment"
    assert params["api_key"].startswith("sk_test_")
    assert params["client_reference_id"] == str(order["id"])
    assert params["customer_email"] == "alice@example.com"
    assert params["metadata"]["order_id"] == str(order["id"])
    assert params["metadata"]["platform_fee_cents"] == str(order["platform_fee_cents"])
    assert params["line_items"][0]["price_data"]["unit_amount"] == item["candy"]["price_cents"]
    assert params["success_url"] == (
        "https://www.neighborhoodcandylady.com/buyer.html"
        f"?order={order['id']}&session_id={{CHECKOUT_SESSION_ID}}"
    )
    assert params["cancel_url"].endswith(f"?order={order['id']}&payment=cancelled")
    assert params["expires_at"] > time.time() + 29 * 60


def test_checkout_returns_to_an_allowed_origin(make_app, fake_stripe):
    app = make_app(CORS_ORIGIN_LIST=["http://localhost:5500"])
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])

    response = client.post(
        "/orders",
        json={"seller_id": seller["id"], "items": [{"candy_id": item["candy_id"], "quantity": 1}]},
        headers={**buyer.headers, "Origin": "http://localhost:5500"},
    )
    assert response.status_code == 201
    assert fake_stripe.created_sessions[-1]["success_url"].startswith(
        "http://localhost:5500/buyer.html"
    )


def test_a_spoofed_origin_is_ignored(client, buyer, kiki_seller, fake_stripe):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    response = client.post(
        "/orders",
        json={
            "seller_id": kiki_seller.user["seller_id"],
            "items": [{"candy_id": item["candy_id"], "quantity": 1}],
        },
        headers={**buyer.headers, "Origin": "https://evil.example.com"},
    )
    assert response.status_code == 201
    assert fake_stripe.created_sessions[-1]["success_url"].startswith(
        "https://www.neighborhoodcandylady.com/"
    )


def test_confirm_does_not_pay_an_order_stripe_says_is_unpaid(
    client, buyer, kiki_seller, fake_stripe
):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()

    confirmed = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert confirmed["payment_status"] == "pending"
    assert confirmed["pickup_code"] is None


def test_expired_checkout_puts_the_stock_back(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    starting_count = item["inventory_count"]
    order = place_order(buyer, seller_id, item["candy_id"], quantity=3).get_json()

    fake_stripe.mark_expired(fake_stripe.last_session_id)
    confirmed = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert confirmed["payment_status"] == "expired"

    restored = first_in_stock_item(client, seller_id)
    assert restored["inventory_count"] == starting_count


def test_cancelling_an_unpaid_order_puts_the_stock_back(client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    starting_count = item["inventory_count"]
    order = place_order(buyer, seller_id, item["candy_id"], quantity=2).get_json()

    assert buyer.post(f"/orders/{order['id']}/cancel").get_json()["payment_status"] == "expired"
    assert first_in_stock_item(client, seller_id)["inventory_count"] == starting_count


def test_resume_checkout_reuses_an_open_session(client, buyer, kiki_seller, fake_stripe):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()

    resumed = buyer.post(f"/orders/{order['id']}/checkout")
    assert resumed.status_code == 200
    assert resumed.get_json()["checkout_url"] == order["checkout_url"]
    assert len(fake_stripe.created_sessions) == 1


def test_webhook_is_rejected_without_a_configured_secret(client, buyer, kiki_seller, fake_stripe):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()

    body, headers = signed_webhook(
        checkout_completed_event(
            fake_stripe.last_session_id, order["id"], kiki_seller.user["seller_id"]
        )
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.status_code == 503

    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"


def test_webhook_marks_the_order_paid(make_app, fake_stripe):
    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    body, headers = signed_webhook(
        checkout_completed_event(fake_stripe.last_session_id, order["id"], seller["id"])
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.status_code == 200
    assert response.get_json() == {"received": True, "handled": True}

    paid = buyer.get(f"/orders/{order['id']}").get_json()
    assert paid["payment_status"] == "paid"
    assert paid["pickup_code"].startswith("CL-")


def test_webhook_matches_a_refund_by_payment_intent(make_app, fake_stripe):
    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    session_id = fake_stripe.last_session_id
    fake_stripe.mark_paid(session_id)
    buyer.post(f"/orders/{order['id']}/payment/confirm")

    # A charge event carries no order metadata, only the payment intent.
    body, headers = signed_webhook(
        {
            "id": "evt_test_refund",
            "type": "charge.refunded",
            "data": {
                "object": {
                    "id": "ch_test_1",
                    "object": "charge",
                    "payment_intent": f"pi_test_{session_id}",
                }
            },
        }
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.get_json() == {"received": True, "handled": True}
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "refunded"


def test_webhook_rejects_a_bad_signature(make_app, fake_stripe):
    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = client.get("/sellers").get_json()[0]
    item = first_in_stock_item(client, seller["id"])
    order = place_order(buyer, seller["id"], item["candy_id"]).get_json()

    body, headers = signed_webhook(
        checkout_completed_event(fake_stripe.last_session_id, order["id"], seller["id"]),
        secret="whsec_wrong_secret",
    )
    assert client.post("/stripe/webhook", data=body, headers=headers).status_code == 400
    assert buyer.get(f"/orders/{order['id']}").get_json()["payment_status"] == "pending"


def test_buyers_cannot_read_each_others_orders(client, buyer, kiki_seller, fake_stripe):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()

    bob = login(client, "bob@example.com", BUYER_PASSWORD)
    assert bob.get(f"/orders/{order['id']}").status_code == 403
    assert buyer.get(f"/orders/{order['id']}").status_code == 200


def test_a_seller_cannot_touch_another_shops_order(
    client, buyer, kiki_seller, northview_seller, fake_stripe
):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    buyer.post(f"/orders/{order['id']}/payment/confirm")

    assert northview_seller.get(f"/orders/{order['id']}").status_code == 403
    assert (
        northview_seller.put(f"/orders/{order['id']}/status", json={"status": "packing"}).status_code
        == 403
    )


def test_orders_are_blocked_for_unapproved_shops_and_missing_stock(
    client, buyer, admin, kiki_seller, fake_stripe
):
    pending = next(
        seller
        for seller in admin.get("/applications?status=pending").get_json()
        if seller["status"] == "pending"
    )
    catalog_id = client.get("/candies").get_json()[0]["id"]
    unapproved = place_order(buyer, pending["id"], catalog_id)
    assert unapproved.status_code == 400
    assert "approved sellers" in unapproved.get_json()["error"]

    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    too_many = place_order(
        buyer, kiki_seller.user["seller_id"], item["candy_id"], quantity=item["inventory_count"] + 1
    )
    assert too_many.status_code == 400
    assert "insufficient inventory" in too_many.get_json()["error"]


@pytest.mark.parametrize(
    "percent,flat,quantity,expected_fee",
    [(10, 0, 1, 25), (0, 50, 1, 50), (15, 25, 2, 100), (0, 0, 1, 0)],
)
def test_platform_fee_is_recorded_on_the_order(
    make_app, fake_stripe, percent, flat, quantity, expected_fee
):
    app = make_app(PLATFORM_FEE_PERCENT=percent, PLATFORM_FEE_FLAT_CENTS=flat)
    client = app.test_client()
    buyer = login(client, "alice@example.com", BUYER_PASSWORD)
    seller = next(
        row for row in client.get("/sellers").get_json() if row["shop_name"].startswith("Ms. Kiki")
    )
    gummies = next(
        item
        for item in client.get(f"/sellers/{seller['id']}/storefront").get_json()["items"]
        if item["candy"]["name"] == "Sour Gummy Mix"
    )
    assert gummies["candy"]["price_cents"] == 250

    order = place_order(buyer, seller["id"], gummies["candy_id"], quantity=quantity).get_json()
    assert order["total_cents"] == 250 * quantity
    assert order["platform_fee_cents"] == expected_fee
    assert order["seller_payout_cents"] == order["total_cents"] - expected_fee


def test_admin_revenue_counts_only_paid_orders(client, buyer, admin, kiki_seller, fake_stripe):
    empty = admin.get("/admin/revenue").get_json()
    assert empty == {
        "paid_order_count": 0,
        "gross_cents": 0,
        "platform_fee_cents": 0,
        "seller_payout_cents": 0,
        "platform_fee_percent": 10.0,
        "platform_fee_flat_cents": 0,
    }

    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"], quantity=2).get_json()
    assert admin.get("/admin/revenue").get_json()["paid_order_count"] == 0

    fake_stripe.mark_paid(fake_stripe.last_session_id)
    buyer.post(f"/orders/{order['id']}/payment/confirm")

    revenue = admin.get("/admin/revenue").get_json()
    assert revenue["paid_order_count"] == 1
    assert revenue["gross_cents"] == order["total_cents"]
    assert revenue["platform_fee_cents"] == order["platform_fee_cents"]
    assert revenue["seller_payout_cents"] == order["seller_payout_cents"]


def test_buyer_order_history_hides_codes_until_paid(client, buyer, kiki_seller, fake_stripe):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    order = place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).get_json()

    history = buyer.get("/me/orders").get_json()
    assert history[0]["id"] == order["id"]
    assert history[0]["pickup_code"] is None

    fake_stripe.mark_paid(fake_stripe.last_session_id)
    buyer.post(f"/orders/{order['id']}/payment/confirm")
    assert buyer.get("/me/orders").get_json()[0]["pickup_code"].startswith("CL-")


def test_repeated_cart_lines_are_merged_into_one_reservation(
    client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    starting_count = item["inventory_count"]

    created = buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "items": [
                {"candy_id": item["candy_id"], "quantity": 2},
                {"candy_id": item["candy_id"], "quantity": 1},
            ],
        },
    )
    assert created.status_code == 201, created.get_json()
    order = created.get_json()

    assert [(line["candy_id"], line["quantity"]) for line in order["items"]] == [
        (item["candy_id"], 3)
    ]
    assert order["total_cents"] == item["candy"]["price_cents"] * 3
    assert inventory_count(client, seller_id, item["candy_id"]) == starting_count - 3


def test_merged_cart_lines_are_checked_against_stock_as_one_total(
    client, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{item['candy_id']}",
        json={"inventory_count": 3, "status": "low-stock"},
    )

    # Each line fits on its own, but together they ask for more than is left.
    response = buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "items": [
                {"candy_id": item["candy_id"], "quantity": 2},
                {"candy_id": item["candy_id"], "quantity": 2},
            ],
        },
    )
    assert response.status_code == 400
    assert "insufficient inventory" in response.get_json()["error"]

    assert inventory_count(client, seller_id, item["candy_id"]) == 3
    assert fake_stripe.created_sessions == []


def test_checkout_locks_inventory_rows_in_candy_id_order(app):
    """The lock is what stops two simultaneous checkouts from overselling."""
    with app.app_context():
        statement = seller_inventory_lock_query(4, [9, 2, 5]).statement
        sql = str(
            statement.compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
            )
        )

    assert "FOR UPDATE" in sql
    assert "ORDER BY seller_inventory.candy_id ASC" in sql
    # Sorted ids keep two overlapping carts from deadlocking on each other.
    assert "IN (2, 5, 9)" in sql


def test_the_lock_is_dropped_on_sqlite_and_checkout_still_works(
    app, client, buyer, kiki_seller, fake_stripe
):
    item = first_in_stock_item(client, kiki_seller.user["seller_id"])
    with app.app_context():
        if db.engine.dialect.name != "sqlite":
            pytest.skip("this checks the SQLite no-op path")
        sql = str(seller_inventory_lock_query(1, [item["candy_id"]]).statement.compile(db.engine))

    assert "FOR UPDATE" not in sql
    assert place_order(buyer, kiki_seller.user["seller_id"], item["candy_id"]).status_code == 201


def test_user_role_check_constraint_is_a_no_op_off_postgres(app):
    with app.app_context():
        if db.engine.dialect.name == "postgresql":
            pytest.skip("Postgres is covered by the backfill test")
        # SQLite cannot add a constraint to an existing table, and the model
        # already declares it for databases created from scratch.
        assert _ensure_user_role_check_constraint({"user"}) is False


def test_user_role_check_constraint_is_backfilled_on_postgres(app):
    with app.app_context():
        if db.engine.dialect.name != "postgresql":
            pytest.skip("requires TEST_DATABASE_URL to point at Postgres")

        # Stand in for the production table, which was created before the
        # model declared the constraint.
        db.session.execute(
            text(f'ALTER TABLE "user" DROP CONSTRAINT IF EXISTS {USER_ROLE_CONSTRAINT}')
        )
        db.session.commit()
        assert user_role_constraint_exists() is False

        assert _ensure_user_role_check_constraint({"user"}) is True
        assert user_role_constraint_exists() is True

        # Running it again on an already-constrained table changes nothing.
        assert _ensure_user_role_check_constraint({"user"}) is False
        assert user_role_constraint_exists() is True

        with pytest.raises(IntegrityError):
            db.session.execute(
                text(
                    'INSERT INTO "user" (name, email, role, created_at) '
                    "VALUES ('Mallory', 'mallory@example.com', 'superuser', CURRENT_TIMESTAMP)"
                )
            )
        db.session.rollback()
