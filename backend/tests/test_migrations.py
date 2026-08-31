"""Boot the new app against a database created by the old code.

Production Neon holds real rows, so the migration has to add columns in place
and keep every existing row readable.
"""

import sqlite3

import pytest
from conftest import ADMIN_PASSWORD
from sqlalchemy import inspect

from app import create_app
from models import Order, User, db

# The schema exactly as the pre-payments code created it.
LEGACY_SCHEMA = """
CREATE TABLE user (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE
);
CREATE TABLE seller (
    id INTEGER NOT NULL PRIMARY KEY,
    shop_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(120) NOT NULL,
    neighborhood VARCHAR(120) NOT NULL,
    pickup_window VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL
);
CREATE TABLE candy (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    price_cents INTEGER NOT NULL
);
CREATE TABLE seller_inventory (
    id INTEGER NOT NULL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES seller (id),
    candy_id INTEGER NOT NULL REFERENCES candy (id),
    inventory_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL
);
CREATE TABLE "order" (
    id INTEGER NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user (id),
    seller_id INTEGER NOT NULL REFERENCES seller (id),
    total_cents INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL
);
CREATE TABLE order_item (
    id INTEGER NOT NULL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES "order" (id),
    candy_id INTEGER NOT NULL REFERENCES candy (id),
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL
);
"""

LEGACY_ROWS = """
INSERT INTO user (id, name, email) VALUES (1, 'Alice Carter', 'alice@example.com');
INSERT INTO seller (id, shop_name, contact_name, neighborhood, pickup_window, status)
    VALUES (1, 'Ms. Kiki''s Snack Spot', 'Kiana Roberts', 'Cherry Hill', 'Weekdays', 'approved');
INSERT INTO candy (id, name, description, price_cents)
    VALUES (1, 'Sour Gummy Mix', 'Tangy fruit gummies', 250);
INSERT INTO seller_inventory (id, seller_id, candy_id, inventory_count, status)
    VALUES (1, 1, 1, 24, 'in-stock');
INSERT INTO "order" (id, user_id, seller_id, total_cents, status, created_at)
    VALUES (7, 1, 1, 425, 'ready', '2025-01-01 12:00:00');
INSERT INTO order_item (id, order_id, candy_id, quantity, unit_price_cents)
    VALUES (1, 7, 1, 1, 250);
"""


@pytest.fixture
def legacy_app(tmp_path, monkeypatch):
    for name in ("DATABASE_URL", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"):
        monkeypatch.delenv(name, raising=False)

    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(LEGACY_SCHEMA)
    connection.executescript(LEGACY_ROWS)
    connection.commit()
    connection.close()

    return create_app(
        {
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "TESTING": True,
            "JWT_SECRET_KEY": "test-jwt-secret",
            "STRIPE_SECRET_KEY": "sk_test_fake",
        }
    )


def test_legacy_rows_survive_and_gain_payment_columns(legacy_app):
    with legacy_app.app_context():
        order = Order.query.get(7)
        assert order is not None
        assert order.total_cents == 425
        assert order.status == "ready"
        # Orders taken before online payment stay fulfillable.
        assert order.payment_status == "pay_at_pickup"
        assert order.pickup_code == "CL-7"
        assert order.platform_fee_cents == 0
        assert order.currency == "usd"
        assert order.is_fulfillable

        user = User.query.get(1)
        assert user.email == "alice@example.com"
        assert user.role == "buyer"
        # No password yet, so the account cannot be used until one is set.
        assert user.has_password is False


def test_legacy_account_can_be_given_a_password_and_log_in(legacy_app):
    client = legacy_app.test_client()
    assert (
        client.post(
            "/login", json={"email": "alice@example.com", "password": "anything-here"}
        ).status_code
        == 403
    )

    with legacy_app.app_context():
        user = User.query.get(1)
        user.set_password("a-real-password")
        db.session.commit()

    response = client.post(
        "/login", json={"email": "alice@example.com", "password": "a-real-password"}
    )
    assert response.status_code == 200


def test_legacy_pay_at_pickup_order_still_shows_in_the_seller_queue(legacy_app):
    with legacy_app.app_context():
        admin = User(name="Admin", email="admin@example.com", role="admin")
        admin.set_password(ADMIN_PASSWORD)
        db.session.add(admin)
        db.session.commit()

    client = legacy_app.test_client()
    token = client.post(
        "/login", json={"email": "admin@example.com", "password": ADMIN_PASSWORD}
    ).get_json()["access_token"]
    queue = client.get(
        "/sellers/1/orders", headers={"Authorization": f"Bearer {token}"}
    ).get_json()
    assert [row["id"] for row in queue] == [7]
    assert queue[0]["pickup_code"] == "CL-7"


def test_a_legacy_order_survives_the_buyer_deleting_their_account(legacy_app):
    """The old schema made `order.user_id` NOT NULL, so it has to be rebuilt."""
    with legacy_app.app_context():
        columns = {
            column["name"]: column for column in inspect(db.engine).get_columns("order")
        }
        assert columns["user_id"]["nullable"] is True
        # The rebuild has to carry the rows and the pickup code index over.
        indexes = {index["name"] for index in inspect(db.engine).get_indexes("order")}
        assert "uq_order_pickup_code" in indexes

        user = User.query.get(1)
        user.set_password("a-real-password")
        db.session.commit()

    client = legacy_app.test_client()
    token = client.post(
        "/login", json={"email": "alice@example.com", "password": "a-real-password"}
    ).get_json()["access_token"]
    deleted = client.delete("/me", headers={"Authorization": f"Bearer {token}"})
    assert deleted.status_code == 204

    with legacy_app.app_context():
        assert User.query.get(1) is None
        order = Order.query.get(7)
        assert order.user_id is None
        assert order.total_cents == 425
        assert order.pickup_code == "CL-7"
        assert [item.quantity for item in order.items] == [1]


def test_migrations_are_idempotent(legacy_app):
    from migrations import run_migrations

    with legacy_app.app_context():
        assert run_migrations() == set()
        assert run_migrations() == set()


def test_a_postgres_scheme_url_is_normalized(monkeypatch):
    """Neon hands out postgres:// URLs, which SQLAlchemy 2 refuses to parse."""
    from app import resolve_database_url

    monkeypatch.setenv("DATABASE_URL", "postgres://user:pw@example.test/candy")
    assert resolve_database_url() == "postgresql://user:pw@example.test/candy"

    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pw@example.test/candy")
    assert resolve_database_url() == "postgresql+psycopg2://user:pw@example.test/candy"

    monkeypatch.delenv("DATABASE_URL")
    assert resolve_database_url().startswith("sqlite:///")
