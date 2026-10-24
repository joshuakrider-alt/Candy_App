"""The private pickup address and door note.

A shop's street address is where a person lives, and buyers here include
children. It goes to the shop's owner, an admin, and buyers holding a paid
order for that shop, and to nobody else: not the public shop pages, not the
public API, and not a buyer whose checkout was abandoned or refunded.
"""

import sqlite3

import pytest
from conftest import SELLER_PASSWORD, login
from sqlalchemy import inspect

from app import create_app
from models import PICKUP_ADDRESS_MAX_LENGTH, PICKUP_NOTE_MAX_LENGTH, Order, db
from test_migrations import LEGACY_ROWS, LEGACY_SCHEMA
from test_payments import first_in_stock_item, place_order

# Seeded on Ms. Kiki's Snack Spot only (see seed.py).
KIKI_ADDRESS = "100 Example Ave, Cherry Hill"
KIKI_NOTE = "Ring the side door"


def kiki_id(client):
    return next(
        seller["id"]
        for seller in client.get("/sellers").get_json()
        if seller["shop_name"] == "Ms. Kiki's Snack Spot"
    )


def unpaid_order(client, buyer, seller_id):
    item = first_in_stock_item(client, seller_id)
    response = place_order(buyer, seller_id, item["candy_id"])
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def paid_order(client, buyer, fake_stripe, seller_id):
    order = unpaid_order(client, buyer, seller_id)
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    confirmed = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert confirmed["payment_status"] == "paid"
    return confirmed


# --- Who sees it ---------------------------------------------------------------


def test_unpaid_order_shows_only_the_neighborhood(client, buyer, fake_stripe):
    order = unpaid_order(client, buyer, kiki_id(client))
    assert order["pickup"] is None
    assert order["seller"]["neighborhood"] == "Cherry Hill"
    assert "pickup_address" not in order["seller"]
    assert buyer.get(f"/orders/{order['id']}").get_json()["pickup"] is None
    assert buyer.get("/me/orders").get_json()[0]["pickup"] is None


def test_paid_order_shows_the_address_on_every_buyer_route(client, buyer, fake_stripe):
    order = paid_order(client, buyer, fake_stripe, kiki_id(client))
    expected = {"address": KIKI_ADDRESS, "note": KIKI_NOTE}
    # The checkout return page reads the confirm response...
    assert order["pickup"] == expected
    # ...the receipt reads the single order...
    assert buyer.get(f"/orders/{order['id']}").get_json()["pickup"] == expected
    # ...and the order cards read the list.
    assert buyer.get("/me/orders").get_json()[0]["pickup"] == expected
    # The shop object inside the order stays the public one.
    assert "pickup_address" not in order["seller"]


def test_another_buyer_cannot_read_someone_elses_paid_order(client, buyer, fake_stripe):
    order = paid_order(client, buyer, fake_stripe, kiki_id(client))
    bob = login(client, "bob@example.com", "buyer-password-1")
    response = bob.get(f"/orders/{order['id']}")
    assert response.status_code == 403
    assert KIKI_ADDRESS not in response.get_data(as_text=True)
    assert all(row["pickup"] is None for row in bob.get("/me/orders").get_json())


def test_a_refunded_order_stops_showing_the_address(app, client, buyer, fake_stripe):
    order = paid_order(client, buyer, fake_stripe, kiki_id(client))
    with app.app_context():
        Order.query.get(order["id"]).payment_status = "refunded"
        db.session.commit()
    assert buyer.get(f"/orders/{order['id']}").get_json()["pickup"] is None


def test_an_expired_checkout_never_shows_the_address(app, client, buyer, fake_stripe):
    order = unpaid_order(client, buyer, kiki_id(client))
    assert buyer.post(f"/orders/{order['id']}/cancel").get_json()["pickup"] is None
    assert buyer.get(f"/orders/{order['id']}").get_json()["pickup"] is None


def test_a_shop_without_an_address_gives_none_even_when_paid(client, buyer, fake_stripe):
    northview = next(
        seller["id"]
        for seller in client.get("/sellers").get_json()
        if seller["shop_name"] == "Northview Snack Stop"
    )
    assert paid_order(client, buyer, fake_stripe, northview)["pickup"] is None


@pytest.mark.parametrize(
    "path",
    ["/sellers", "/shops", "/shops/ms-kikis-snack-spot", "/sellers/{id}/storefront"],
)
def test_public_routes_never_include_the_address(client, path):
    response = client.get(path.format(id=kiki_id(client)))
    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert KIKI_ADDRESS not in body
    assert KIKI_NOTE not in body
    assert "pickup_address" not in body
    assert "pickup_note" not in body


