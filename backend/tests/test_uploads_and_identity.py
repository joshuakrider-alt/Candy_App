"""Photo uploads and Stripe Identity.

The bucket and Stripe are both faked. What is being tested is our side of the
contract: who may ask for an upload URL, what happens to an object that does not
match what was promised, and the rule that nothing a seller uploads reaches a
buyer without a person approving it first.
"""

import pytest

import identity
import storage


class FakeBucket:
    """Just enough of an object store to test against.

    `put` is what the browser would do with the presigned URL. Nothing calls it
    automatically, so a test can deliberately confirm a key that was never
    uploaded and watch the API reject it.
    """

    def __init__(self):
        self.objects = {}
        self.signed = []
        self.deleted = []

    def create_upload_url(self, _config, key, content_type):
        self.signed.append((key, content_type))
        return {
            "upload_url": f"https://bucket.test/{key}?signature=fake",
            "key": key,
            "expires_in": storage.PRESIGN_EXPIRY_SECONDS,
        }

    def put(self, key, content_type="image/jpeg", byte_size=1024):
        self.objects[key] = {"content_type": content_type, "byte_size": byte_size}

    def verify_uploaded_object(self, _config, key, expected_content_type, size_limit):
        stored = self.objects.get(key)
        if stored is None:
            return None
        if stored["content_type"] != expected_content_type:
            return None
        if stored["byte_size"] <= 0 or stored["byte_size"] > size_limit:
            return None
        return {"key": key, **stored}

    def delete_object(self, _config, key):
        self.deleted.append(key)
        self.objects.pop(key, None)


@pytest.fixture
def bucket(monkeypatch):
    fake = FakeBucket()
    monkeypatch.setattr(storage, "is_configured", lambda _config: True)
    monkeypatch.setattr(storage, "create_upload_url", fake.create_upload_url)
    monkeypatch.setattr(storage, "verify_uploaded_object", fake.verify_uploaded_object)
    monkeypatch.setattr(storage, "delete_object", fake.delete_object)
    monkeypatch.setattr(
        storage, "public_url", lambda _config, key: f"https://cdn.test/{key}"
    )
    return fake


class FakeIdentity:
    def __init__(self):
        self.sessions = {}
        self.next_id = 1
        self.canceled = []

    def create(self, **params):
        session_id = f"vs_test_{self.next_id}"
        self.next_id += 1
        session = {
            "id": session_id,
            "status": "processing",
            "url": f"https://verify.stripe.test/{session_id}",
            "metadata": params.get("metadata") or {},
            "options": params.get("options") or {},
        }
        self.sessions[session_id] = session
        return session

    def retrieve(self, session_id, **_kwargs):
        return self.sessions[session_id]

    def cancel(self, session_id, **_kwargs):
        self.canceled.append(session_id)
        self.sessions[session_id]["status"] = "canceled"
        return self.sessions[session_id]

    def mark_verified(self, session_id):
        self.sessions[session_id]["status"] = "verified"

    def mark_requires_input(self, session_id, code="selfie_face_mismatch"):
        self.sessions[session_id].update(
            status="requires_input", last_error={"code": code, "reason": "nope"}
        )


@pytest.fixture
def fake_identity(monkeypatch):
    fake = FakeIdentity()
    monkeypatch.setattr(
        identity.stripe.identity.VerificationSession,
        "create",
        lambda **params: fake.create(**params),
    )
    monkeypatch.setattr(
        identity.stripe.identity.VerificationSession,
        "retrieve",
        lambda session_id, **kwargs: fake.retrieve(session_id, **kwargs),
    )
    monkeypatch.setattr(
        identity.stripe.identity.VerificationSession,
        "cancel",
        lambda session_id, **kwargs: fake.cancel(session_id, **kwargs),
    )
    return fake


def sign(user, purpose="candy_photo", content_type="image/jpeg", byte_size=2048):
    return user.post(
        "/uploads/sign",
        json={"purpose": purpose, "content_type": content_type, "byte_size": byte_size},
    )


def upload_candy_photo(bucket, seller_user, seller_id, caption=None):
    """The whole browser round trip: sign, PUT, confirm."""
    signed = sign(seller_user).get_json()
    bucket.put(signed["key"])
    body = {"key": signed["key"], "content_type": "image/jpeg"}
    if caption:
        body["caption"] = caption
    return seller_user.post(f"/sellers/{seller_id}/photos", json=body)


# ----------------------------------------------------------------------
# Signing
# ----------------------------------------------------------------------


def test_signing_an_upload_requires_a_login(client, bucket):
    response = client.post(
        "/uploads/sign",
        json={"purpose": "candy_photo", "content_type": "image/jpeg", "byte_size": 10},
    )
    assert response.status_code == 401


