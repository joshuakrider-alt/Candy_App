"""Seller and admin data is only served to a logged-in user with the right role.

The dashboards on seller.html and admin.html are static pages anyone can load,
so the API is the real gate. These tests walk the live URL map, so a new route
that forgets `@require_roles` fails here unless it is added to PUBLIC_ROUTES.
"""

import pytest

# Everything a logged-out visitor may call. Anything else must answer 401.
PUBLIC_ROUTES = {
    ("GET", "/health"),
    ("GET", "/config"),
    ("POST", "/signup"),
    ("POST", "/login"),
    ("GET", "/candies"),
    ("GET", "/candies/<int:candy_id>"),
    ("POST", "/applications"),
    ("GET", "/shops"),
    ("GET", "/shops/<slug>"),
    ("GET", "/sellers"),
    ("GET", "/sellers/<int:seller_id>/storefront"),
    ("POST", "/stripe/webhook"),
}

PLACEHOLDER_IDS = {
    "seller_id": "1",
    "candy_id": "1",
    "order_id": "1",
    "user_id": "1",
    "photo_id": "1",
    "slug": "anything",
}


def _fill(path, values):
    for name, value in values.items():
        path = path.replace(f"<int:{name}>", value).replace(f"<{name}>", value)
    return path


def api_routes(app):
    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            yield method, rule


def call(client, method, path, headers=None):
    return client.open(path, method=method, json={}, headers=headers or {})


def test_every_non_public_route_rejects_a_logged_out_request(app, client):
    checked = 0
    for method, rule in api_routes(app):
        if (method, rule.rule) in PUBLIC_ROUTES:
            continue
        response = call(client, method, _fill(rule.rule, PLACEHOLDER_IDS))
        assert response.status_code == 401, (method, rule.rule, response.status_code)
        checked += 1
    assert checked > 40  # the walk actually found the dashboard routes


def test_a_bad_token_is_rejected_not_trusted(client):
    for path in ("/admin/revenue", "/sellers/1/orders", "/applications"):
        response = client.get(path, headers={"Authorization": "Bearer not-a-real-token"})
        assert response.status_code in (401, 422), path


ADMIN_ONLY = [
    ("GET", "/admin/revenue"),
    ("GET", "/admin/photos"),
    ("PUT", "/admin/photos/1"),
    ("PUT", "/admin/sellers/1/profile-photo"),
    ("POST", "/admin/orders/1/refund"),
    ("GET", "/applications"),
    ("PUT", "/applications/1"),
    ("GET", "/users"),
    ("GET", "/users/1"),
    ("POST", "/users"),
    ("PUT", "/users/1/password"),
    ("GET", "/orders"),
    ("POST", "/candies"),
    ("PUT", "/candies/1"),
    ("DELETE", "/candies/1"),
]


@pytest.mark.parametrize("who", ["buyer", "kiki_seller"])
@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_admin_routes_refuse_buyers_and_sellers(request, who, method, path):
    user = request.getfixturevalue(who)
    response = call(user.client, method, path, headers=user.headers)
    assert response.status_code == 403, (who, method, path, response.get_json())


SELLER_SCOPED = [
    ("GET", "/sellers/{sid}/orders"),
    ("GET", "/sellers/{sid}/inventory"),
    ("PUT", "/sellers/{sid}/inventory/1"),
    ("POST", "/sellers/{sid}/items"),
    ("GET", "/sellers/{sid}/photos"),
    ("POST", "/sellers/{sid}/photos"),
    ("PUT", "/sellers/{sid}/profile-photo"),
    ("PUT", "/sellers/{sid}/storefront"),
    ("POST", "/sellers/{sid}/stripe/connect"),
    ("GET", "/sellers/{sid}/stripe/status"),
    ("POST", "/sellers/{sid}/stripe/dashboard"),
]


@pytest.mark.parametrize("method,path", SELLER_SCOPED)
def test_seller_routes_refuse_buyers(buyer, northview_seller, method, path):
    target = path.format(sid=northview_seller.user["seller_id"])
    response = call(buyer.client, method, target, headers=buyer.headers)
    assert response.status_code == 403, (method, target, response.get_json())


@pytest.mark.parametrize("method,path", SELLER_SCOPED)
def test_a_seller_cannot_reach_another_shops_data(
    kiki_seller, northview_seller, method, path
):
    other = northview_seller.user["seller_id"]
    assert other != kiki_seller.user["seller_id"]
    target = path.format(sid=other)
    response = call(kiki_seller.client, method, target, headers=kiki_seller.headers)
    # 403 from the ownership check; 503 would mean a feature gate ran first,
    # which is also a refusal, but the ownership check should win.
    assert response.status_code == 403, (method, target, response.get_json())


def test_the_right_seller_and_the_admin_still_get_in(kiki_seller, admin):
    sid = kiki_seller.user["seller_id"]
    assert kiki_seller.get(f"/sellers/{sid}/orders").status_code == 200
    assert admin.get(f"/sellers/{sid}/orders").status_code == 200
    assert admin.get("/admin/revenue").status_code == 200
