from conftest import ADMIN_PASSWORD, BUYER_PASSWORD, SELLER_PASSWORD, login

from models import User, db


def test_login_requires_the_accounts_own_password(client):
    wrong = client.post(
        "/login", json={"email": "alice@example.com", "password": SELLER_PASSWORD}
    )
    assert wrong.status_code == 401

    right = client.post(
        "/login", json={"email": "alice@example.com", "password": BUYER_PASSWORD}
    )
    assert right.status_code == 200
    assert right.get_json()["user"]["role"] == "buyer"


def test_shared_prototype_password_no_longer_works(client, app, monkeypatch):
    monkeypatch.setenv("PROTOTYPE_LOGIN_PASSWORD", "password")
    response = client.post(
        "/login", json={"email": "alice@example.com", "password": "password"}
    )
    assert response.status_code == 401


def test_account_without_a_password_cannot_log_in(client, app):
    with app.app_context():
        user = User(name="No Password", email="nopass@example.com", role="buyer")
        db.session.add(user)
        db.session.commit()

    response = client.post(
        "/login", json={"email": "nopass@example.com", "password": "anything-at-all"}
    )
    assert response.status_code == 403
    assert "no password" in response.get_json()["error"]


def test_signup_creates_a_buyer_and_ignores_a_requested_role(client):
    response = client.post(
        "/signup",
        json={
            "name": "New Buyer",
            "email": "New.Buyer@Example.com",
            "password": "buyer-signup-pw",
            "role": "admin",
        },
    )
    assert response.status_code == 201
    body = response.get_json()
    assert body["user"]["role"] == "buyer"
    assert body["user"]["email"] == "new.buyer@example.com"

    again = client.post(
        "/signup",
        json={"name": "Dup", "email": "new.buyer@example.com", "password": "another-pw-1"},
    )
    assert again.status_code == 409


def test_signup_rejects_short_passwords(client):
    response = client.post(
        "/signup", json={"name": "Shorty", "email": "short@example.com", "password": "abc"}
    )
    assert response.status_code == 400
    assert "8 characters" in response.get_json()["error"]


def test_expired_or_missing_token_returns_401(client):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_buyer_cannot_reach_admin_or_seller_routes(buyer):
    assert buyer.get("/applications").status_code == 403
    assert buyer.get("/users").status_code == 403
    assert buyer.get("/orders").status_code == 403
    assert buyer.get("/sellers/1/inventory").status_code == 403


def test_seller_only_sees_its_own_shop(kiki_seller, northview_seller):
    own = kiki_seller.get(f"/sellers/{kiki_seller.user['seller_id']}/inventory")
    assert own.status_code == 200

    other = kiki_seller.get(f"/sellers/{northview_seller.user['seller_id']}/inventory")
    assert other.status_code == 403


def test_seller_cannot_edit_the_catalog(kiki_seller):
    response = kiki_seller.post("/candies", json={"name": "Bootleg Bar", "price_cents": 100})
    assert response.status_code == 403


def test_admin_can_reset_a_password_and_the_user_can_log_in(client, admin):
    users = admin.get("/users").get_json()
    alice = next(user for user in users if user["email"] == "alice@example.com")

    response = admin.put(
        f"/users/{alice['id']}/password", json={"password": "brand-new-password"}
    )
    assert response.status_code == 200

    assert (
        client.post(
            "/login", json={"email": "alice@example.com", "password": BUYER_PASSWORD}
        ).status_code
        == 401
    )
    login(client, "alice@example.com", "brand-new-password")


def test_change_own_password_requires_the_current_one(client, buyer):
    wrong = buyer.put(
        "/me/password",
        json={"current_password": "not-it-at-all", "new_password": "new-password-9"},
    )
    assert wrong.status_code == 401

    ok = buyer.put(
        "/me/password",
        json={"current_password": BUYER_PASSWORD, "new_password": "new-password-9"},
    )
    assert ok.status_code == 200
    login(client, "alice@example.com", "new-password-9")


def test_me_returns_the_sellers_shop(kiki_seller):
    body = kiki_seller.get("/me").get_json()
    assert body["user"]["role"] == "seller"
    assert body["seller"]["shop_name"] == "Ms. Kiki's Snack Spot"


def test_admin_login_works_with_its_own_password(client):
    admin_user = login(client, "admin@example.com", ADMIN_PASSWORD)
    assert admin_user.user["role"] == "admin"
