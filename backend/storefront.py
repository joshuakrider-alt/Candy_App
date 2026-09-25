"""Per-shop storefront identity: public slug and light theme.

A shop's slug is its public address (`/s/<slug>`), so it is treated like a
username: lowercase, URL-safe, unique, and never one of the words the site
itself needs for routing. The theme is two optional hex colours. They are
validated to exactly `#RRGGBB` because they end up in a CSS custom property on
a public page, and a free-form string there is a style-injection hole.

Everything here is plain Python so models, migrations and tests can import it
without an application context.
"""

import re
import unicodedata

SLUG_MIN_LENGTH = 3
SLUG_MAX_LENGTH = 48
TAGLINE_MAX_LENGTH = 140

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")

# Names that would be confusing or misleading as a shop address, or that the
# frontend may want for its own pages later.
RESERVED_SLUGS = frozenset(
    {
        "about",
        "admin",
        "api",
        "app",
        "apply",
        "buyer",
        "candy-lady",
        "candylady",
        "checkout",
        "config",
        "contact",
        "faq",
        "help",
        "login",
        "logout",
        "me",
        "new",
        "official",
        "pickup",
        "privacy",
        "s",
        "seller",
        "sellers",
        "settings",
        "shop",
        "shops",
        "signup",
        "static",
        "stripe",
        "support",
        "terms",
        "the-candy-lady",
        "www",
    }
)


def slugify(text):
    """Best-effort URL slug from free text. May return an empty string."""
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    # Drop apostrophes instead of turning them into dashes: "Kiki's" -> "kikis".
    ascii_text = re.sub(r"['’]", "", ascii_text)
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    if len(slug) > SLUG_MAX_LENGTH:
        slug = slug[:SLUG_MAX_LENGTH].rstrip("-")
    return slug


def slug_problem(slug):
    """Why a proposed slug is unacceptable, or None if its shape is fine.

    Uniqueness is checked separately, against the database.
    """
    if not slug:
        return "slug is required"
    if len(slug) < SLUG_MIN_LENGTH or len(slug) > SLUG_MAX_LENGTH:
        return (
            f"slug must be {SLUG_MIN_LENGTH}-{SLUG_MAX_LENGTH} characters"
        )
    if not SLUG_PATTERN.match(slug):
        return "slug may only use lowercase letters, numbers, and single dashes"
    if slug in RESERVED_SLUGS:
        return "that address is reserved; pick another"
    return None


def normalize_slug(raw):
    """Lowercase and trim what a seller typed, without otherwise rewriting it.

    A seller who types "Kiki's Spot" gets told why it is invalid rather than
    silently receiving "kikis-spot"; the generator is for approval time only.
    """
    return str(raw or "").strip().lower()


def unique_slug(base_text, is_taken, fallback="snack-spot"):
    """A free slug derived from `base_text`, suffixing -2, -3, ... on clashes.

    `is_taken(candidate)` answers whether the database already has it.
    """
    base = slugify(base_text)
    if len(base) < SLUG_MIN_LENGTH or base in RESERVED_SLUGS:
        base = slugify(f"{base}-{fallback}") if base else fallback
    base = base[: SLUG_MAX_LENGTH - 4].rstrip("-")

    candidate = base
    suffix = 2
    while slug_problem(candidate) or is_taken(candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


LOGO_URL_MAX_LENGTH = 500


def normalize_logo_url(raw):
    """An https URL with a host, None for blank, or raise ValueError.

    https only: the storefront is served over https, so an http image would be
    blocked as mixed content anyway, and `javascript:`/`data:` never belong in
    an <img src>. There is no upload pipeline for logos yet; a seller can point
    at an image they already host (or an approved photo URL from this site).
    """
    from urllib.parse import urlparse

    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if len(value) > LOGO_URL_MAX_LENGTH:
        raise ValueError(f"logo_url must be {LOGO_URL_MAX_LENGTH} characters or fewer")
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or any(c.isspace() for c in value):
        raise ValueError("logo_url must be an https:// link to an image")
    return value


def normalize_hex_color(raw):
    """`#rrggbb` (lowercased), None for blank, or raise ValueError."""
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if not HEX_COLOR_PATTERN.match(value):
        raise ValueError("colors must be hex like #C41E3A")
    return value.lower()


def readable_text_on(hex_color):
    """Black or white, whichever reads better on the given background.

    Uses WCAG relative luminance so a seller who picks a pale yellow still gets
    legible buttons without having to think about contrast.
    """
    if not hex_color:
        return None
    channels = []
    for index in (1, 3, 5):
        value = int(hex_color[index : index + 2], 16) / 255
        channels.append(
            value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4
        )
    luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    # Contrast against white vs. against black; pick the larger.
    return "#ffffff" if (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) else "#1a1a1a"
