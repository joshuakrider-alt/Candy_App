"""DELETE /me: the in-app account deletion App Store 5.1.1(v) requires."""

from conftest import ADMIN_PASSWORD, BUYER_PASSWORD, SELLER_PASSWORD, login

from models import Order, Seller, User, db


def first_in_stock_item(client, seller_id):
    return client.get(f"/sellers/{seller_id}/storefront").get_json()["items"][0]


def inventory_count(client, seller_id, candy_id):
    items = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    row = next((item for item in items if item["candy_id"] == candy_id), None)
    return row["inventory_count"] if row else 0


def place_order(buyer, seller_id, candy_id, quantity=1):
    response = buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "items": [{"candy_id": candy_id, "quantity": quantity}],
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def pay(buyer, order, fake_stripe):
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    paid = buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()
    assert paid["payment_status"] == "paid"
    return paid


def test_deleting_an_account_needs_a_valid_token(client):
    assert client.delete("/me").status_code == 401
    assert (
        client.delete("/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code
        == 401
    )
    # Nothing happened: the account is still usable.
    login(client, "alice@example.com", BUYER_PASSWORD)


def test_a_buyer_can_delete_their_account_and_cannot_log_in_again(client, app, buyer):
    assert buyer.delete("/me").status_code == 204

    failed = client.post(
        "/login", json={"email": "alice@example.com", "password": BUYER_PASSWORD}
    )
    assert failed.status_code == 401

    # The token was minted before the row went away, and it stops working too.
    assert buyer.get("/me").status_code == 401

    with app.app_context():
        assert User.query.filter_by(email="alice@example.com").first() is None


def test_signing_up_again_with_the_deleted_email_works(client, buyer):
    assert buyer.delete("/me").status_code == 204

    response = client.post(
        "/signup",
        json={
            "name": "Alice Again",
            "email": "alice@example.com",
            "password": "a-brand-new-password",
        },
    )
    assert response.status_code == 201
    assert response.get_json()["user"]["role"] == "buyer"


def test_a_deleted_buyers_paid_order_stays_in_the_seller_queue(
    client, app, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"], quantity=2)
    paid = pay(buyer, order, fake_stripe)

    assert buyer.delete("/me").status_code == 204

    queue = kiki_seller.get(f"/sellers/{seller_id}/orders").get_json()
    assert [row["id"] for row in queue] == [order["id"]]
    row = queue[0]
    # Everything the seller needs to hand the bag over is still there.
    assert row["pickup_code"] == paid["pickup_code"]
    assert row["total_cents"] == order["total_cents"]
    assert row["seller_payout_cents"] == order["seller_payout_cents"]
    assert [line["quantity"] for line in row["items"]] == [2]
    # The buyer is not.
    assert row["user_id"] is None
    assert row["buyer_name"] == "Deleted account"

    advanced = kiki_seller.put(f"/orders/{order['id']}/status", json={"status": "ready"})
    assert advanced.status_code == 200

    with app.app_context():
        stored = Order.query.get(order["id"])
        assert stored.user_id is None
        assert stored.user is None
        assert stored.payment_status == "paid"
        assert stored.stripe_payment_intent_id


def test_deleting_an_account_releases_the_stock_it_was_holding(
    client, admin, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    starting_count = item["inventory_count"]
    order = place_order(buyer, seller_id, item["candy_id"], quantity=3)
    assert inventory_count(client, seller_id, item["candy_id"]) == starting_count - 3

    assert buyer.delete("/me").status_code == 204

    assert inventory_count(client, seller_id, item["candy_id"]) == starting_count
    abandoned = next(
        row for row in admin.get("/orders").get_json() if row["id"] == order["id"]
    )
    assert abandoned["payment_status"] == "expired"
    assert abandoned["user_id"] is None


def test_deleting_an_account_leaves_other_buyers_alone(
    client, app, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    bob = login(client, "bob@example.com", BUYER_PASSWORD)
    bobs_order = place_order(bob, seller_id, item["candy_id"])
    pay(bob, bobs_order, fake_stripe)

    assert buyer.delete("/me").status_code == 204

    assert [row["id"] for row in bob.get("/me/orders").get_json()] == [bobs_order["id"]]
    with app.app_context():
        assert User.query.filter_by(email="bob@example.com").first() is not None
        assert Order.query.get(bobs_order["id"]).user_id == bob.user["id"]


def test_an_admin_cannot_delete_its_own_account(client, admin):
    response = admin.delete("/me")
    assert response.status_code == 403
    assert "admin" in response.get_json()["error"]

    # Still there, still an admin.
    assert login(client, "admin@example.com", ADMIN_PASSWORD).user["role"] == "admin"


def test_a_wrong_password_confirmation_stops_the_deletion(client, buyer):
    refused = buyer.delete("/me", json={"password": "not-my-password"})
    assert refused.status_code == 401
    login(client, "alice@example.com", BUYER_PASSWORD)

    assert buyer.delete("/me", json={"password": BUYER_PASSWORD}).status_code == 204


def test_the_last_seller_login_leaving_delists_the_shop_but_keeps_its_orders(
    client, app, admin, buyer, kiki_seller, fake_stripe
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"])
    paid = pay(buyer, order, fake_stripe)

    assert kiki_seller.delete("/me").status_code == 204

    # Buyers can no longer order from a shop with nobody to pack the bags.
    assert seller_id not in [row["id"] for row in client.get("/sellers").get_json()]
    assert client.get(f"/sellers/{seller_id}/storefront").status_code == 404

    with app.app_context():
        assert User.query.filter_by(email="kiki@example.com").first() is None
        seller = Seller.query.get(seller_id)
        assert seller is not None
        assert seller.status == "pending"
        assert seller.contact_email is None
        # The shelf survives so the shop can be handed to a new owner.
        assert seller.inventory_items

    # The buyer who already paid keeps their order and their pickup code.
    still_there = buyer.get(f"/orders/{order['id']}").get_json()
    assert still_there["pickup_code"] == paid["pickup_code"]
    assert still_there["seller"]["id"] == seller_id
    assert [row["id"] for row in admin.get("/orders").get_json()] == [order["id"]]
    # An admin can still work that shop's queue while it is being re-homed.
    assert [
        row["id"] for row in admin.get(f"/sellers/{seller_id}/orders").get_json()
    ] == [order["id"]]


def test_a_shop_with_another_login_stays_open_when_one_seller_leaves(
    client, app, admin, kiki_seller
):
    seller_id = kiki_seller.user["seller_id"]
    created = admin.post(
        "/users",
        json={
            "name": "Second Owner",
            "email": "second-owner@example.com",
            "role": "seller",
            "seller_id": seller_id,
            "password": "second-owner-password",
        },
    )
    assert created.status_code == 201

    assert kiki_seller.delete("/me").status_code == 204

    assert seller_id in [row["id"] for row in client.get("/sellers").get_json()]
    with app.app_context():
        assert Seller.query.get(seller_id).status == "approved"

    partner = login(client, "second-owner@example.com", "second-owner-password")
    assert partner.get(f"/sellers/{seller_id}/inventory").status_code == 200


def test_a_seller_login_with_no_shop_attached_can_still_delete_their_account(client, app):
    """A seller login that never got a shop must not be stuck forever."""
    with app.app_context():
        orphan = User(name="Orphan Seller", email="orphan@example.com", role="seller")
        orphan.set_password(SELLER_PASSWORD)
        db.session.add(orphan)
        db.session.commit()

    seller = login(client, "orphan@example.com", SELLER_PASSWORD)
    assert seller.delete("/me").status_code == 204
    with app.app_context():
        assert User.query.filter_by(email="orphan@example.com").first() is None
