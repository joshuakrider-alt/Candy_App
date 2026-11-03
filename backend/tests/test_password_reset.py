import re
from datetime import timedelta

import pytest

import mailer
from conftest import BUYER_PASSWORD, login
from models import PasswordResetToken, db, utcnow

RESET_ON = {
    "PASSWORD_RESET_EMAILS": True,
    "RESEND_API_KEY": "re_test_placeholder",
    "MESSAGE_EMAIL_FROM": "The Candy Lady <hello@neighborhoodcandylady.com>",
    "MESSAGE_EMAIL_SYNC": True,
}
NEW_PASSWORD = "brand-new-password-9"


@pytest.fixture
def sent(monkeypatch):
    outbox = []
    monkeypatch.setattr(
        mailer, "send_email", lambda config, to, subject, text: outbox.append((to, subject, text)) or True
    )
    return outbox


@pytest.fixture
def reset_app(make_app):
    return make_app(**RESET_ON)


@pytest.fixture
def reset_client(reset_app):
    return reset_app.test_client()


def ask(client, email="alice@example.com"):
    return client.post("/password-reset/request", json={"email": email})


def token_from(outbox):
    match = re.search(r"/reset-password#token=([A-Za-z0-9_-]+)", outbox[-1][2])
    assert match, outbox[-1][2]
    return match.group(1)


def confirm(client, token, password=NEW_PASSWORD):
    return client.post("/password-reset/confirm", json={"token": token, "password": password})


def test_reset_link_sets_a_new_password_once(reset_client, sent):
    response = ask(reset_client)
    assert response.status_code == 202
    assert [to for to, _, _ in sent] == ["alice@example.com"]
    _, subject, text = sent[0]
    assert "Reset" in subject
    # The link points at the Next.js page, with the token in the fragment.
    assert "https://www.neighborhoodcandylady.com/reset-password#token=" in text

    token = token_from(sent)
    assert confirm(reset_client, token).status_code == 200
    login(reset_client, "alice@example.com", NEW_PASSWORD)
    old = reset_client.post("/login", json={"email": "alice@example.com", "password": BUYER_PASSWORD})
    assert old.status_code == 401

    # Single use: the same link cannot set the password again.
    again = confirm(reset_client, token, "someone-elses-password")
    assert again.status_code == 400
    assert "invalid or has expired" in again.get_json()["error"]
    login(reset_client, "alice@example.com", NEW_PASSWORD)


def test_unknown_email_gets_the_same_answer_and_no_email(reset_client, sent):
    known = ask(reset_client, "alice@example.com")
    unknown = ask(reset_client, "nobody-here@example.com")
    assert known.status_code == unknown.status_code == 202
    assert known.get_json() == unknown.get_json()
    assert [to for to, _, _ in sent] == ["alice@example.com"]


def test_email_lookup_ignores_case_and_spaces(reset_client, sent):
    assert ask(reset_client, "  Alice@Example.COM ").status_code == 202
    assert [to for to, _, _ in sent] == ["alice@example.com"]


def test_only_a_hash_of_the_token_is_stored(reset_app, reset_client, sent):
    ask(reset_client)
    token = token_from(sent)
    with reset_app.app_context():
        row = PasswordResetToken.query.one()
        assert row.token_hash != token
        assert token not in row.token_hash
        assert len(row.token_hash) == 64


def test_expired_link_is_refused(reset_app, reset_client, sent):
    ask(reset_client)
    token = token_from(sent)
    with reset_app.app_context():
        row = PasswordResetToken.query.one()
        row.expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    assert confirm(reset_client, token).status_code == 400
    login(reset_client, "alice@example.com", BUYER_PASSWORD)


def test_links_expire_after_the_configured_minutes(reset_app, reset_client, sent):
    before = utcnow()
    ask(reset_client)
    with reset_app.app_context():
        row = PasswordResetToken.query.one()
        lifetime = row.expires_at - before
        assert timedelta(minutes=59) < lifetime <= timedelta(minutes=61)


def test_asking_again_retires_the_older_link(reset_client, sent):
    ask(reset_client)
    first = token_from(sent)
    ask(reset_client)
    second = token_from(sent)
    assert first != second
    assert confirm(reset_client, first).status_code == 400
    assert confirm(reset_client, second).status_code == 200


def test_at_most_three_links_an_hour(reset_client, sent):
    for _ in range(5):
        assert ask(reset_client).status_code == 202
    assert len(sent) == 3


def test_bad_tokens_and_short_passwords_are_refused(reset_client, sent):
    assert confirm(reset_client, "not-a-real-token").status_code == 400
    assert confirm(reset_client, "").status_code == 400
    assert confirm(reset_client, "x" * 500).status_code == 400
    assert reset_client.post("/password-reset/confirm", json={"password": NEW_PASSWORD}).status_code == 400

    ask(reset_client)
    token = token_from(sent)
    short = confirm(reset_client, token, "short")
    assert short.status_code == 400
    assert "at least 8" in short.get_json()["error"]
    # A refused password does not spend the link.
    assert confirm(reset_client, token).status_code == 200


def test_request_needs_an_email_shaped_address(reset_client, sent):
    assert reset_client.post("/password-reset/request", json={}).status_code == 400
    assert ask(reset_client, "not-an-email").status_code == 400
    assert sent == []


def test_off_by_default_answers_the_same_and_creates_nothing(app, client, sent):
    response = ask(client)
    assert response.status_code == 202
    assert response.get_json()["email_enabled"] is False
    assert sent == []
    with app.app_context():
        assert PasswordResetToken.query.count() == 0
    assert client.get("/config").get_json()["password_reset_enabled"] is False


@pytest.mark.parametrize(
    "missing", ["PASSWORD_RESET_EMAILS", "RESEND_API_KEY", "MESSAGE_EMAIL_FROM"]
)
def test_each_setting_is_required(make_app, sent, missing):
    config = dict(RESET_ON)
    config[missing] = "" if missing != "PASSWORD_RESET_EMAILS" else False
    client = make_app(**config).test_client()
    assert ask(client).get_json()["email_enabled"] is False
    assert client.get("/config").get_json()["password_reset_enabled"] is False
    assert sent == []


def test_message_notice_switch_alone_does_not_send_reset_emails(make_app, sent):
    client = make_app(
        MESSAGE_EMAIL_NOTIFICATIONS=True,
        RESEND_API_KEY="re_test_placeholder",
        MESSAGE_EMAIL_FROM="hello@neighborhoodcandylady.com",
        MESSAGE_EMAIL_SYNC=True,
    ).test_client()
    ask(client)
    assert sent == []


def test_config_reports_reset_on_when_configured(reset_client):
    assert reset_client.get("/config").get_json()["password_reset_enabled"] is True


def test_a_failed_send_still_answers_the_same(reset_client, monkeypatch):
    def broken(*_args, **_kwargs):
        raise OSError("resend is down")

    monkeypatch.setattr(mailer.urllib.request, "urlopen", broken)
    response = ask(reset_client)
    assert response.status_code == 202


def test_deleting_the_account_removes_its_reset_links(reset_app, reset_client, sent):
    ask(reset_client)
    token = token_from(sent)
    buyer = login(reset_client, "alice@example.com", BUYER_PASSWORD)
    assert buyer.delete("/me").status_code == 204
    with reset_app.app_context():
        assert PasswordResetToken.query.count() == 0
    assert confirm(reset_client, token).status_code == 400
