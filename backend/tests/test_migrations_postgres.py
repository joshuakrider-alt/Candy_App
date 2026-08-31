"""Same migration check as test_migrations.py, but on real Postgres.

Production runs Neon, and the ALTER TABLE / backfill statements differ enough
between SQLite and Postgres to be worth checking directly. Skipped unless
TEST_DATABASE_URL points at a throwaway Postgres database, for example:

    TEST_DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost/candy_test \
        python -m pytest tests/test_migrations_postgres.py
"""

import os

import pytest
from sqlalchemy import create_engine, text

from app import create_app
from models import Order, User, db

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"
)

# The schema as the pre-payments code created it on Postgres.
LEGACY_SCHEMA = """
DROP TABLE IF EXISTS order_item, "order", seller_inventory, candy, seller, "user" CASCADE;
CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE
);
CREATE TABLE seller (
    id SERIAL PRIMARY KEY,
    shop_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(120) NOT NULL,
    neighborhood VARCHAR(120) NOT NULL,
    pickup_window VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL
);
CREATE TABLE candy (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    price_cents INTEGER NOT NULL
);
CREATE TABLE seller_inventory (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES seller (id),
    candy_id INTEGER NOT NULL REFERENCES candy (id),
    inventory_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL
);
CREATE TABLE "order" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user" (id),
    seller_id INTEGER NOT NULL REFERENCES seller (id),
    total_cents INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE TABLE order_item (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES "order" (id),
    candy_id INTEGER NOT NULL REFERENCES candy (id),
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL
);
INSERT INTO "user" (name, email) VALUES ('Alice Carter', 'alice@example.com');
INSERT INTO seller (shop_name, contact_name, neighborhood, pickup_window, status)
    VALUES ('Ms. Kiki''s Snack Spot', 'Kiana Roberts', 'Cherry Hill', 'Weekdays', 'approved');
INSERT INTO candy (name, description, price_cents)
    VALUES ('Sour Gummy Mix', 'Tangy fruit gummies', 250);
INSERT INTO seller_inventory (seller_id, candy_id, inventory_count, status)
    VALUES (1, 1, 24, 'in-stock');
INSERT INTO "order" (user_id, seller_id, total_cents, status, created_at)
    VALUES (1, 1, 425, 'ready', '2025-01-01 12:00:00');
INSERT INTO order_item (order_id, candy_id, quantity, unit_price_cents)
    VALUES (1, 1, 1, 250);
"""


@pytest.fixture
def legacy_postgres_app(monkeypatch):
    for name in ("DATABASE_URL", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"):
        monkeypatch.delenv(name, raising=False)

    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as connection:
        for statement in filter(None, (s.strip() for s in LEGACY_SCHEMA.split(";"))):
            connection.execute(text(statement))
    engine.dispose()

    return create_app(
        {
            "SQLALCHEMY_DATABASE_URI": TEST_DATABASE_URL,
            "TESTING": True,
            "JWT_SECRET_KEY": "test-jwt-secret",
            "STRIPE_SECRET_KEY": "sk_test_fake",
        }
    )


def test_postgres_legacy_rows_survive_and_gain_payment_columns(legacy_postgres_app):
    with legacy_postgres_app.app_context():
        order = Order.query.get(1)
        assert order.total_cents == 425
        assert order.status == "ready"
        assert order.payment_status == "pay_at_pickup"
        assert order.pickup_code == "CL-1"
        assert order.is_fulfillable

        user = User.query.get(1)
        assert user.role == "buyer"
        assert user.has_password is False


def test_postgres_legacy_order_survives_the_buyer_deleting_their_account(
    legacy_postgres_app,
):
    """Neon created `order.user_id` NOT NULL; deletion needs it relaxed."""
    with legacy_postgres_app.app_context():
        nullable = db.session.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = 'order' "
                "AND column_name = 'user_id'"
            )
        ).scalar()
        assert nullable == "YES"

        user = User.query.get(1)
        user.set_password("a-real-password")
        db.session.commit()

    client = legacy_postgres_app.test_client()
    token = client.post(
        "/login", json={"email": "alice@example.com", "password": "a-real-password"}
    ).get_json()["access_token"]
    assert client.delete("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 204

    with legacy_postgres_app.app_context():
        assert User.query.get(1) is None
        order = Order.query.get(1)
        assert order.user_id is None
        assert order.total_cents == 425
        assert order.is_fulfillable


def test_postgres_migration_is_idempotent_and_new_rows_still_insert(legacy_postgres_app):
    from migrations import run_migrations

    with legacy_postgres_app.app_context():
        assert run_migrations() == set()

        # Sequences created by the old schema must still work after ALTER TABLE.
        user = User(name="New Buyer", email="new-buyer@example.com", role="buyer")
        user.set_password("a-real-password")
        db.session.add(user)
        db.session.commit()
        assert user.id is not None
