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


class User(db.Model):
    __tablename__ = "user"
    __table_args__ = (
        db.CheckConstraint(
            "role IN ('buyer', 'seller', 'admin')",
            name="ck_user_role",
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

    orders = db.relationship("Order", back_populates="user", lazy=True)
    seller = db.relationship("Seller", back_populates="logins")

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
        }


class Seller(db.Model):
    __tablename__ = "seller"
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_seller_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    shop_name = db.Column(db.String(200), nullable=False)
    contact_name = db.Column(db.String(120), nullable=False)
    contact_email = db.Column(db.String(200))
    neighborhood = db.Column(db.String(120), nullable=False)
    pickup_window = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")

    inventory_items = db.relationship(
        "SellerInventory",
        back_populates="seller",
        cascade="all, delete-orphan",
        lazy=True,
    )
    orders = db.relationship("Order", back_populates="seller", lazy=True)
    logins = db.relationship("User", back_populates="seller", lazy=True)

    def to_dict(self, include_contact_email=False):
        data = {
            "id": self.id,
            "shop_name": self.shop_name,
            "contact_name": self.contact_name,
            "neighborhood": self.neighborhood,
            "pickup_window": self.pickup_window,
            "status": self.status,
        }
        if include_contact_email:
            data["contact_email"] = self.contact_email
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


class Order(db.Model):
    __tablename__ = "order"
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('new', 'packing', 'ready', 'completed')",
            name="ck_order_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
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
