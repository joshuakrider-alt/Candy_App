"""Stripe Connect destination charges and per-shop public storefronts.

Every Stripe call is replaced with a fake; the keys in conftest are
placeholders, never real secrets.
"""

import pytest
from conftest import login
from test_payments import (
    WEBHOOK_SECRET,
    first_in_stock_item,
    place_order,
    signed_webhook,
)

import connect
import payments
from models import Order, Seller, db


class FakeConnect:
    """Records Connect calls and replays canned accounts."""

    def __init__(self):
        self.accounts = {}
        self.created = []
        self.links = []
        self.refunds = []
        self.refuse_with = None

    def create_account(self, **params):
        if self.refuse_with is not None:
            raise self.refuse_with
        account_id = f"acct_fake_{len(self.accounts) + 1}"
        self.created.append(params)
        self.accounts[account_id] = {
            "id": account_id,
            "charges_enabled": False,
            "details_submitted": False,
        }
        return dict(self.accounts[account_id])

    def retrieve_account(self, account_id, **_kwargs):
        return dict(self.accounts[account_id])

    def create_link(self, **params):
        self.links.append(params)
        return {"url": f"https://connect.stripe.test/setup/{params['account']}"}

    def create_refund(self, **params):
        self.refunds.append(params)
        return {"id": "re_fake_1", "status": "succeeded"}

    def finish_onboarding(self, account_id):
        self.accounts[account_id].update(charges_enabled=True, details_submitted=True)


@pytest.fixture
def fake_connect(monkeypatch):
    fake = FakeConnect()
    monkeypatch.setattr(
        connect.stripe.Account, "create", lambda **params: fake.create_account(**params)
    )
    monkeypatch.setattr(
        connect.stripe.Account,
        "retrieve",
        lambda account_id, **kwargs: fake.retrieve_account(account_id, **kwargs),
    )
    monkeypatch.setattr(
        connect.stripe.AccountLink, "create", lambda **params: fake.create_link(**params)
    )
    monkeypatch.setattr(
        payments.stripe.Refund, "create", lambda **params: fake.create_refund(**params)
    )
    return fake


@pytest.fixture
def unconnected_app(make_app):
    return make_app(connect_ready=False)


def seller_row(app, seller_id):
    with app.app_context():
        seller = Seller.query.get(seller_id)
        db.session.expunge(seller)
        return seller


# ---------------------------------------------------------------------------
# Checkout routing
# ---------------------------------------------------------------------------


def test_connected_shop_checkout_is_a_destination_charge(buyer, kiki_seller, client, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    response = place_order(buyer, seller_id, item["candy_id"], quantity=2)
    assert response.status_code == 201, response.get_json()
    order = response.get_json()

    params = fake_stripe.created_sessions[-1]
    intent = params["payment_intent_data"]
    assert intent["transfer_data"] == {"destination": f"acct_test_seller_{seller_id}"}
    # The platform keeps exactly the fee the order has always recorded.
    assert intent["application_fee_amount"] == order["platform_fee_cents"]
    assert order["platform_fee_cents"] == round(order["total_cents"] * 0.10)
    assert order["payout_method"] == "connect"
    for metadata in (params["metadata"], intent["metadata"]):
        assert metadata["order_id"] == str(order["id"])
        assert metadata["seller_id"] == str(seller_id)
        assert metadata["platform_fee_cents"] == str(order["platform_fee_cents"])


def test_shop_without_connect_cannot_take_card_orders(unconnected_app, fake_stripe):
    client = unconnected_app.test_client()
    buyer = login(client, "alice@example.com", "buyer-password-1")
    seller = client.get("/sellers").get_json()[0]
    assert seller["accepts_card_payments"] is False
    item = first_in_stock_item(client, seller["id"])
    before = item["inventory_count"]

    response = place_order(buyer, seller["id"], item["candy_id"])
    assert response.status_code == 409
    assert "cannot accept card payments" in response.get_json()["error"]
    # No platform-only session was opened, and no stock was held.
    assert fake_stripe.created_sessions == []
    assert first_in_stock_item(client, seller["id"])["inventory_count"] == before


def test_restricted_account_is_not_enough(make_app, fake_stripe):
    app = make_app()
    client = app.test_client()
    buyer = login(client, "alice@example.com", "buyer-password-1")
    seller_id = client.get("/sellers").get_json()[0]["id"]
    with app.app_context():
        seller = Seller.query.get(seller_id)
        seller.stripe_charges_enabled = False  # Stripe switched charges off.
        db.session.commit()
    item = first_in_stock_item(client, seller_id)
    assert place_order(buyer, seller_id, item["candy_id"]).status_code == 409


def test_shop_checkout_returns_to_the_shop_page(buyer, kiki_seller, client, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    slug = client.get("/sellers").get_json()
    slug = next(s["slug"] for s in slug if s["id"] == seller_id)
    item = first_in_stock_item(client, seller_id)
    response = buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "return_to": "shop",
            "items": [{"candy_id": item["candy_id"], "quantity": 1}],
        },
    )
    assert response.status_code == 201
    params = fake_stripe.created_sessions[-1]
    assert f"/s/{slug}?order=" in params["success_url"]
    assert f"/s/{slug}?order=" in params["cancel_url"]

    # Anything else falls back to the marketplace; no caller-chosen paths.
    buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "return_to": "https://evil.example/",
            "items": [{"candy_id": item["candy_id"], "quantity": 1}],
        },
    )
    assert "/buyer.html?order=" in fake_stripe.created_sessions[-1]["success_url"]