def test_a_buyer_cannot_upload_candy_photos(buyer, bucket):
    assert sign(buyer, purpose="candy_photo").status_code == 403


def test_a_buyer_can_still_upload_their_own_profile_photo(buyer, bucket):
    assert sign(buyer, purpose="profile_photo").status_code == 201


def test_non_image_uploads_are_refused(kiki_seller, bucket):
    response = sign(kiki_seller, content_type="application/pdf")
    assert response.status_code == 400
    assert "JPEG" in response.get_json()["error"]


def test_an_oversized_upload_is_refused_before_it_starts(kiki_seller, bucket, app):
    too_big = storage.max_upload_bytes(app.config) + 1
    response = sign(kiki_seller, byte_size=too_big)
    assert response.status_code == 413
    # Nothing was signed, so nothing could have been written.
    assert bucket.signed == []


def test_uploads_are_refused_when_no_bucket_is_configured(kiki_seller, monkeypatch):
    monkeypatch.setattr(storage, "is_configured", lambda _config: False)
    assert sign(kiki_seller).status_code == 503


# ----------------------------------------------------------------------
# Confirming
# ----------------------------------------------------------------------


def test_confirming_a_key_that_was_never_uploaded_is_refused(kiki_seller, bucket):
    seller_id = kiki_seller.user["seller_id"]
    signed = sign(kiki_seller).get_json()
    # Deliberately skip the PUT.
    response = kiki_seller.post(
        f"/sellers/{seller_id}/photos",
        json={"key": signed["key"], "content_type": "image/jpeg"},
    )
    assert response.status_code == 400
    assert "could not be verified" in response.get_json()["error"]


def test_an_object_larger_than_promised_is_rejected_and_deleted(
    kiki_seller, bucket, app
):
    seller_id = kiki_seller.user["seller_id"]
    signed = sign(kiki_seller, byte_size=2048).get_json()
    # A presigned PUT cannot constrain length, so this is what a client that
    # ignores its own declared size would produce.
    bucket.put(signed["key"], byte_size=storage.max_upload_bytes(app.config) + 1)

    response = kiki_seller.post(
        f"/sellers/{seller_id}/photos",
        json={"key": signed["key"], "content_type": "image/jpeg"},
    )
    assert response.status_code == 400
    assert signed["key"] in bucket.deleted


def test_a_seller_cannot_claim_another_accounts_upload(
    kiki_seller, northview_seller, bucket
):
    """Keys carry the account that asked for them, so replaying someone else's
    key must not attach their image to your shop."""
    other_key = sign(northview_seller).get_json()["key"]
    bucket.put(other_key)

    response = kiki_seller.post(
        f"/sellers/{kiki_seller.user['seller_id']}/photos",
        json={"key": other_key, "content_type": "image/jpeg"},
    )
    assert response.status_code == 403


def test_a_seller_cannot_post_photos_to_another_shop(kiki_seller, northview_seller, bucket):
    signed = sign(kiki_seller).get_json()
    bucket.put(signed["key"])
    response = kiki_seller.post(
        f"/sellers/{northview_seller.user['seller_id']}/photos",
        json={"key": signed["key"], "content_type": "image/jpeg"},
    )
    assert response.status_code == 403


# ----------------------------------------------------------------------
# Moderation
# ----------------------------------------------------------------------


def test_an_uploaded_photo_is_not_public_until_an_admin_approves_it(
    client, kiki_seller, admin, bucket
):
    seller_id = kiki_seller.user["seller_id"]
    created = upload_candy_photo(bucket, kiki_seller, seller_id, caption="Sour gummies")
    assert created.status_code == 201
    photo = created.get_json()
    assert photo["status"] == "pending"

    # The seller sees their own pending photo.
    mine = kiki_seller.get(f"/sellers/{seller_id}/photos").get_json()
    assert [item["id"] for item in mine] == [photo["id"]]

    # A buyer browsing the shop does not.
    public = client.get("/sellers").get_json()
    shop = next(item for item in public if item["id"] == seller_id)
    assert shop["photos"] == []

    approved = admin.put(f"/admin/photos/{photo['id']}", json={"status": "approved"})
    assert approved.status_code == 200

    public = client.get("/sellers").get_json()
    shop = next(item for item in public if item["id"] == seller_id)
    assert [item["id"] for item in shop["photos"]] == [photo["id"]]
    assert shop["photos"][0]["url"].endswith(photo["url"].rsplit("/", 1)[-1])


def test_rejecting_a_photo_removes_the_image_from_storage(kiki_seller, admin, bucket):
    seller_id = kiki_seller.user["seller_id"]
    photo = upload_candy_photo(bucket, kiki_seller, seller_id).get_json()

    response = admin.put(
        f"/admin/photos/{photo['id']}",
        json={"status": "rejected", "rejection_reason": "That is not a snack."},
    )
    assert response.status_code == 200
    assert response.get_json()["rejection_reason"] == "That is not a snack."

    stored_key = next(key for key, _ in bucket.signed)
    assert stored_key in bucket.deleted