def test_owner_and_admin_see_it_on_the_shop(client, kiki_seller, admin):
    seller = kiki_seller.get("/me").get_json()["seller"]
    assert seller["pickup_address"] == KIKI_ADDRESS
    assert seller["pickup_note"] == KIKI_NOTE
    applications = admin.get("/applications").get_json()
    kiki = next(row for row in applications if row["id"] == seller["id"])
    assert kiki["pickup_address"] == KIKI_ADDRESS


# --- Editing it ----------------------------------------------------------------


def test_seller_edits_pickup_details(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    response = kiki_seller.put(
        f"/sellers/{seller_id}/pickup",
        json={"pickup_address": "  12 Elm St\r\n\r\n  Apt 2  ", "pickup_note": "Knock twice"},
    )
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["pickup_address"] == "12 Elm St\nApt 2"
    assert body["pickup_note"] == "Knock twice"

    # Partial: leaving the address out keeps it; "" clears the note.
    body = kiki_seller.put(f"/sellers/{seller_id}/pickup", json={"pickup_note": ""}).get_json()
    assert body["pickup_address"] == "12 Elm St\nApt 2"
    assert body["pickup_note"] is None


def test_only_the_owner_or_an_admin_can_edit_pickup_details(
    client, kiki_seller, northview_seller, buyer, admin
):
    seller_id = kiki_seller.user["seller_id"]
    payload = {"pickup_address": "1 Fake St"}
    assert northview_seller.put(f"/sellers/{seller_id}/pickup", json=payload).status_code == 403
    assert buyer.put(f"/sellers/{seller_id}/pickup", json=payload).status_code == 403
    assert client.put(f"/sellers/{seller_id}/pickup", json=payload).status_code == 401
    assert admin.put(f"/sellers/{seller_id}/pickup", json=payload).status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"pickup_address": "x" * (PICKUP_ADDRESS_MAX_LENGTH + 1)},
        {"pickup_note": "x" * (PICKUP_NOTE_MAX_LENGTH + 1)},
        {"pickup_address": 12},
        {"pickup_note": ["side door"]},
        {"pickup_address": "12 Elm\x00St"},
    ],
)
def test_bad_pickup_details_are_a_400(kiki_seller, payload):
    seller_id = kiki_seller.user["seller_id"]
    response = kiki_seller.put(f"/sellers/{seller_id}/pickup", json=payload)
    assert response.status_code == 400
    # Nothing was half-saved.
    assert kiki_seller.get("/me").get_json()["seller"]["pickup_address"] == KIKI_ADDRESS


def test_application_takes_pickup_details_and_still_works_without_them(client):
    application = {
        "shop_name": "Westside Sweets",
        "contact_name": "Dee Park",
        "neighborhood": "Westside",
        "pickup_window": "Weekends",
        "password": SELLER_PASSWORD,
    }
    with_address = client.post(
        "/applications",
        json=dict(
            application,
            email="dee@example.com",
            pickup_address="9 Oak Rd",
            pickup_note="Blue gate",
        ),
    )
    assert with_address.status_code == 201, with_address.get_json()
    seller = with_address.get_json()["seller"]
    assert seller["pickup_address"] == "9 Oak Rd"
    assert seller["pickup_note"] == "Blue gate"

    # An older client that never sends them can still apply.
    without = client.post(
        "/applications", json=dict(application, shop_name="West 2", email="dee2@example.com")
    )
    assert without.status_code == 201
    assert without.get_json()["seller"]["pickup_address"] is None

    too_long = client.post(
        "/applications",
        json=dict(
            application,
            shop_name="West 3",
            email="dee3@example.com",
            pickup_address="x" * (PICKUP_ADDRESS_MAX_LENGTH + 1),
        ),
    )
    assert too_long.status_code == 400


# --- Existing databases ----------------------------------------------------------


def test_existing_shops_gain_empty_pickup_columns(tmp_path, monkeypatch):
    for name in ("DATABASE_URL", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(LEGACY_SCHEMA)
    connection.executescript(LEGACY_ROWS)
    connection.commit()
    connection.close()
    app = create_app(
        {
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "TESTING": True,
            "JWT_SECRET_KEY": "test-jwt-secret",
            "STRIPE_SECRET_KEY": "sk_test_fake",
        }
    )
    with app.app_context():
        columns = {column["name"] for column in inspect(db.engine).get_columns("seller")}
        assert {"pickup_address", "pickup_note"} <= columns
        from models import Seller

        # Nobody's address is guessed.
        assert Seller.query.get(1).pickup_address is None
        # The legacy pay-at-pickup order has nothing to reveal yet.
        assert Order.query.get(7).pickup_dict() is None
