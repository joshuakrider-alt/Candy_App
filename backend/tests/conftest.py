import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text  # noqa: E402

import payments  # noqa: E402  (path setup must run first)
from app import create_app  # noqa: E402
from models import db  # noqa: E402
from seed import seed_demo_data  # noqa: E402

# Set TEST_DATABASE_URL to run the whole suite against a throwaway Postgres
# database instead of SQLite, which is what production actually uses.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

TEST_SECRET_KEY = "sk_test_fake_key_for_unit_tests"
TEST_PUBLISHABLE_KEY = "pk_test_fake_key_for_unit_tests"
ADMIN_PASSWORD = "admin-password-1"
SELLER_PASSWORD = "seller-password-1"
BUYER_PASSWORD = "buyer-password-1"


class FakeStripe:
    """Records Checkout calls and replays canned responses."""

    def __init__(self):
        self.created_sessions = []
        self.session_state = {}
        self.next_session_id = 1

    def create_session(self, **params):
        session_id = f"cs_test_{self.next_session_id}"
        self.next_session_id += 1
        self.created_sessions.append(params)
        session = {
            "id": session_id,
            "url": f"https://checkout.stripe.test/{session_id}",
            "status": "open",
            "payment_status": "unpaid",
            "payment_intent": None,
        }
        self.session_state[session_id] = session
        return session

    def retrieve_session(self, session_id, **_kwargs):
        return self.session_state[session_id]

    def mark_paid(self, session_id):
        self.session_state[session_id].update(
            status="complete",
            payment_status="paid",
            payment_intent=f"pi_test_{session_id}",
        )

    def mark_expired(self, session_id):
        self.session_state[session_id].update(status="expired", payment_status="unpaid")

    @property
    def last_session_id(self):
        return f"cs_test_{self.next_session_id - 1}"


@pytest.fixture
def fake_stripe(monkeypatch):
    fake = FakeStripe()
    monkeypatch.setattr(
        payments.stripe.checkout.Session,
        "create",
        lambda **params: fake.create_session(**params),
    )
    monkeypatch.setattr(
        payments.stripe.checkout.Session,
        "retrieve",
        lambda session_id, **kwargs: fake.retrieve_session(session_id, **kwargs),
    )
    return fake


def reset_postgres_schema():
    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    for name in (
        "DATABASE_URL",
        "ADMIN_BOOTSTRAP_EMAIL",
        "ADMIN_BOOTSTRAP_PASSWORD",
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "CORS_ORIGINS",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", ADMIN_PASSWORD)
    monkeypatch.setenv("SEED_SELLER_PASSWORD", SELLER_PASSWORD)
    monkeypatch.setenv("SEED_BUYER_PASSWORD", BUYER_PASSWORD)

    def factory(**overrides):
        if TEST_DATABASE_URL:
            reset_postgres_schema()
        config = {
            "SQLALCHEMY_DATABASE_URI": TEST_DATABASE_URL or f"sqlite:///{tmp_path}/test.db",
            "TESTING": True,
            "JWT_SECRET_KEY": "test-jwt-secret",
            "STRIPE_SECRET_KEY": TEST_SECRET_KEY,
            "STRIPE_PUBLISHABLE_KEY": TEST_PUBLISHABLE_KEY,
            "STRIPE_WEBHOOK_SECRET": "",
            "PUBLIC_SITE_URL": "https://www.neighborhoodcandylady.com",
            "PLATFORM_FEE_PERCENT": 10,
            "PLATFORM_FEE_FLAT_CENTS": 0,
        }
        config.update(overrides)
        application = create_app(config)
        with application.app_context():
            seed_demo_data(verbose=False)
            db.session.remove()
        return application

    return factory


@pytest.fixture
def app(make_app):
    return make_app()


@pytest.fixture
def client(app):
    return app.test_client()


class ApiUser:
    def __init__(self, client, token, user):
        self.client = client
        self.token = token
        self.user = user

    @property
    def headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def get(self, path, **kwargs):
        return self.client.get(path, headers=self.headers, **kwargs)

    def post(self, path, json=None, **kwargs):
        return self.client.post(path, json=json, headers=self.headers, **kwargs)

    def put(self, path, json=None, **kwargs):
        return self.client.put(path, json=json, headers=self.headers, **kwargs)

    def delete(self, path, json=None, **kwargs):
        return self.client.delete(path, json=json, headers=self.headers, **kwargs)


def login(client, email, password):
    response = client.post("/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    return ApiUser(client, body["access_token"], body["user"])


@pytest.fixture
def admin(client):
    return login(client, "admin@example.com", ADMIN_PASSWORD)


@pytest.fixture
def buyer(client):
    return login(client, "alice@example.com", BUYER_PASSWORD)


@pytest.fixture
def kiki_seller(client):
    return login(client, "kiki@example.com", SELLER_PASSWORD)


@pytest.fixture
def northview_seller(client):
    return login(client, "jordan@example.com", SELLER_PASSWORD)
