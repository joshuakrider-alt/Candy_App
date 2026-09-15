"""Object storage for user-uploaded images.

Images never pass through this API. The browser asks for a presigned URL,
uploads straight to the bucket, and then tells us the key it wrote. That keeps
multi-megabyte phone photos off Render's free tier, where a slow upload would
otherwise occupy a request worker for its whole duration.

The bucket is addressed with the S3 API, so Cloudflare R2, Amazon S3, Backblaze
B2 and MinIO are all reachable by changing environment variables alone. R2 is
what this was written against: it speaks S3, and it does not bill for egress,
which matters when every storefront view serves the same photos again.

Nothing here is a security boundary on its own. A presigned PUT tells the
bucket "someone may write this one key for the next few minutes"; it cannot
police what they actually write. So `verify_uploaded_object` re-reads the
object afterwards and the caller refuses anything that does not match what was
promised. Content that is a real image but the wrong *kind* of image is a
judgement no library makes -- that is what the moderation queue is for.
"""

import logging
import mimetypes
import os
import secrets
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Deliberately narrow. HEIC is what an iPhone shoots by default, but browsers
# cannot re-encode it in a canvas, so the frontend converts to JPEG before
# upload and never asks for a HEIC key.
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# The frontend downscales to roughly 1600px and re-encodes, which lands well
# under this. The cap is here for everything that does not go through the
# frontend.
DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024

# Long enough for a phone on a bad connection, short enough that a leaked URL
# is not a standing write grant.
PRESIGN_EXPIRY_SECONDS = 600

PURPOSES = ("candy_photo", "profile_photo")


class StorageNotConfigured(RuntimeError):
    """Raised when an upload is attempted before the bucket env vars are set."""


def _config(app_config, name, default=""):
    return (app_config.get(name) or os.environ.get(name) or default).strip()


def max_upload_bytes(app_config):
    raw = app_config.get("MAX_UPLOAD_BYTES") or os.environ.get("MAX_UPLOAD_BYTES")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MAX_UPLOAD_BYTES
    return value if value > 0 else DEFAULT_MAX_UPLOAD_BYTES


def is_configured(app_config):
    return all(
        _config(app_config, name)
        for name in ("STORAGE_BUCKET", "STORAGE_ENDPOINT_URL", "STORAGE_ACCESS_KEY_ID",
                     "STORAGE_SECRET_ACCESS_KEY")
    )


def _client(app_config):
    if not is_configured(app_config):
        raise StorageNotConfigured(
            "image storage is not configured on this deployment"
        )
    try:
        import boto3
        from botocore.config import Config
    except ImportError as error:  # pragma: no cover - dependency is in requirements
        raise StorageNotConfigured("boto3 is not installed") from error

    return boto3.client(
        "s3",
        endpoint_url=_config(app_config, "STORAGE_ENDPOINT_URL"),
        aws_access_key_id=_config(app_config, "STORAGE_ACCESS_KEY_ID"),
        aws_secret_access_key=_config(app_config, "STORAGE_SECRET_ACCESS_KEY"),
        # R2 ignores the region but the SDK insists on one being present.
        region_name=_config(app_config, "STORAGE_REGION", "auto"),
        config=Config(signature_version="s3v4"),
    )


def build_object_key(purpose, owner_id, content_type):
    """A key the uploader cannot choose.

    The random suffix is what stops one seller from guessing, overwriting or
    probing another seller's keys, and it means a re-upload never silently
    replaces the photo an admin already approved.
    """
    if purpose not in PURPOSES:
        raise ValueError(f"unknown upload purpose: {purpose}")
    extension = ALLOWED_CONTENT_TYPES.get(content_type, ".bin")
    stamp = datetime.now(timezone.utc).strftime("%Y/%m")
    return f"{purpose}/{stamp}/{int(owner_id)}-{secrets.token_urlsafe(16)}{extension}"


def create_upload_url(app_config, key, content_type):
    """Presign a single PUT of exactly this key and content type."""
    client = _client(app_config)
    url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": _config(app_config, "STORAGE_BUCKET"),
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGN_EXPIRY_SECONDS,
    )
    return {"upload_url": url, "key": key, "expires_in": PRESIGN_EXPIRY_SECONDS}


def verify_uploaded_object(app_config, key, expected_content_type, size_limit):
    """Re-read what was actually written, or return None if it is unusable.

    The presigned URL bound the content type, but not the length, so a caller
    could still push something far larger than they declared. Checking after
    the fact is what makes the declared size meaningful.
    """
    client = _client(app_config)
    bucket = _config(app_config, "STORAGE_BUCKET")
    try:
        head = client.head_object(Bucket=bucket, Key=key)
    except Exception:
        logger.info("upload confirm: no object at key %s", key)
        return None

    content_type = (head.get("ContentType") or "").split(";")[0].strip().lower()
    byte_size = int(head.get("ContentLength") or 0)

    if content_type != expected_content_type or content_type not in ALLOWED_CONTENT_TYPES:
        logger.warning("upload confirm: content type mismatch for %s (%s)", key, content_type)
        return None
    if byte_size <= 0 or byte_size > size_limit:
        logger.warning("upload confirm: size %s out of range for %s", byte_size, key)
        return None

    return {"key": key, "content_type": content_type, "byte_size": byte_size}


def delete_object(app_config, key):
    """Best effort. A leftover object costs storage; a failed delete must not
    block the user-facing action that triggered it."""
    if not key:
        return
    try:
        client = _client(app_config)
        client.delete_object(Bucket=_config(app_config, "STORAGE_BUCKET"), Key=key)
    except Exception:  # pragma: no cover - depends on bucket permissions
        logger.warning("could not delete object %s", key, exc_info=True)


def public_url(app_config, key):
    """Where a browser can fetch the object.

    Serving is deliberately not proxied through this API: the bucket (or the
    CDN in front of it) does that far better than a free-tier dyno. If no
    public base is configured, callers get None and the UI shows a placeholder
    rather than a broken image.
    """
    if not key:
        return None
    base = _config(app_config, "STORAGE_PUBLIC_BASE_URL")
    if not base:
        return None
    return f"{base.rstrip('/')}/{key.lstrip('/')}"


def guess_content_type(filename):
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed if guessed in ALLOWED_CONTENT_TYPES else None
