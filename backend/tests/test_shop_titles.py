"""Shop title picker: how a shop is labeled ("Candy Lady", "Candy Shop", ...).

Existing shops must keep "Candy Lady" without anyone touching them, new shops
start as "Candy Shop", and the column's database default has to keep the
previous release working after a rollback.
"""

import pytest
from sqlalchemy import inspect, text

import storefront
from models import Order, Seller, db
from test_migrations import legacy_app  # noqa: F401  (fixture)
from test_payments import first_in_stock_item, place_order


def apply(client, email, **extra):
    return client.post(
        "/applications",
        json={
            "shop_name": "Title Test Treats",
            "contact_name": "Sam Rivera",
            "neighborhood": "Cherry Hill",
            "pickup_window": "Weekends",
            "email": email,
            "password": "title-test-password",
            **extra,
        },
    )


def test_new_shop_defaults_to_candy_shop(client):
    response = apply(client, "new-shop@example.com")
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["seller"]["shop_title"] == "Candy Shop"


@pytest.mark.parametrize(
    "sent, stored",
    [
        ("Candy Lady", "Candy Lady"),
        ("Candy Woman", "Candy Woman"),
        ("candy guy", "Candy Guy"),
        ("  CANDY   MAN ", "Candy Man"),
        ("Snack Auntie", "Snack Auntie"),
        ("Tía Dulce", "Tía Dulce"),
    ],
)
def test_onboarding_accepts_presets_and_custom_titles(client, sent, stored):
    response = apply(client, "picker@example.com", shop_title=sent)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["seller"]["shop_title"] == stored


def test_onboarding_rejects_a_bad_title_without_creating_anything(client):
    response = apply(client, "rude@example.com", shop_title="Candy Fuckboy")
    assert response.status_code == 400
    assert "shop_title" in response.get_json()["error"]
    # Nothing half-made: the email is still free for a corrected attempt.
    assert apply(client, "rude@example.com").status_code == 201


def test_seller_changes_title_in_shop_settings(client, kiki_seller):
    seller_id = kiki_seller.user["seller_id"]
    response = kiki_seller.put(
        f"/sellers/{seller_id}/storefront", json={"shop_title": "Candy Guy"}
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["shop_title"] == "Candy Guy"

    slug = response.get_json()["slug"]
    # Storefront page and the /shops cards both carry it.
    assert client.get(f"/shops/{slug}").get_json()["seller"]["shop_title"] == "Candy Guy"
    card = next(shop for shop in client.get("/shops").get_json() if shop["id"] == seller_id)
    assert card["shop_title"] == "Candy Guy"
    assert next(s for s in client.get("/sellers").get_json() if s["id"] == seller_id)[
        "shop_title"
    ] == "Candy Guy"

    # Leaving the field out of a later save leaves the title alone.
    untouched = kiki_seller.put(
        f"/sellers/{seller_id}/storefront", json={"tagline": "Sour candy central"}
    )
    assert untouched.get_json()["shop_title"] == "Candy Guy"


@pytest.mark.parametrize(
    "title",
    [
        "",
        None,
        "   ",
        "x",
        "a" * 25,
        "Candy 🍬",
        "<b>Candy</b>",
        "Candy_Lady",
        "Sh1t Shop",
        "f.u.c.k candy",
        "Bitch Candy",
        "Official Candy",
        "Candy Support",
    ],
)
def test_shop_settings_reject_bad_titles(kiki_seller, title):
    seller_id = kiki_seller.user["seller_id"]
    before = kiki_seller.get("/me").get_json()["seller"]["shop_title"]
    response = kiki_seller.put(
        f"/sellers/{seller_id}/storefront", json={"shop_title": title}
    )
    assert response.status_code == 400, title
    assert kiki_seller.get("/me").get_json()["seller"]["shop_title"] == before


def test_only_the_owner_or_admin_can_change_the_title(kiki_seller, northview_seller, buyer, admin):
    kiki_id = kiki_seller.user["seller_id"]
    body = {"shop_title": "Candy Man"}
    assert northview_seller.put(f"/sellers/{kiki_id}/storefront", json=body).status_code == 403
    assert buyer.put(f"/sellers/{kiki_id}/storefront", json=body).status_code == 403
    assert admin.put(f"/sellers/{kiki_id}/storefront", json=body).status_code == 200


def test_order_pages_carry_the_shop_title(app, client, buyer, kiki_seller, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    kiki_seller.put(f"/sellers/{seller_id}/storefront", json={"shop_title": "Candy Woman"})
    item = first_in_stock_item(client, seller_id)
    order = place_order(buyer, seller_id, item["candy_id"]).get_json()
    assert order["seller"]["shop_title"] == "Candy Woman"
    assert buyer.get(f"/orders/{order['id']}").get_json()["seller"]["shop_title"] == "Candy Woman"
    mine = buyer.get("/me/orders").get_json()
    assert {row["seller"]["shop_title"] for row in mine if row["id"] == order["id"]} == {
        "Candy Woman"
    }
    with app.app_context():
        assert Order.query.get(order["id"]).seller.shop_title == "Candy Woman"


def test_legacy_shops_keep_candy_lady(legacy_app):  # noqa: F811
    with legacy_app.app_context():
        columns = {
            column["name"]: column for column in inspect(db.engine).get_columns("seller")
        }
        assert columns["shop_title"]["nullable"] is False
        assert Seller.query.get(1).shop_title == "Candy Lady"
    client = legacy_app.test_client()
    assert client.get("/sellers/1/storefront").get_json()["seller"]["shop_title"] == "Candy Lady"


def test_old_code_can_still_insert_shops_after_a_rollback(legacy_app):  # noqa: F811
    """The previous release never names shop_title in its INSERTs.

    The database default fills it in, so a rollback keeps onboarding working
    and those shops read as "Candy Lady", just as they did before.
    """
    with legacy_app.app_context():
        with db.engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO seller (id, shop_name, contact_name, neighborhood, "
                    "pickup_window, status) VALUES (2, 'Rollback Shop', 'Old Code', "
                    "'Anywhere', 'Weekdays', 'pending')"
                )
            )
        assert Seller.query.get(2).shop_title == "Candy Lady"


def test_migration_is_idempotent(legacy_app):  # noqa: F811
    from migrations import run_migrations

    with legacy_app.app_context():
        assert ("seller", "shop_title") not in run_migrations()
        assert Seller.query.get(1).shop_title == "Candy Lady"


def test_title_rules():
    assert storefront.DEFAULT_SHOP_TITLE in storefront.SHOP_TITLE_PRESETS
    assert storefront.LEGACY_SHOP_TITLE == "Candy Lady"
    for preset in storefront.SHOP_TITLE_PRESETS:
        assert storefront.normalize_shop_title(preset) == preset
    assert storefront.normalize_shop_title("Candy Co.") == "Candy Co."
    assert storefront.normalize_shop_title("Mr. Sweets & Co") == "Mr. Sweets & Co"
    # Whole words only: innocent words containing a blocked one stay allowed.
    for fine in ("Grass Hopper", "Push It Candy", "Cocktail Candy", "Classic Treats"):
        assert storefront.normalize_shop_title(fine) == fine
    assert storefront.normalize_shop_title("a" * storefront.SHOP_TITLE_MAX_LENGTH)
    with pytest.raises(ValueError):
        storefront.normalize_shop_title("a" * (storefront.SHOP_TITLE_MAX_LENGTH + 1))
