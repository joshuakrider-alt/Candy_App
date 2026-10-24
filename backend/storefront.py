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


# How a shop is labeled on its page, its /shops card, orders and messages.
# It is a title the seller picks, not a question about who they are: nothing
# here (or anywhere) asks for or stores a seller's gender.
SHOP_TITLE_PRESETS = ("Candy Lady", "Candy Woman", "Candy Guy", "Candy Man", "Candy Shop")
# Every shop that existed before titles keeps the site's original wording, and
# it is also the column's database default, so code from before this change
# can still insert shops after a rollback without knowing the column exists.
LEGACY_SHOP_TITLE = "Candy Lady"
# Preselected for new shops in onboarding and used when an application leaves
# the field out.
DEFAULT_SHOP_TITLE = "Candy Shop"
SHOP_TITLE_MIN_LENGTH = 2
SHOP_TITLE_MAX_LENGTH = 24

# Letters (any script), digits, spaces and a little punctuation a title might
# reasonably use. Anything else (emoji, symbols, markup) is refused rather
# than stripped, so the seller sees exactly what will be shown.
SHOP_TITLE_PATTERN = re.compile(r"^[^\W_](?:(?:[^\W_]|[ '’&.\-])*[^\W_]\.?)?$", re.UNICODE)

# A basic filter, not a moderation system: it stops the obvious cases and
# leaves the rest to admin review. Whole words only, so "Scunthorpe"-style
# false positives (a "Grass Hopper Candy" title) do not trip it.
_BLOCKED_WORDS = frozenset(
    {
        "ass", "asses", "asshole", "bastard", "bitch", "bitches", "bollocks",
        "boner", "boob", "boobs", "butthole", "cock", "cocks", "crap", "cum",
        "cunt", "damn", "dick", "dicks", "dildo", "dyke", "fag", "fags",
        "faggot", "fuck", "fucker", "fucking", "fucks", "goddamn", "hoe",
        "hoes", "jizz", "kike", "milf", "motherfucker", "nazi", "nigga",
        "nigger", "piss", "porn", "pussy", "rape", "retard", "sex", "sexy",
        "shit", "shits", "shitty", "slut", "sluts", "spic", "tit", "tits",
        "titty", "twat", "whore", "whores", "wank", "wanker",
    }
)
# Roots that are never innocent inside a longer word ("Candy Fuckboy"). Runs
# of single letters are joined first so "f.u.c.k" or "s h i t" are caught,
# but separate words are not, so "Push It Candy" stays allowed.
_BLOCKED_ROOTS = ("fuck", "shit", "cunt", "nigg", "faggot", "motherf", "whore")
# Titles that would read as speaking for the site itself.
_RESERVED_TITLE_WORDS = frozenset({"admin", "administrator", "moderator", "official", "staff", "support"})
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def _title_words(value):
    lowered = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    lowered = lowered.translate(_LEET)
    return re.findall(r"[a-z]+", lowered)


def _join_spelled_out(words):
    """["f", "u", "c", "k", "candy"] -> ["fuck", "candy"]: glue letter runs."""
    pieces, run = [], ""
    for word in words:
        if len(word) == 1:
            run += word
            continue
        if run:
            pieces.append(run)
            run = ""
        pieces.append(word)
    if run:
        pieces.append(run)
    return pieces


def shop_title_problem(title):
    """Why a custom title is unacceptable, or None. Presets always pass."""
    if title in SHOP_TITLE_PRESETS:
        return None
    if len(title) < SHOP_TITLE_MIN_LENGTH or len(title) > SHOP_TITLE_MAX_LENGTH:
        return f"title must be {SHOP_TITLE_MIN_LENGTH}-{SHOP_TITLE_MAX_LENGTH} characters"
    if not SHOP_TITLE_PATTERN.match(title):
        return "title may only use letters, numbers, spaces and ' & . -"
    words = _title_words(title)
    pieces = _join_spelled_out(words)
    if any(word in _BLOCKED_WORDS for word in pieces) or any(
        root in word for word in pieces for root in _BLOCKED_ROOTS
    ):
        return "please pick a different title"
    if any(word in _RESERVED_TITLE_WORDS for word in words):
        return "that title sounds like site staff; pick another"
    return None


def normalize_shop_title(raw):
    """The title to store, or raise ValueError.

    Trims and collapses inner whitespace, and matches a preset regardless of
    case ("candy guy" is stored as "Candy Guy"). Blank is an error rather than
    a silent reset: a seller who clears the box should be told to pick one.
    """
    value = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not value:
        raise ValueError("pick a title for your shop")
    for preset in SHOP_TITLE_PRESETS:
        if value.casefold() == preset.casefold():
            return preset
    problem = shop_title_problem(value)
    if problem:
        raise ValueError(problem)
    return value
