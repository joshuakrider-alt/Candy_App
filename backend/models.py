from datetime import datetime

from flask_sqlalchemy import SQLAlchemy


# Shared SQLAlchemy instance. It is initialized by the Flask application.
db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)

    orders = db.relationship("Order", back_populates="user", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email}


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

    def to_dict(self):
        return {
            "id": self.id,
            "shop_name": self.shop_name,
            "contact_name": self.contact_name,
            "neighborhood": self.neighborhood,
            "pickup_window": self.pickup_window,
            "status": self.status,
        }


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
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship("User", back_populates="orders")
    seller = db.relationship("Seller", back_populates="orders")
    items = db.relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "seller_id": self.seller_id,
            "status": self.status,
            "total_cents": self.total_cents,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "items": [item.to_dict() for item in self.items],
        }


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
            "candy": self.candy.to_dict() if self.candy else None,
        }
