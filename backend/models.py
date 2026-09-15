import secrets
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash


# Shared SQLAlchemy instance. It is initialized by the Flask application.
db = SQLAlchemy()


def utcnow():
    """Naive UTC, matching the existing DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

ROLES = ("buyer", "seller", "admin")

INVENTORY_STATUSES = ("in-stock", "low-stock", "out-of-stock")
ORDER_STATUSES = ("new", "packing", "ready", "completed")

# Every uploaded image starts hidden. Buyers here include children, the photos
# are shown publicly on a storefront, and no automated check can decide whether
# a picture is a bag of sour gummies or something that must never appear on the
# site. A person approves each one before anybody else can see it.
PHOTO_STATUSES = ("pending", "approved", "rejected")

# Mirrors identity.IDENTITY_STATUSES. Duplicated as a plain tuple so models.py
# stays importable without Stripe installed (the test suite and migrations both
# rely on that).
IDENTITY_STATUSES = (
    "unstarted",
    "processing",
    "requires_input",
    "verified",
    "canceled",
)

# "pay_at_pickup" only exists for orders created before online payment shipped.
PAYMENT_STATUSES = (
    "unpaid",
    "pending",
    "paid",
    "expired",
    "refunded",
    "pay_at_pickup",
)

# Payment states that let a seller see and fulfill an order.
FULFILLABLE_PAYMENT_STATUSES = ("paid", "pay_at_pickup")

PICKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def category_for_name(name):
    text = (name or "").lower()
    if any(word in text for word in ("chip", "puff", "nacho", "cheeto", "pretzel")):
        return "chips"
    if any(word in text for word in ("soda", "punch", "juice", "drink", "cola", "ade")):
        return "drinks"
    return "candy"


def generate_pickup_code():
    body = "".join(secrets.choice(PICKUP_CODE_ALPHABET) for _ in range(5))
    return f"CL-{body}"


def photo_url_for(key):
    """Public URL for a stored image, or None if it cannot be built.

    Imported lazily so models.py stays usable without an application context
    and without boto3 present -- migrations and several tests import this
    module before either exists.
    """
    if not key:
        return None
    try:
        from flask import current_app

        from storage import public_url

        return public_url(current_app.config, key)
    except Exception:
        return None


class User(db.Model):
    __tablename__ = "user"
    __table_args__ = (
        db.CheckConstraint(
            "role IN ('buyer', 'seller', 'admin')",
            name="ck_user_role",
        ),
        db.CheckConstraint(
            "photo_status IN ('pending', 'approved', 'rejected')",
            name="ck_user_photo_status",
        ),
        db.CheckConstraint(
            "identity_status IN ('unstarted', 'processing', 'requires_input', "
            "'verified', 'canceled')",
            name="ck_user_identity_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(255))
    role = db.Column(db.String(20), nullable=False, default="buyer")
    # Set for role="seller": the shop this login manages.
    seller_id = db.Column(db.Integer, db.ForeignKey("seller.id"))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    # Optional avatar, for buyers and sellers alike. Moderated like any other
    # uploaded image; an unapproved one is simply not shown.
    photo_key = db.Column(db.String(500))
    photo_status = db.Column(db.String(20), nullable=False, default="pending")

    # Stripe Identity verdict for this person. The ID document and the selfie
    # live in Stripe and are never copied here -- see identity.py for why.
    # identity_session_id is a Stripe object id (vs_...), not personal data.
    identity_status = db.Column(db.String(20), nullable=False, default="unstarted")
    identity_session_id = db.Column(db.String(255))
    identity_verified_at = db.Column(db.DateTime)
    identity_error_code = db.Column(db.String(100))

    orders = db.relationship("Order", back_populates="user", lazy=True)
    seller = db.relationship("Seller", back_populates="logins")

    @property
    def identity_verified(self):
        return self.identity_status == "verified"

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, raw_password)

    @property
    def has_password(self):
        return bool(self.password_hash)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "seller_id": self.seller_id,
            "has_password": self.has_password,
            "photo_url": photo_url_for(self.photo_key)
            if self.photo_status == "approved"
            else None,
            "photo_status": self.photo_status,
            "identity_status": self.identity_status,
            "identity_verified": self.identity_verified,
        }


class Seller(db.Model):
    __tablename__ = "seller"
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_seller_status",
        ),
        db.CheckConstraint(
            "profile_photo_status IN ('pending', 'approved', 'rejected')",
            name="ck_seller_profile_photo_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    shop_name = db.Column(db.String(200), nullable=False)
    contact_name = db.Column(db.String(120), nullable=False)
    contact_email = db.Column(db.String(200))
    neighborhood = db.Column(db.String(120), nullable=False)
    pickup_window = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")

    # The shopfront face: one photo of the person buyers will meet at pickup.
    # Distinct from the selfie Stripe Identity takes, which stays at Stripe.
    profile_photo_key = db.Column(db.String(500))
    profile_photo_status = db.Column(db.String(20), nullable=False, default="pending")

    inventory_items = db.relationship(
        "SellerInventory",
        back_populates="seller",
        cascade="all, delete-orphan",
        lazy=True,
    )
    orders = db.relationship("Order", back_populates="seller", lazy=True)
    logins = db.relationship("User", back_populates="seller", lazy=True)
    photos = db.relationship(
        "SellerPhoto",
        back_populates="seller",
        cascade="all, delete-orphan",
        lazy=True,
    )

    @property
    def owner(self):
        """The login this shop belongs to, if it has one.

        Applications create exactly one login per shop, so in practice this is
        that person. Ordered by id so a shop that later gains a second login
        keeps answering with the original owner rather than an arbitrary row.
        """
        logins = sorted(self.logins or [], key=lambda login: login.id)
        return logins[0] if logins else None

    @property
    def identity_status(self):
        owner = self.owner
        return owner.identity_status if owner else "unstarted"

    @property
    def identity_verified(self):
        return self.identity_status == "verified"

    def approved_photos(self):
        return [photo for photo in self.photos if photo.status == "approved"]

    def to_dict(self, include_contact_email=False, include_photos=True):
        data = {
            "id": self.id,
            "shop_name": self.shop_name,
            "contact_name": self.contact_name,
            "neighborhood": self.neighborhood,
            "pickup_window": self.pickup_window,
            "status": self.status,
            "profile_photo_url": photo_url_for(self.profile_photo_key)
            if self.profile_photo_status == "approved"
            else None,
            # A buyer-visible trust signal. It says the person behind the shop
            # passed an ID check, and nothing about who they are.
            "identity_verified": self.identity_verified,
        }
        if include_photos:
            data["photos"] = [photo.to_dict() for photo in self.approved_photos()]
        if include_contact_email:
            data["contact_email"] = self.contact_email
            data["profile_photo_status"] = self.profile_photo_status
            data["identity_status"] = self.identity_status
        return data


class Candy(db.Model):
    """Global catalog item; availability belongs to SellerInventory."""

    __tablename__ = "candy"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    price_cents = db.Column(db.Integer, nullable=False, default=0)

    seller_inventory = db.relationship(
        "SellerInventory",
        back_populates="candy",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price_cents": self.price_cents,
            "category": category_for_name(self.name),
        }


class SellerInventory(db.Model):
    """A seller's availability and quantity for one global catalog item."""

    __tablename__ = "seller_inventory"
    __table_args__ = (
        db.UniqueConstraint("seller_id", "candy_id", name="uq_seller_inventory_item"),
        db.CheckConstraint("inventory_count >= 0", name="ck_inventory_count_nonnegative"),
        db.CheckConstraint(
            "status IN ('in-stock', 'low-stock', 'out-of-stock')",
            name="ck_seller_inventory_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("seller.id"), nullable=False)
    candy_id = db.Column(db.Integer, db.ForeignKey("candy.id"), nullable=False)
    inventory_count = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="out-of-stock")

    seller = db.relationship("Seller", back_populates="inventory_items")
    candy = db.relationship("Candy", back_populates="seller_inventory")

    def apply_count_change(self, delta):
        """Adjust quantity and keep the stock label consistent with it."""
        self.inventory_count = max(0, (self.inventory_count or 0) + delta)
        if self.inventory_count == 0:
            self.status = "out-of-stock"
        elif self.inventory_count <= 4:
            self.status = "low-stock"
        else:
            self.status = "in-stock"

    def to_dict(self):
        return {
            "id": self.id,
            "seller_id": self.seller_id,
            "candy_id": self.candy_id,
            "inventory_count": self.inventory_count,
            "status": self.status,
            "candy": self.candy.to_dict() if self.candy else None,
        }


class SellerPhoto(db.Model):
    """One seller-uploaded picture of what is on their shelf.

    The image itself lives in object storage; this row is the record of it, and
    `status` is what decides whether anyone but the seller and an admin ever
    sees it.
    """

    __tablename__ = "seller_photo"
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_seller_photo_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("seller.id"), nullable=False)
    # Optional: which catalog item this is a picture of. A shop can also post
    # a general shelf shot that is not tied to one candy.
    candy_id = db.Column(db.Integer, db.ForeignKey("candy.id"))
    object_key = db.Column(db.String(500), nullable=False, unique=True)
    content_type = db.Column(db.String(100), nullable=False)
    byte_size = db.Column(db.Integer, nullable=False, default=0)
    caption = db.Column(db.String(200))
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    reviewed_at = db.Column(db.DateTime)
    reviewed_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    rejection_reason = db.Column(db.String(300))

    seller = db.relationship("Seller", back_populates="photos")
    candy = db.relationship("Candy")

    def to_dict(self):
        return {
            "id": self.id,
            "seller_id": self.seller_id,
            "candy_id": self.candy_id,
            "url": photo_url_for(self.object_key),
            "caption": self.caption,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "rejection_reason": self.rejection_reason,
        }