def test_only_an_admin_can_review_photos(kiki_seller, bucket):
    seller_id = kiki_seller.user["seller_id"]
    photo = upload_candy_photo(bucket, kiki_seller, seller_id).get_json()
    assert kiki_seller.put(
        f"/admin/photos/{photo['id']}", json={"status": "approved"}
    ).status_code == 403


def test_replacing_a_profile_photo_sends_it_back_for_review(kiki_seller, admin, bucket):
    seller_id = kiki_seller.user["seller_id"]

    def upload_profile():
        signed = sign(kiki_seller, purpose="profile_photo").get_json()
        bucket.put(signed["key"])
        return kiki_seller.put(
            f"/sellers/{seller_id}/profile-photo",
            json={"key": signed["key"], "content_type": "image/jpeg"},
        )

    assert upload_profile().status_code == 200
    admin.put(f"/admin/sellers/{seller_id}/profile-photo", json={"status": "approved"})

    replaced = upload_profile()
    assert replaced.status_code == 200
    # An approved photo must not be silently swappable for an unreviewed one.
    assert replaced.get_json()["profile_photo_status"] == "pending"
    assert replaced.get_json()["profile_photo_url"] is None


def test_a_seller_can_remove_their_own_photo(kiki_seller, bucket):
    seller_id = kiki_seller.user["seller_id"]
    photo = upload_candy_photo(bucket, kiki_seller, seller_id).get_json()
    assert kiki_seller.delete(f"/sellers/{seller_id}/photos/{photo['id']}").status_code == 204
    assert kiki_seller.get(f"/sellers/{seller_id}/photos").get_json() == []


# ----------------------------------------------------------------------
# Identity verification
# ----------------------------------------------------------------------


def test_starting_verification_asks_stripe_for_a_selfie_match(kiki_seller, fake_identity):
    response = kiki_seller.post("/identity/session")
    assert response.status_code == 201
    body = response.get_json()
    assert body["url"].startswith("https://verify.stripe.test/")
    assert body["identity_status"] == "processing"
    assert body["identity_verified"] is False

    session = fake_identity.sessions[body["url"].rsplit("/", 1)[-1]]
    # Without this the check proves the document is real, not that the person
    # holding it is the person on it.
    assert session["options"]["document"]["require_matching_selfie"] is True


def test_a_buyer_cannot_start_seller_verification(buyer, fake_identity):
    assert buyer.post("/identity/session").status_code == 403


def test_refresh_picks_up_a_verdict_without_any_webhook(kiki_seller, fake_identity):
    """The webhook needs a signing secret that may not be set. Verification has
    to be able to complete anyway."""
    started = kiki_seller.post("/identity/session").get_json()
    session_id = started["url"].rsplit("/", 1)[-1]
    fake_identity.mark_verified(session_id)

    refreshed = kiki_seller.post("/identity/refresh").get_json()
    assert refreshed["identity_status"] == "verified"
    assert refreshed["identity_verified"] is True
    assert refreshed["identity_verified_at"] is not None


def test_a_failed_check_explains_itself_in_plain_language(kiki_seller, fake_identity):
    started = kiki_seller.post("/identity/session").get_json()
    session_id = started["url"].rsplit("/", 1)[-1]
    fake_identity.mark_requires_input(session_id, "selfie_face_mismatch")

    refreshed = kiki_seller.post("/identity/refresh").get_json()
    assert refreshed["identity_status"] == "requires_input"
    assert "did not match" in refreshed["identity_error"]


def test_restarting_cancels_the_abandoned_session(kiki_seller, fake_identity):
    first = kiki_seller.post("/identity/session").get_json()
    first_id = first["url"].rsplit("/", 1)[-1]

    second = kiki_seller.post("/identity/session").get_json()
    assert first_id in fake_identity.canceled
    assert second["url"].rsplit("/", 1)[-1] != first_id


def test_verification_shows_on_the_public_shop(client, kiki_seller, fake_identity):
    seller_id = kiki_seller.user["seller_id"]
    started = kiki_seller.post("/identity/session").get_json()
    fake_identity.mark_verified(started["url"].rsplit("/", 1)[-1])
    kiki_seller.post("/identity/refresh")

    shop = next(
        item for item in client.get("/sellers").get_json() if item["id"] == seller_id
    )
    # A trust signal, and nothing about who the person actually is.
    assert shop["identity_verified"] is True
    assert "contact_email" not in shop


# ----------------------------------------------------------------------
# Approval gate
# ----------------------------------------------------------------------


