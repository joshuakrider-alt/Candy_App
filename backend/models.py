from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# shared SQLAlchemy instance
db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    orders = db.relationship('Order', backref='user', lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email}

class Candy(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    price_cents = db.Column(db.Integer, nullable=False, default=0)
    inventory = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description, "price_cents": self.price_cents, "inventory": self.inventory}

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    total_cents = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship('OrderItem', backref='order', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "total_cents": self.total_cents,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "items": [i.to_dict() for i in self.items]
        }

class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    candy_id = db.Column(db.Integer, db.ForeignKey('candy.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price_cents = db.Column(db.Integer, nullable=False, default=0)
    candy = db.relationship('Candy')

    def to_dict(self):
        return {"id": self.id, "candy_id": self.candy_id, "quantity": self.quantity, "unit_price_cents": self.unit_price_cents, "candy": self.candy.to_dict() if self.candy else None}