def test_admin_refund_of_a_connect_order_reverses_the_transfer(
    buyer, admin, kiki_seller, client, fake_stripe, fake_connect
):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    fake_stripe.mark_paid(fake_stripe.last_session_id)
    assert buyer.post(f"/orders/{order['id']}/payment/confirm").get_json()["payment_status"] == "paid"

    assert buyer.post(f"/admin/orders/{order['id']}/refund").status_code == 403
    refunded = admin.post(f"/admin/orders/{order['id']}/refund")
    assert refunded.status_code == 200
    assert refunded.get_json()["payment_status"] == "refunded"
    refund = fake_connect.refunds[-1]
    assert refund["payment_intent"] == f"pi_test_{fake_stripe.last_session_id}"
    assert refund["reverse_transfer"] is True
    assert refund["refund_application_fee"] is True


# ---------------------------------------------------------------------------
# Connect onboarding
# ---------------------------------------------------------------------------


def test_seller_onboards_an_express_account(unconnected_app, fake_connect, fake_stripe):
    client = unconnected_app.test_client()
    kiki = login(client, "kiki@example.com", "seller-password-1")
    seller_id = kiki.user["seller_id"]

    status = kiki.get(f"/sellers/{seller_id}/stripe/status").get_json()
    assert status["status"] == "unstarted"
    assert status["account_id"] is None

    started = kiki.post(f"/sellers/{seller_id}/stripe/connect")
    assert started.status_code == 201
    body = started.get_json()
    assert body["url"].startswith("https://connect.stripe.test/setup/")
    assert body["status"] == "onboarding"
    created = fake_connect.created[-1]
    assert created["type"] == "express"
    assert created["metadata"] == {"seller_id": str(seller_id)}
    link = fake_connect.links[-1]
    assert link["return_url"].endswith("/seller.html?stripe=return")
    assert link["refresh_url"].endswith("/seller.html?stripe=refresh")

    # Asking again reuses the account and just issues a fresh link.
    again = kiki.post(f"/sellers/{seller_id}/stripe/connect").get_json()
    assert again["account_id"] == body["account_id"]
    assert len(fake_connect.created) == 1

    # Seller finishes on Stripe; the status call pulls the verdict.
    fake_connect.finish_onboarding(body["account_id"])
    status = kiki.get(f"/sellers/{seller_id}/stripe/status").get_json()
    assert status["status"] == "active"
    assert status["charges_enabled"] is True
    assert status["details_submitted"] is True

    # And now card checkout works for this shop.
    buyer = login(client, "alice@example.com", "buyer-password-1")
    item = first_in_stock_item(client, seller_id)
    assert place_order(buyer, seller_id, item["candy_id"]).status_code == 201
    assert fake_stripe.created_sessions[-1]["payment_intent_data"]["transfer_data"] == {
        "destination": body["account_id"]
    }