def test_the_webhook_records_a_verdict_for_the_right_account(make_app, fake_identity):
    """Identity events land on the same endpoint as payment events, so the
    routing between them is worth pinning down."""
    from tests.test_payments import WEBHOOK_SECRET, signed_webhook

    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()

    from tests.conftest import SELLER_PASSWORD, login

    seller = login(client, "kiki@example.com", SELLER_PASSWORD)
    started = seller.post("/identity/session").get_json()
    session_id = started["url"].rsplit("/", 1)[-1]

    body, headers = signed_webhook(
        {
            "id": "evt_identity_1",
            "type": "identity.verification_session.verified",
            "data": {
                "object": {
                    "id": session_id,
                    "status": "verified",
                    "metadata": {"user_id": str(seller.user["id"])},
                }
            },
        }
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.status_code == 200
    assert response.get_json() == {"received": True, "handled": True}
    assert seller.get("/identity/status").get_json()["identity_verified"] is True


def test_an_identity_event_for_nobody_is_acknowledged_but_not_applied(
    make_app, fake_identity
):
    from tests.test_payments import WEBHOOK_SECRET, signed_webhook

    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()

    body, headers = signed_webhook(
        {
            "id": "evt_identity_2",
            "type": "identity.verification_session.verified",
            "data": {"object": {"id": "vs_unknown", "status": "verified", "metadata": {}}},
        }
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    # Acknowledged so Stripe stops retrying, but nothing was changed.
    assert response.status_code == 200
    assert response.get_json() == {"received": True, "handled": False}


def test_a_late_event_from_a_replaced_identity_session_is_ignored(
    make_app, fake_identity
):
    """Stripe does not promise that webhooks arrive in creation order.  A
    canceled first attempt must not replace the active session's state."""
    from tests.test_payments import WEBHOOK_SECRET, signed_webhook

    app = make_app(STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET)
    client = app.test_client()

    from tests.conftest import SELLER_PASSWORD, login

    seller = login(client, "kiki@example.com", SELLER_PASSWORD)
    first = seller.post("/identity/session").get_json()
    first_id = first["url"].rsplit("/", 1)[-1]
    second = seller.post("/identity/session").get_json()
    second_id = second["url"].rsplit("/", 1)[-1]

    body, headers = signed_webhook(
        {
            "id": "evt_identity_late",
            "type": "identity.verification_session.canceled",
            "data": {
                "object": {
                    "id": first_id,
                    "status": "canceled",
                    "metadata": {"user_id": str(seller.user["id"])},
                }
            },
        }
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)

    assert response.status_code == 200
    assert response.get_json() == {"received": True, "handled": False}
    assert seller.get("/identity/status").get_json()["identity_status"] == "processing"
    assert fake_identity.sessions[second_id]["status"] == "processing"


def test_approval_can_be_gated_on_verification(make_app, fake_identity):
    app = make_app(REQUIRE_SELLER_IDENTITY=True)
    client = app.test_client()

    from tests.conftest import ADMIN_PASSWORD, login

    admin = login(client, "admin@example.com", ADMIN_PASSWORD)
    applied = client.post(
        "/applications",
        json={
            "shop_name": "Corner Sweets",
            "contact_name": "Sam Reed",
            "neighborhood": "Eastside",
            "pickup_window": "Weekends, 1 PM - 5 PM",
            "email": "sam@example.com",
            "password": "corner-sweets-1",
        },
    )
    seller_id = applied.get_json()["seller"]["id"]

    blocked = admin.put(f"/applications/{seller_id}", json={"status": "approved"})
    assert blocked.status_code == 409
    assert "identity verification" in blocked.get_json()["error"]

    # Turning an unverified shop down never needs a verification first.
    assert admin.put(
        f"/applications/{seller_id}", json={"status": "rejected"}
    ).status_code == 200

    seller = login(client, "sam@example.com", "corner-sweets-1")
    started = seller.post("/identity/session").get_json()
    fake_identity.mark_verified(started["url"].rsplit("/", 1)[-1])
    seller.post("/identity/refresh")

    assert admin.put(
        f"/applications/{seller_id}", json={"status": "approved"}
    ).status_code == 200


def test_approval_is_not_gated_by_default(admin, client, fake_identity):
    """The flag is off out of the box so this deploy cannot strand the shops
    that are already approved."""
    applied = client.post(
        "/applications",
        json={
            "shop_name": "Porch Pop",
            "contact_name": "Ada Lin",
            "neighborhood": "Riverside",
            "pickup_window": "Weekdays, 4 PM - 6 PM",
            "email": "ada@example.com",
            "password": "porch-pop-12",
        },
    )
    seller_id = applied.get_json()["seller"]["id"]
    assert admin.put(
        f"/applications/{seller_id}", json={"status": "approved"}
    ).status_code == 200