class Order(db.Model):
    __tablename__ = "order"
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('new', 'packing', 'ready', 'completed')",
            name="ck_order_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    # Nullable so an order survives its buyer deleting their account: the row
    # keeps the money and fulfillment details, minus any link to a person.
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    seller_id = db.Column(db.Integer, db.ForeignKey("seller.id"), nullable=False)
    total_cents = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="new")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    payment_status = db.Column(db.String(20), nullable=False, default="unpaid")
    platform_fee_cents = db.Column(db.Integer, nullable=False, default=0)
    currency = db.Column(db.String(10), nullable=False, default="usd")
    pickup_code = db.Column(db.String(32))
    stripe_checkout_session_id = db.Column(db.String(255))
    stripe_payment_intent_id = db.Column(db.String(255))
    paid_at = db.Column(db.DateTime)
    inventory_released_at = db.Column(db.DateTime)

    user = db.relationship("User", back_populates="orders")
    seller = db.relationship("Seller", back_populates="orders")
    items = db.relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy=True,
    )

    @property
    def seller_payout_cents(self):
        return max(0, (self.total_cents or 0) - (self.platform_fee_cents or 0))

    @property
    def is_fulfillable(self):
        return self.payment_status in FULFILLABLE_PAYMENT_STATUSES

    def to_dict(self, include_pickup_code=True):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "seller_id": self.seller_id,
            "status": self.status,
            "total_cents": self.total_cents,
            "payment_status": self.payment_status,
            "platform_fee_cents": self.platform_fee_cents,
            "seller_payout_cents": self.seller_payout_cents,
            "currency": self.currency,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "items": [item.to_dict() for item in self.items],
        }
        # The pickup code is the proof of a completed purchase, so it stays
        # hidden until the order is actually payable at the counter.
        if include_pickup_code and self.is_fulfillable:
            data["pickup_code"] = self.pickup_code
        else:
            data["pickup_code"] = None
        return data


class OrderItem(db.Model):
    __tablename__ = "order_item"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    candy_id = db.Column(db.Integer, db.ForeignKey("candy.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price_cents = db.Column(db.Integer, nullable=False, default=0)

    order = db.relationship("Order", back_populates="items")
    candy = db.relationship("Candy")

    def to_dict(self):
        return {
            "id": self.id,
            "candy_id": self.candy_id,
            "quantity": self.quantity,
            "unit_price_cents": self.unit_price_cents,
            "line_total_cents": (self.quantity or 0) * (self.unit_price_cents or 0),
            "candy": self.candy.to_dict() if self.candy else None,
        }