def test_connect_endpoints_are_owner_or_admin_only(
    unconnected_app, fake_connect
):
    client = unconnected_app.test_client()
    kiki = login(client, "kiki@example.com", "seller-password-1")
    jordan = login(client, "jordan@example.com", "seller-password-1")
    buyer = login(client, "alice@example.com", "buyer-password-1")
    admin = login(client, "admin@example.com", "admin-password-1")
    seller_id = kiki.user["seller_id"]

    assert jordan.post(f"/sellers/{seller_id}/stripe/connect").status_code == 403
    assert jordan.get(f"/sellers/{seller_id}/stripe/status").status_code == 403
    assert buyer.post(f"/sellers/{seller_id}/stripe/connect").status_code == 403
    assert client.get(f"/sellers/{seller_id}/stripe/status").status_code == 401
    assert admin.get(f"/sellers/{seller_id}/stripe/status").status_code == 200


def test_connect_not_enabled_on_the_platform_is_a_clear_error(
    unconnected_app, fake_connect
):
    fake_connect.refuse_with = connect.stripe.InvalidRequestError(
        "You can only create new accounts if you've signed up for Connect, "
        "which you can learn how to do at https://stripe.com/docs/connect.",
        param=None,
    )
    client = unconnected_app.test_client()
    kiki = login(client, "kiki@example.com", "seller-password-1")
    response = kiki.post(f"/sellers/{kiki.user['seller_id']}/stripe/connect")
    assert response.status_code == 503
    assert "Connect is not enabled" in response.get_json()["error"]


