from conftest import login


def approved_shop_names(client):
    response = client.get("/sellers")
    assert response.status_code == 200
    return [seller["shop_name"] for seller in response.get_json()]


def test_buyers_can_browse_every_approved_shop(client):
    names = approved_shop_names(client)
    assert "Ms. Kiki's Snack Spot" in names
    assert "Northview Snack Stop" in names
    assert "Eastside Corner Treats" not in names


def test_each_approved_shop_has_its_own_storefront(client):
    sellers = client.get("/sellers").get_json()
    assert len(sellers) >= 2
    for seller in sellers:
        storefront = client.get(f"/sellers/{seller['id']}/storefront")
        assert storefront.status_code == 200
        body = storefront.get_json()
        assert body["seller"]["shop_name"] == seller["shop_name"]
        assert len(body["items"]) == seller["in_stock_count"]
        for item in body["items"]:
            assert item["inventory_count"] > 0


def test_pending_shop_has_no_public_storefront(client, admin):
    pending = next(
        seller
        for seller in admin.get("/applications?status=pending").get_json()
        if seller["shop_name"] == "Eastside Corner Treats"
    )
    assert client.get(f"/sellers/{pending['id']}/storefront").status_code == 404


def test_apply_creates_a_real_login_that_works_after_approval(client, admin):
    application = client.post(
        "/applications",
        json={
            "shop_name": "Maple Street Sweets",
            "contact_name": "Dana Ruiz",
            "neighborhood": "Maple Street",
            "pickup_window": "Daily, 4:00 PM - 8:00 PM",
            "email": "dana@example.com",
            "password": "dana-real-password",
        },
    )
    assert application.status_code == 201
    seller = application.get_json()["seller"]
    assert seller["status"] == "pending"

    # The login exists immediately, but the shop is not live yet.
    dana = login(client, "dana@example.com", "dana-real-password")
    assert dana.user["role"] == "seller"
    assert dana.user["seller_id"] == seller["id"]
    assert "Maple Street Sweets" not in approved_shop_names(client)

    approval = admin.put(f"/applications/{seller['id']}", json={"status": "approved"})
    assert approval.status_code == 200
    assert approval.get_json()["status"] == "approved"
    assert "Maple Street Sweets" in approved_shop_names(client)

    # An approved shop starts with a toggle row for every catalog item.
    inventory = dana.get(f"/sellers/{seller['id']}/inventory")
    assert inventory.status_code == 200
    rows = inventory.get_json()
    assert len(rows) == len(client.get("/candies").get_json())
    assert all(row["status"] == "out-of-stock" for row in rows)


def test_apply_requires_an_email_and_password(client):
    response = client.post(
        "/applications",
        json={
            "shop_name": "No Login Shop",
            "contact_name": "Anon",
            "neighborhood": "Somewhere",
            "pickup_window": "Daily",
        },
    )
    assert response.status_code == 400


def test_apply_rejects_an_email_that_already_has_an_account(client):
    response = client.post(
        "/applications",
        json={
            "shop_name": "Copycat Sweets",
            "contact_name": "Copy Cat",
            "neighborhood": "Elsewhere",
            "pickup_window": "Daily",
            "email": "alice@example.com",
            "password": "some-password-1",
        },
    )
    assert response.status_code == 409


def test_only_admins_can_approve(client, buyer, kiki_seller, admin):
    pending = next(
        seller
        for seller in admin.get("/applications?status=pending").get_json()
        if seller["status"] == "pending"
    )
    assert buyer.put(f"/applications/{pending['id']}", json={"status": "approved"}).status_code == 403
    assert (
        kiki_seller.put(f"/applications/{pending['id']}", json={"status": "approved"}).status_code
        == 403
    )
    assert client.put(f"/applications/{pending['id']}", json={"status": "approved"}).status_code == 401


def test_seller_stock_toggle_changes_the_public_storefront(kiki_seller, client):
    seller_id = kiki_seller.user["seller_id"]
    before = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    target = before[0]

    kiki_seller.put(
        f"/sellers/{seller_id}/inventory/{target['candy_id']}",
        json={"status": "out-of-stock"},
    )

    after = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    assert target["candy_id"] not in [item["candy_id"] for item in after]
    assert len(after) == len(before) - 1


def test_seller_can_create_edit_and_remove_an_owned_item(kiki_seller, client):
    seller_id = kiki_seller.user["seller_id"]
    created = kiki_seller.post(
        f"/sellers/{seller_id}/items",
        json={
            "name": "Peach Clouds",
            "description": "Soft peach sweets",
            "price_cents": 275,
            "inventory_count": 6,
        },
    )
    assert created.status_code == 201
    item = created.get_json()
    assert item["candy"]["owner_seller_id"] == seller_id
    assert item["status"] == "in-stock"

    inventory = kiki_seller.get(f"/sellers/{seller_id}/inventory").get_json()
    assert item["candy_id"] in [row["candy_id"] for row in inventory]
    storefront = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    assert item["candy_id"] in [row["candy_id"] for row in storefront]

    updated = kiki_seller.put(
        f"/sellers/{seller_id}/items/{item['candy_id']}",
        json={"name": "Peach Cloud Bites", "price_cents": 300, "inventory_count": 3},
    )
    assert updated.status_code == 200
    assert updated.get_json()["candy"]["price_cents"] == 300

    removed = kiki_seller.delete(f"/sellers/{seller_id}/items/{item['candy_id']}")
    assert removed.status_code == 204
    storefront = client.get(f"/sellers/{seller_id}/storefront").get_json()["items"]
    assert item["candy_id"] not in [row["candy_id"] for row in storefront]


def test_custom_item_is_private_to_owner_inventory_and_mutations(
    kiki_seller, northview_seller
):
    owner_id = kiki_seller.user["seller_id"]
    other_id = northview_seller.user["seller_id"]
    item = kiki_seller.post(
        f"/sellers/{owner_id}/items",
        json={"name": "Private Praline", "price_cents": 150, "inventory_count": 2},
    ).get_json()

    other_inventory = northview_seller.get(f"/sellers/{other_id}/inventory").get_json()
    assert item["candy_id"] not in [row["candy_id"] for row in other_inventory]
    assert northview_seller.put(
        f"/sellers/{other_id}/items/{item['candy_id']}", json={"price_cents": 1}
    ).status_code == 403
    assert northview_seller.delete(
        f"/sellers/{other_id}/items/{item['candy_id']}"
    ).status_code == 403


def test_buyer_can_order_a_seller_owned_item(kiki_seller, buyer, fake_stripe):
    seller_id = kiki_seller.user["seller_id"]
    item = kiki_seller.post(
        f"/sellers/{seller_id}/items",
        json={"name": "Chocolate Moon", "price_cents": 425, "inventory_count": 5},
    ).get_json()

    response = buyer.post(
        "/orders",
        json={
            "seller_id": seller_id,
            "items": [{"candy_id": item["candy_id"], "quantity": 2}],
        },
    )
    assert response.status_code == 201
    order = response.get_json()
    assert order["total_cents"] == 850
    assert order["items"][0]["candy"]["name"] == "Chocolate Moon"
