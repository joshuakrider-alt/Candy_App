import os

from flask import Flask, abort, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    verify_jwt_in_request,
)

from models import Candy, Order, OrderItem, Seller, SellerInventory, User, db


INVENTORY_STATUSES = {"in-stock", "low-stock", "out-of-stock"}
ORDER_STATUSES = {"new", "packing", "ready", "completed"}


def create_app():
    app = Flask(__name__)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        db_path = os.path.join(os.path.dirname(__file__), "data.db")
        database_url = f"sqlite:///{db_path}"

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.environ.get(
        "JWT_SECRET_KEY",
        "dev-candy-jwt-secret-change-me-please",
    )
    app.config["PROTOTYPE_LOGIN_PASSWORD"] = os.environ.get(
        "PROTOTYPE_LOGIN_PASSWORD",
        "password",
    )

    cors_origins = os.environ.get("CORS_ORIGINS")
    origins = [o.strip() for o in cors_origins.split(",") if o.strip()] if cors_origins else "*"

    db.init_app(app)
    JWTManager(app)
    CORS(app, origins=origins)

    with app.app_context():
        db.create_all()

    # Prototype authentication. Any seeded user can log in with the shared password.
    @app.route("/login", methods=["POST"])
    def login():
        data = request.get_json() or {}
        email = data.get("email")
        password = data.get("password")
        if not email or not password:
            abort(400, description="email and password are required")

        user = User.query.filter_by(email=email).first()
        if not user or password != app.config["PROTOTYPE_LOGIN_PASSWORD"]:
            abort(401, description="invalid email or password")

        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={"email": user.email},
        )
        return jsonify(access_token=access_token, user=user.to_dict())

    # Global candy catalog
    @app.route("/candies", methods=["GET"])
    def list_candies():
        return jsonify([candy.to_dict() for candy in Candy.query.all()])

    @app.route("/candies/<int:candy_id>", methods=["GET"])
    def get_candy(candy_id):
        return jsonify(Candy.query.get_or_404(candy_id).to_dict())

    @app.route("/candies", methods=["POST"])
    def create_candy():
        data = request.get_json() or {}
        if "name" not in data or "price_cents" not in data:
            abort(400, description="name and price_cents are required")

        candy = Candy(
            name=data["name"],
            description=data.get("description", ""),
            price_cents=int(data["price_cents"]),
        )
        db.session.add(candy)
        db.session.commit()
        return jsonify(candy.to_dict()), 201

    @app.route("/candies/<int:candy_id>", methods=["PUT"])
    def update_candy(candy_id):
        candy = Candy.query.get_or_404(candy_id)
        data = request.get_json() or {}
        candy.name = data.get("name", candy.name)
        candy.description = data.get("description", candy.description)
        candy.price_cents = int(data.get("price_cents", candy.price_cents))
        db.session.commit()
        return jsonify(candy.to_dict())

    @app.route("/candies/<int:candy_id>", methods=["DELETE"])
    def delete_candy(candy_id):
        candy = Candy.query.get_or_404(candy_id)
        db.session.delete(candy)
        db.session.commit()
        return "", 204

    # Buyers
    @app.route("/users", methods=["GET"])
    def list_users():
        return jsonify([user.to_dict() for user in User.query.all()])

    @app.route("/users/<int:user_id>", methods=["GET"])
    def get_user(user_id):
        return jsonify(User.query.get_or_404(user_id).to_dict())

    @app.route("/users", methods=["POST"])
    def create_user():
        data = request.get_json() or {}
        if "name" not in data or "email" not in data:
            abort(400, description="name and email are required")

        user = User(name=data["name"], email=data["email"])
        db.session.add(user)
        db.session.commit()
        return jsonify(user.to_dict()), 201

    # Admin applications and seller approval
    @app.route("/applications", methods=["GET", "POST"])
    def create_application():
        if request.method == "GET":
            verify_jwt_in_request()
            status = request.args.get("status")
            query = Seller.query
            if status:
                if status not in {"pending", "approved", "rejected"}:
                    abort(400, description="invalid seller status")
                query = query.filter_by(status=status)
            return jsonify([seller.to_dict() for seller in query.order_by(Seller.id.desc()).all()])

        data = request.get_json() or {}
        required_fields = ("shop_name", "contact_name", "neighborhood", "pickup_window")
        if not all(data.get(field) for field in required_fields):
            abort(400, description="shop_name, contact_name, neighborhood, and pickup_window are required")

        seller = Seller(
            shop_name=data["shop_name"],
            contact_name=data["contact_name"],
            neighborhood=data["neighborhood"],
            pickup_window=data["pickup_window"],
            status="pending",
        )
        db.session.add(seller)
        db.session.commit()
        return jsonify(seller.to_dict()), 201

    @app.route("/applications/<int:seller_id>", methods=["PUT"])
    @jwt_required()
    def update_application(seller_id):
        seller = Seller.query.get_or_404(seller_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in {"approved", "rejected"}:
            abort(400, description="status must be approved or rejected")

        seller.status = status
        db.session.commit()
        return jsonify(seller.to_dict())

    # Seller inventory
    @app.route("/sellers/<int:seller_id>/inventory", methods=["GET"])
    @jwt_required()
    def get_seller_inventory(seller_id):
        Seller.query.get_or_404(seller_id)
        inventory = SellerInventory.query.filter_by(seller_id=seller_id).all()
        return jsonify([item.to_dict() for item in inventory])

    @app.route("/sellers/<int:seller_id>/inventory/<int:candy_id>", methods=["PUT"])
    @jwt_required()
    def update_seller_inventory(seller_id, candy_id):
        Seller.query.get_or_404(seller_id)
        Candy.query.get_or_404(candy_id)
        data = request.get_json() or {}
        inventory = SellerInventory.query.filter_by(
            seller_id=seller_id, candy_id=candy_id
        ).first()

        if inventory is None:
            inventory = SellerInventory(seller_id=seller_id, candy_id=candy_id)
            db.session.add(inventory)

        if "inventory_count" in data:
            inventory_count = int(data["inventory_count"])
            if inventory_count < 0:
                abort(400, description="inventory_count cannot be negative")
            inventory.inventory_count = inventory_count

        if "status" in data:
            if data["status"] not in INVENTORY_STATUSES:
                abort(400, description="invalid inventory status")
            inventory.status = data["status"]

        db.session.commit()
        return jsonify(inventory.to_dict())

    # Seller fulfillment queue
    @app.route("/sellers/<int:seller_id>/orders", methods=["GET"])
    @jwt_required()
    def get_seller_orders(seller_id):
        Seller.query.get_or_404(seller_id)
        orders = (
            Order.query.filter(
                Order.seller_id == seller_id,
                Order.status.in_(("new", "packing", "ready")),
            )
            .order_by(Order.created_at.asc())
            .all()
        )
        return jsonify([order.to_dict() for order in orders])

    # Orders
    @app.route("/orders", methods=["GET"])
    def list_orders():
        return jsonify([order.to_dict() for order in Order.query.all()])

    @app.route("/orders/<int:order_id>", methods=["GET"])
    def get_order(order_id):
        return jsonify(Order.query.get_or_404(order_id).to_dict())

    @app.route("/orders", methods=["POST"])
    def create_order():
        data = request.get_json() or {}
        user_id = data.get("user_id")
        seller_id = data.get("seller_id")
        items = data.get("items", [])
        if not user_id or not seller_id or not items:
            abort(400, description="user_id, seller_id, and items are required")

        User.query.get_or_404(user_id)
        seller = Seller.query.get_or_404(seller_id)
        if seller.status != "approved":
            abort(400, description="orders can only be placed with approved sellers")

        order = Order(user_id=user_id, seller_id=seller_id, total_cents=0, status="new")
        db.session.add(order)
        total = 0
        for item in items:
            candy_id = item.get("candy_id")
            if not candy_id:
                abort(400, description="each order item requires candy_id")
            quantity = int(item.get("quantity", 1))
            if quantity <= 0:
                abort(400, description="quantity must be positive")

            candy = Candy.query.get_or_404(candy_id)
            inventory = SellerInventory.query.filter_by(
                seller_id=seller_id, candy_id=candy_id
            ).first()
            if not inventory or inventory.inventory_count < quantity:
                abort(400, description=f"insufficient inventory for candy {candy_id}")

            order_item = OrderItem(
                order=order,
                candy=candy,
                quantity=quantity,
                unit_price_cents=candy.price_cents,
            )
            db.session.add(order_item)
            inventory.inventory_count -= quantity
            if inventory.inventory_count == 0:
                inventory.status = "out-of-stock"
            total += candy.price_cents * quantity

        order.total_cents = total
        db.session.commit()
        return jsonify(order.to_dict()), 201

    @app.route("/orders/<int:order_id>/status", methods=["PUT"])
    @jwt_required()
    def update_order_status(order_id):
        order = Order.query.get_or_404(order_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in ORDER_STATUSES:
            abort(400, description="invalid order status")

        order.status = status
        db.session.commit()
        return jsonify(order.to_dict())

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