def test_account_updated_webhook_marks_the_shop_ready(make_app, fake_connect):
    app = make_app(connect_ready=False, STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()
    kiki = login(client, "kiki@example.com", "seller-password-1")
    seller_id = kiki.user["seller_id"]
    account_id = kiki.post(f"/sellers/{seller_id}/stripe/connect").get_json()["account_id"]

    body, headers = signed_webhook(
        {
            "id": "evt_acct_1",
            "type": "account.updated",
            "data": {
                "object": {
                    "id": account_id,
                    "object": "account",
                    "charges_enabled": True,
                    "details_submitted": True,
                }
            },
        }
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.get_json() == {"received": True, "handled": True}
    assert seller_row(app, seller_id).connect_status == "active"

    # An event for an account no shop owns changes nothing.
    body, headers = signed_webhook(
        {
            "id": "evt_acct_2",
            "type": "account.updated",
            "data": {"object": {"id": "acct_someone_else", "charges_enabled": False}},
        }
    )
    assert client.post("/stripe/webhook", data=body, headers=headers).get_json()[
        "handled"
    ] is False

    # Unsigned events are still refused.
    unsigned = client.post(
        "/stripe/webhook", data=body, headers={"Stripe-Signature": "t=1,v1=bad"}
    )
    assert unsigned.status_code == 400


def test_connect_webhook_secret_is_accepted_too(make_app, fake_connect):
    connect_secret = "whsec_test_connect_endpoint"
    app = make_app(
        connect_ready=False,
        STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET,
        STRIPE_CONNECT_WEBHOOK_SECRET=connect_secret,
    )
    client = app.test_client()
    kiki = login(client, "kiki@example.com", "seller-password-1")
    seller_id = kiki.user["seller_id"]
    account_id = kiki.post(f"/sellers/{seller_id}/stripe/connect").get_json()["account_id"]

    body, headers = signed_webhook(
        {
            "id": "evt_acct_3",
            "type": "account.updated",
            "data": {
                "object": {"id": account_id, "charges_enabled": False, "details_submitted": True}
            },
        },
        secret=connect_secret,
    )
    assert client.post("/stripe/webhook", data=body, headers=headers).status_code == 200
    assert seller_row(app, seller_id).connect_status == "restricted"


def test_connect_account_id_is_owner_and_admin_only(client, kiki_seller, admin):
    public = client.get("/sellers").get_json()[0]
    assert "connect" not in public
    assert "acct_" not in str(public)
    assert "acct_" not in str(client.get("/shops").get_json())

    mine = kiki_seller.get("/me").get_json()["seller"]
    assert mine["connect"]["account_id"].startswith("acct_test_seller_")
    queue = admin.get("/applications?status=approved").get_json()
    assert all("connect" in row for row in queue)


# ---------------------------------------------------------------------------
# Storefront identity
# ---------------------------------------------------------------------------


def test_approved_shops_have_slugs_and_pending_shops_do_not(client, admin):
    shops = {shop["shop_name"]: shop for shop in client.get("/sellers").get_json()}
    assert shops["Ms. Kiki's Snack Spot"]["slug"] == "ms-kikis-snack-spot"
    assert shops["Ms. Kiki's Snack Spot"]["storefront_path"] == "/s/ms-kikis-snack-spot"
    pending = next(
        row
        for row in admin.get("/applications?status=pending").get_json()
        if row["shop_name"] == "Eastside Corner Treats"
    )
    assert pending["slug"] is None


def test_approval_generates_a_unique_slug(client, admin):
    def apply(email):
        return client.post(
            "/applications",
            json={
                "shop_name": "Ms. Kiki's Snack Spot",  # same name as a live shop
                "contact_name": "Copy Cat",
                "neighborhood": "Elsewhere",
                "pickup_window": "Sometimes",
                "email": email,
                "password": "copycat-password",
            },
        ).get_json()["seller"]

    first = apply("copy1@example.com")
    second = apply("copy2@example.com")
    for seller in (first, second):
        assert admin.put(f"/applications/{seller['id']}", json={"status": "approved"}).status_code == 200
    slugs = {
        row["id"]: row["slug"] for row in admin.get("/applications?status=approved").get_json()
    }
    assert slugs[first["id"]] == "ms-kikis-snack-spot-2"
    assert slugs[second["id"]] == "ms-kikis-snack-spot-3"


def test_public_shop_endpoint_shows_only_that_shops_active_items(
    client, kiki_seller, northview_seller
):
    kiki_id = kiki_seller.user["seller_id"]
    # A Kiki-owned custom item, in stock, and one she has deactivated.
    kiki_seller.post(
        f"/sellers/{kiki_id}/items",
        json={"name": "Kiki Fudge", "price_cents": 300, "inventory_count": 5},
    )
    retired = kiki_seller.post(
        f"/sellers/{kiki_id}/items",
        json={"name": "Retired Taffy", "price_cents": 100, "inventory_count": 5},
    ).get_json()
    retired_id = retired.get("candy_id") or retired["candy"]["id"]
    kiki_seller.delete(f"/sellers/{kiki_id}/items/{retired_id}")

    kiki = client.get("/shops/ms-kikis-snack-spot")
    assert kiki.status_code == 200
    body = kiki.get_json()
    assert body["seller"]["id"] == kiki_id
    names = {item["candy"]["name"] for item in body["items"]}
    assert "Kiki Fudge" in names
    assert "Retired Taffy" not in names
    assert all(item["seller_id"] == kiki_id for item in body["items"])
    assert all(item["inventory_count"] > 0 for item in body["items"])

    northview = client.get("/shops/northview-snack-stop").get_json()
    assert "Kiki Fudge" not in {item["candy"]["name"] for item in northview["items"]}
    assert {item["seller_id"] for item in northview["items"]} == {
        northview_seller.user["seller_id"]
    }


def test_unknown_or_pending_shop_slug_is_404(client, admin):
    assert client.get("/shops/no-such-shop").status_code == 404
    # Give the pending shop a slug directly; it still must not be public.
    pending = next(
        row
        for row in admin.get("/applications?status=pending").get_json()
        if row["shop_name"] == "Eastside Corner Treats"
    )
    response = admin.put(
        f"/sellers/{pending['id']}/storefront", json={"slug": "eastside-corner"}
    )
    assert response.status_code == 200
    assert client.get("/shops/eastside-corner").status_code == 404
    assert "eastside-corner" not in {shop["slug"] for shop in client.get("/shops").get_json()}


def test_shops_directory_lists_approved_shops(client):
    shops = client.get("/shops").get_json()
    names = {shop["shop_name"] for shop in shops}
    assert {"Ms. Kiki's Snack Spot", "Northview Snack Stop"} <= names
    assert "Eastside Corner Treats" not in names
    for shop in shops:
        assert shop["slug"]
        assert set(shop["theme"]) == {"primary", "accent", "on_primary", "on_accent"}
        storefront = client.get(f"/shops/{shop['slug']}").get_json()
        assert len(storefront["items"]) == shop["in_stock_count"]


def test_seller_edits_storefront_identity(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    response = kiki_seller.put(
        f"/sellers/{seller_id}/storefront",
        json={
            "slug": "kikis",
            "tagline": "Sour candy central",
            "theme_primary": "#C41E3A",
            "theme_accent": "#FFD84D",
            "logo_url": "https://photos.example.com/kiki.png",
        },
    )
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["slug"] == "kikis"
    assert body["theme"]["primary"] == "#c41e3a"
    assert body["theme"]["on_primary"] == "#ffffff"
    assert body["theme"]["on_accent"] == "#1a1a1a"  # dark text on yellow

    public = client.get("/shops/kikis").get_json()["seller"]
    assert public["tagline"] == "Sour candy central"
    assert public["logo_url"] == "https://photos.example.com/kiki.png"
    # The old address stops working once replaced.
    assert client.get("/shops/ms-kikis-snack-spot").status_code == 404

    # Optional fields clear with null / "".
    cleared = kiki_seller.put(
        f"/sellers/{seller_id}/storefront",
        json={"tagline": "", "theme_accent": None, "logo_url": ""},
    ).get_json()
    assert cleared["tagline"] is None
    assert cleared["theme"]["accent"] is None
    assert cleared["logo_url"] is None
    assert cleared["slug"] == "kikis"


@pytest.mark.parametrize(
    "payload",
    [
        {"slug": "Kiki's Spot"},
        {"slug": "ab"},
        {"slug": "-kiki"},
        {"slug": "kiki--spot"},
        {"slug": "admin"},
        {"slug": "privacy"},
        {"slug": ""},
        {"slug": None},
        {"theme_primary": "red"},
        {"theme_primary": "#fff"},
        {"theme_accent": "#12345g"},
        {"theme_primary": "#123456; background:url(x)"},
        {"logo_url": "http://example.com/logo.png"},
        {"logo_url": "javascript:alert(1)"},
        {"logo_url": "data:image/png;base64,AAAA"},
        {"tagline": "x" * 141},
    ],
)
def test_storefront_settings_reject_bad_values(kiki_seller, payload):
    response = kiki_seller.put(
        f"/sellers/{kiki_seller.user['seller_id']}/storefront", json=payload
    )
    assert response.status_code == 400, payload


def test_slug_must_be_unique_and_owner_only(client, kiki_seller, northview_seller, buyer):
    kiki_id = kiki_seller.user["seller_id"]
    taken = kiki_seller.put(
        f"/sellers/{kiki_id}/storefront", json={"slug": "northview-snack-stop"}
    )
    assert taken.status_code == 409
    # Case is folded before the check, so NorthView cannot sneak past.
    assert (
        kiki_seller.put(
            f"/sellers/{kiki_id}/storefront", json={"slug": "Northview-Snack-Stop"}
        ).status_code
        == 409
    )
    # Re-saving your own slug is fine.
    assert (
        kiki_seller.put(
            f"/sellers/{kiki_id}/storefront", json={"slug": "ms-kikis-snack-spot"}
        ).status_code
        == 200
    )
    assert (
        northview_seller.put(f"/sellers/{kiki_id}/storefront", json={"tagline": "hi"}).status_code
        == 403
    )
    assert buyer.put(f"/sellers/{kiki_id}/storefront", json={"tagline": "hi"}).status_code == 403


def test_slug_unique_constraint_backs_up_the_check(app):
    """The database refuses a duplicate even if the API check were skipped."""
    from sqlalchemy.exc import IntegrityError

    with app.app_context():
        sellers = Seller.query.filter_by(status="approved").order_by(Seller.id).all()
        sellers[1].slug = sellers[0].slug
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_storefront_helpers():
    import storefront

    assert storefront.slugify("Ms. Kiki's Snack Spot") == "ms-kikis-snack-spot"
    assert storefront.slugify("Café  Olé!!") == "cafe-ole"
    assert storefront.unique_slug("Admin", lambda _slug: False) == "admin-snack-spot"
    assert storefront.unique_slug("!!", lambda _slug: False) == "snack-spot"
    taken = {"sweets", "sweets-2"}
    assert storefront.unique_slug("Sweets", taken.__contains__) == "sweets-3"
    assert storefront.readable_text_on("#000000") == "#ffffff"
    assert storefront.readable_text_on("#ffffff") == "#1a1a1a"


def test_orders_record_their_payout_method(app, buyer, kiki_seller, client, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = first_in_stock_item(client, seller_id)
    order_id = place_order(buyer, seller_id, item["candy_id"]).get_json()["id"]
    with app.app_context():
        order = Order.query.get(order_id)
        assert order.stripe_destination_account_id == f"acct_test_seller_{seller_id}"
        assert order.payout_method == "connect"
