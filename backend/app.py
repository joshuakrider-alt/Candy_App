import logging
import os
from datetime import timedelta

from flask import Flask, abort, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy import func
from werkzeug.exceptions import HTTPException

import payments
from auth import (
    assert_order_access,
    assert_seller_access,
    current_user,
    issue_token,
    normalize_email,
    require_roles,
    validate_email,
    validate_password,
    validate_role,
)
from migrations import run_migrations
from models import (
    FULFILLABLE_PAYMENT_STATUSES,
    INVENTORY_STATUSES,
    ORDER_STATUSES,
    Candy,
    Order,
    OrderItem,
    Seller,
    SellerInventory,
    User,
    db,
    generate_pickup_code,
    utcnow,
)

logger = logging.getLogger(__name__)

SELLER_STATUSES = ("pending", "approved", "rejected")
DEFAULT_PUBLIC_SITE_URL = "https://www.neighborhoodcandylady.com"


def _env_float(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return float(default)


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)


def resolve_database_url():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        db_path = os.path.join(os.path.dirname(__file__), "data.db")
        return f"sqlite:///{db_path}"
    # Neon and Heroku hand out postgres:// URLs, which SQLAlchemy 2 rejects.
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql://", 1)
    return database_url


def create_app(config_overrides=None):
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = resolve_database_url()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.environ.get(
        "JWT_SECRET_KEY",
        "dev-candy-jwt-secret-change-me-please",
    )
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        hours=_env_int("JWT_ACCESS_TOKEN_HOURS", 12)
    )

    cors_origins = os.environ.get("CORS_ORIGINS")
    origin_list = (
        [o.strip().rstrip("/") for o in cors_origins.split(",") if o.strip()]
        if cors_origins
        else []
    )
    app.config["CORS_ORIGIN_LIST"] = origin_list

    app.config["PUBLIC_SITE_URL"] = (
        os.environ.get("PUBLIC_SITE_URL") or DEFAULT_PUBLIC_SITE_URL
    ).rstrip("/")
    app.config["STRIPE_SECRET_KEY"] = os.environ.get("STRIPE_SECRET_KEY", "")
    app.config["STRIPE_PUBLISHABLE_KEY"] = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    app.config["STRIPE_WEBHOOK_SECRET"] = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    app.config["CURRENCY"] = os.environ.get("CURRENCY", "usd").lower()
    app.config["PLATFORM_FEE_PERCENT"] = _env_float("PLATFORM_FEE_PERCENT", 10)
    app.config["PLATFORM_FEE_FLAT_CENTS"] = _env_int("PLATFORM_FEE_FLAT_CENTS", 0)
    app.config["CHECKOUT_SESSION_TTL_MINUTES"] = _env_int("CHECKOUT_SESSION_TTL_MINUTES", 31)
    app.config["PENDING_ORDER_TTL_MINUTES"] = _env_int("PENDING_ORDER_TTL_MINUTES", 45)
    app.config["RUN_MIGRATIONS_ON_BOOT"] = True

    if config_overrides:
        app.config.update(config_overrides)

    db.init_app(app)
    jwt = JWTManager(app)
    CORS(app, origins=origin_list or "*")

    with app.app_context():
        db.create_all()
        if app.config["RUN_MIGRATIONS_ON_BOOT"]:
            run_migrations()
        bootstrap_admin(app)

    if os.environ.get("PROTOTYPE_LOGIN_PASSWORD"):
        logger.warning(
            "PROTOTYPE_LOGIN_PASSWORD is set but ignored; accounts now use "
            "per-account hashed passwords. Remove the variable."
        )
    if app.config["STRIPE_SECRET_KEY"].startswith("sk_live_"):
        logger.warning("STRIPE_SECRET_KEY is a live key; this slice is meant for test mode.")

    register_error_handlers(app, jwt)
    register_routes(app)
    return app


def bootstrap_admin(app):
    """Optionally create or repair one admin login from the environment.

    Render's free tier has no shell, so this is the supported way to mint the
    first real admin password. Unset both variables once the admin can log in.
    """
    email = normalize_email(os.environ.get("ADMIN_BOOTSTRAP_EMAIL"))
    password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD") or ""
    if not email or not password:
        return
    if len(password) < 8:
        logger.error("ADMIN_BOOTSTRAP_PASSWORD is too short; skipping admin bootstrap")
        return

    user = User.query.filter_by(email=email).first()
    if user is None:
        user = User(name=os.environ.get("ADMIN_BOOTSTRAP_NAME", "Platform Admin"), email=email)
        db.session.add(user)
    user.role = "admin"
    user.set_password(password)
    db.session.commit()
    logger.info("admin bootstrap applied for %s", email)


def register_error_handlers(app, jwt):
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        return jsonify(error=error.description), error.code

    # Flask-JWT-Extended defaults to 422 for malformed tokens. The frontend
    # treats 401 as "log in again", so normalize every token problem to 401.
    @jwt.unauthorized_loader
    def handle_missing_token(reason):
        return jsonify(error=reason or "authentication required"), 401

    @jwt.invalid_token_loader
    def handle_invalid_token(reason):
        return jsonify(error="your session is invalid; log in again"), 401

    @jwt.expired_token_loader
    def handle_expired_token(_header, _payload):
        return jsonify(error="your session expired; log in again"), 401

    @jwt.revoked_token_loader
    def handle_revoked_token(_header, _payload):
        return jsonify(error="your session is no longer valid; log in again"), 401


def register_routes(app):
    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def release_order_inventory(order):
        """Put an unpaid order's reserved units back on the shelf."""
        for item in order.items:
            inventory = SellerInventory.query.filter_by(
                seller_id=order.seller_id, candy_id=item.candy_id
            ).first()
            if inventory:
                inventory.apply_count_change(item.quantity)
        order.inventory_released_at = utcnow()

    def reserve_order_inventory(order):
        for item in order.items:
            inventory = SellerInventory.query.filter_by(
                seller_id=order.seller_id, candy_id=item.candy_id
            ).first()
            if inventory:
                inventory.apply_count_change(-item.quantity)
        order.inventory_released_at = None

    def release_stale_pending_orders():
        """Expire abandoned checkouts so their stock is sellable again."""
        cutoff = utcnow() - timedelta(minutes=app.config["PENDING_ORDER_TTL_MINUTES"])
        stale = (
            Order.query.filter(
                Order.payment_status == "pending",
                Order.created_at < cutoff,
                Order.inventory_released_at.is_(None),
            )
            .limit(50)
            .all()
        )
        if not stale:
            return
        for order in stale:
            release_order_inventory(order)
            order.payment_status = "expired"
        db.session.commit()

    def unique_pickup_code():
        for _ in range(12):
            code = generate_pickup_code()
            if not Order.query.filter_by(pickup_code=code).first():
                return code
        abort(500, description="could not allocate a pickup code; try again")

    def ensure_seller_inventory_rows(seller_id):
        """Give a shop a toggle row for every catalog item, including new ones."""
        existing = {
            row.candy_id
            for row in SellerInventory.query.filter_by(seller_id=seller_id).all()
        }
        missing = [candy for candy in Candy.query.all() if candy.id not in existing]
        for candy in missing:
            db.session.add(
                SellerInventory(
                    seller_id=seller_id,
                    candy_id=candy.id,
                    inventory_count=0,
                    status="out-of-stock",
                )
            )
        if missing:
            db.session.commit()

    def mark_order_paid(order, session):
        if order.payment_status == "paid":
            return False
        order.payment_status = "paid"
        order.paid_at = utcnow()
        payment_intent = session.get("payment_intent") if session else None
        if isinstance(payment_intent, dict):
            payment_intent = payment_intent.get("id")
        if payment_intent:
            order.stripe_payment_intent_id = payment_intent
        # The buyer paid, so the units belong to this order even if a sweep
        # already returned them to the shelf.
        if order.inventory_released_at is not None:
            reserve_order_inventory(order)
        db.session.commit()
        return True

    def order_response(order, checkout_url=None):
        payload = order.to_dict()
        payload["seller"] = order.seller.to_dict() if order.seller else None
        if checkout_url:
            payload["checkout_url"] = checkout_url
        return payload

    def start_checkout(order, user):
        session = payments.create_checkout_session(
            order, user, payments.checkout_return_base(request.headers.get("Origin"))
        )
        order.stripe_checkout_session_id = session["id"]
        order.payment_status = "pending"
        return session["url"]

    # ------------------------------------------------------------------
    # Public config and health
    # ------------------------------------------------------------------
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify(status="ok", time=utcnow().isoformat())

    @app.route("/config", methods=["GET"])
    def public_config():
        """Non-secret settings the static frontend needs at runtime."""
        config = payments.public_config()
        config["public_site_url"] = app.config["PUBLIC_SITE_URL"]
        return jsonify(config)

    # ------------------------------------------------------------------
    # Accounts
    # ------------------------------------------------------------------
    @app.route("/signup", methods=["POST"])
    def signup():
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        email = validate_email(data.get("email"))
        password = validate_password(data.get("password"))
        if not name:
            abort(400, description="name is required")

        if User.query.filter_by(email=email).first():
            abort(409, description="an account with that email already exists")

        # Role is never taken from the request body: signup only makes buyers.
        user = User(name=name, email=email, role="buyer")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return jsonify(access_token=issue_token(user), user=user.to_dict()), 201

    @app.route("/login", methods=["POST"])
    def login():
        data = request.get_json() or {}
        email = normalize_email(data.get("email"))
        password = data.get("password") or ""
        if not email or not password:
            abort(400, description="email and password are required")

        user = User.query.filter_by(email=email).first()
        if user and not user.has_password:
            abort(
                403,
                description=(
                    "this account has no password yet; ask an admin to set one"
                ),
            )
        if not user or not user.check_password(password):
            abort(401, description="invalid email or password")

        return jsonify(access_token=issue_token(user), user=user.to_dict())

    @app.route("/me", methods=["GET"])
    @require_roles()
    def get_me():
        user = current_user()
        payload = {"user": user.to_dict()}
        if user.seller_id:
            seller = Seller.query.get(user.seller_id)
            payload["seller"] = seller.to_dict(include_contact_email=True) if seller else None
        return jsonify(payload)

    @app.route("/me/password", methods=["PUT"])
    @require_roles()
    def change_my_password():
        user = current_user()
        data = request.get_json() or {}
        new_password = validate_password(data.get("new_password"))
        if not user.check_password(data.get("current_password") or ""):
            abort(401, description="current password is incorrect")
        user.set_password(new_password)
        db.session.commit()
        return jsonify(user.to_dict())

    @app.route("/me/orders", methods=["GET"])
    @require_roles()
    def list_my_orders():
        orders = (
            Order.query.filter_by(user_id=current_user().id)
            .order_by(Order.created_at.desc())
            .limit(25)
            .all()
        )
        return jsonify([order_response(order) for order in orders])

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------
    @app.route("/candies", methods=["GET"])
    def list_candies():
        return jsonify([candy.to_dict() for candy in Candy.query.order_by(Candy.name).all()])

    @app.route("/candies/<int:candy_id>", methods=["GET"])
    def get_candy(candy_id):
        return jsonify(Candy.query.get_or_404(candy_id).to_dict())

    @app.route("/candies", methods=["POST"])
    @require_roles("admin")
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
    @require_roles("admin")
    def update_candy(candy_id):
        candy = Candy.query.get_or_404(candy_id)
        data = request.get_json() or {}
        candy.name = data.get("name", candy.name)
        candy.description = data.get("description", candy.description)
        candy.price_cents = int(data.get("price_cents", candy.price_cents))
        db.session.commit()
        return jsonify(candy.to_dict())

    @app.route("/candies/<int:candy_id>", methods=["DELETE"])
    @require_roles("admin")
    def delete_candy(candy_id):
        candy = Candy.query.get_or_404(candy_id)
        db.session.delete(candy)
        db.session.commit()
        return "", 204

    # ------------------------------------------------------------------
    # Users (admin)
    # ------------------------------------------------------------------
    @app.route("/users", methods=["GET"])
    @require_roles("admin")
    def list_users():
        return jsonify([user.to_dict() for user in User.query.order_by(User.id).all()])

    @app.route("/users/<int:user_id>", methods=["GET"])
    @require_roles("admin")
    def get_user(user_id):
        return jsonify(User.query.get_or_404(user_id).to_dict())

    @app.route("/users", methods=["POST"])
    @require_roles("admin")
    def create_user():
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        email = validate_email(data.get("email"))
        role = validate_role(data.get("role", "buyer"))
        if not name:
            abort(400, description="name is required")
        if User.query.filter_by(email=email).first():
            abort(409, description="an account with that email already exists")

        seller_id = data.get("seller_id")
        if role == "seller":
            if not seller_id:
                abort(400, description="seller accounts need a seller_id")
            Seller.query.get_or_404(seller_id)
        else:
            seller_id = None

        user = User(name=name, email=email, role=role, seller_id=seller_id)
        if data.get("password"):
            user.set_password(validate_password(data["password"]))
        db.session.add(user)
        db.session.commit()
        return jsonify(user.to_dict()), 201

    @app.route("/users/<int:user_id>/password", methods=["PUT"])
    @require_roles("admin")
    def set_user_password(user_id):
        user = User.query.get_or_404(user_id)
        data = request.get_json() or {}
        user.set_password(validate_password(data.get("password")))
        db.session.commit()
        return jsonify(user.to_dict())

    # ------------------------------------------------------------------
    # Seller applications and approval
    # ------------------------------------------------------------------
    @app.route("/applications", methods=["POST"])
    def create_application():
        """Apply to sell. This also creates the seller's real login."""
        data = request.get_json() or {}
        required_fields = ("shop_name", "contact_name", "neighborhood", "pickup_window")
        if not all(data.get(field) for field in required_fields):
            abort(
                400,
                description=(
                    "shop_name, contact_name, neighborhood, and pickup_window are required"
                ),
            )
        email = validate_email(data.get("email"))
        password = validate_password(data.get("password"))
        if User.query.filter_by(email=email).first():
            abort(409, description="an account with that email already exists")

        seller = Seller(
            shop_name=data["shop_name"].strip(),
            contact_name=data["contact_name"].strip(),
            contact_email=email,
            neighborhood=data["neighborhood"].strip(),
            pickup_window=data["pickup_window"].strip(),
            status="pending",
        )
        db.session.add(seller)
        db.session.flush()

        owner = User(
            name=seller.contact_name,
            email=email,
            role="seller",
            seller_id=seller.id,
        )
        owner.set_password(password)
        db.session.add(owner)
        db.session.commit()

        return (
            jsonify(
                seller=seller.to_dict(include_contact_email=True),
                login={"email": owner.email, "role": owner.role},
                message=(
                    "Application received. You can log in now; your shop goes "
                    "live once an admin approves it."
                ),
            ),
            201,
        )

    @app.route("/applications", methods=["GET"])
    @require_roles("admin")
    def list_applications():
        status = request.args.get("status")
        query = Seller.query
        if status:
            if status not in SELLER_STATUSES:
                abort(400, description="invalid seller status")
            query = query.filter_by(status=status)
        sellers = query.order_by(Seller.id.desc()).all()
        return jsonify([seller.to_dict(include_contact_email=True) for seller in sellers])

    @app.route("/applications/<int:seller_id>", methods=["PUT"])
    @require_roles("admin")
    def update_application(seller_id):
        seller = Seller.query.get_or_404(seller_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in ("approved", "rejected"):
            abort(400, description="status must be approved or rejected")

        seller.status = status
        db.session.commit()
        if status == "approved":
            ensure_seller_inventory_rows(seller.id)
        return jsonify(seller.to_dict(include_contact_email=True))

    # ------------------------------------------------------------------
    # Storefronts
    # ------------------------------------------------------------------
    @app.route("/sellers", methods=["GET"])
    def list_sellers():
        """Every approved shop a buyer can order from."""
        release_stale_pending_orders()
        sellers = (
            Seller.query.filter_by(status="approved").order_by(Seller.shop_name).all()
        )
        counts = dict(
            db.session.query(SellerInventory.seller_id, func.count(SellerInventory.id))
            .filter(
                SellerInventory.inventory_count > 0,
                SellerInventory.status.in_(("in-stock", "low-stock")),
            )
            .group_by(SellerInventory.seller_id)
            .all()
        )
        payload = []
        for seller in sellers:
            data = seller.to_dict()
            data["in_stock_count"] = counts.get(seller.id, 0)
            payload.append(data)
        return jsonify(payload)

    @app.route("/sellers/<int:seller_id>/storefront", methods=["GET"])
    def get_seller_storefront(seller_id):
        release_stale_pending_orders()
        seller = Seller.query.get_or_404(seller_id)
        if seller.status != "approved":
            abort(404, description="seller is not available")

        inventory = SellerInventory.query.filter(
            SellerInventory.seller_id == seller_id,
            SellerInventory.inventory_count > 0,
            SellerInventory.status.in_(("in-stock", "low-stock")),
        ).all()
        return jsonify(
            {
                "seller": seller.to_dict(),
                "items": [item.to_dict() for item in inventory],
            }
        )

    # ------------------------------------------------------------------
    # Seller dashboard
    # ------------------------------------------------------------------
    @app.route("/sellers/<int:seller_id>/inventory", methods=["GET"])
    @require_roles("seller", "admin")
    def get_seller_inventory(seller_id):
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        ensure_seller_inventory_rows(seller_id)
        inventory = (
            SellerInventory.query.filter_by(seller_id=seller_id)
            .join(Candy)
            .order_by(Candy.name)
            .all()
        )
        return jsonify([item.to_dict() for item in inventory])

    @app.route("/sellers/<int:seller_id>/inventory/<int:candy_id>", methods=["PUT"])
    @require_roles("seller", "admin")
    def update_seller_inventory(seller_id, candy_id):
        assert_seller_access(current_user(), seller_id)
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
            if inventory.status == "out-of-stock":
                inventory.inventory_count = 0

        db.session.commit()
        return jsonify(inventory.to_dict())

    @app.route("/sellers/<int:seller_id>/orders", methods=["GET"])
    @require_roles("seller", "admin")
    def get_seller_orders(seller_id):
        """The pickup queue: paid (or legacy pay-at-pickup) orders only."""
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        orders = (
            Order.query.filter(
                Order.seller_id == seller_id,
                Order.status.in_(("new", "packing", "ready")),
                Order.payment_status.in_(FULFILLABLE_PAYMENT_STATUSES),
            )
            .order_by(Order.created_at.asc())
            .all()
        )
        payload = []
        for order in orders:
            data = order.to_dict()
            data["buyer_name"] = order.user.name if order.user else None
            payload.append(data)
        return jsonify(payload)

    # ------------------------------------------------------------------
    # Orders and payment
    # ------------------------------------------------------------------
    @app.route("/orders", methods=["GET"])
    @require_roles("admin")
    def list_orders():
        orders = Order.query.order_by(Order.created_at.desc()).limit(200).all()
        return jsonify([order_response(order) for order in orders])

    @app.route("/orders/<int:order_id>", methods=["GET"])
    @require_roles()
    def get_order(order_id):
        order = Order.query.get_or_404(order_id)
        assert_order_access(current_user(), order)
        return jsonify(order_response(order))

    @app.route("/orders", methods=["POST"])
    @require_roles("buyer", "admin")
    def create_order():
        """Reserve stock, price the order, and open a Stripe Checkout session."""
        release_stale_pending_orders()
        user = current_user()
        data = request.get_json() or {}
        seller_id = data.get("seller_id")
        items = data.get("items") or []
        if not seller_id or not items:
            abort(400, description="seller_id and items are required")

        seller = Seller.query.get_or_404(seller_id)
        if seller.status != "approved":
            abort(400, description="orders can only be placed with approved sellers")

        # Fail before touching stock if payments are not wired up.
        payments.require_stripe()

        order = Order(
            user_id=user.id,
            seller_id=seller.id,
            total_cents=0,
            status="new",
            payment_status="unpaid",
            currency=app.config["CURRENCY"],
            pickup_code=unique_pickup_code(),
        )
        db.session.add(order)

        subtotal = 0
        for item in items:
            candy_id = item.get("candy_id")
            if not candy_id:
                abort(400, description="each order item requires candy_id")
            quantity = int(item.get("quantity", 1))
            if quantity <= 0:
                abort(400, description="quantity must be positive")

            candy = Candy.query.get_or_404(candy_id)
            inventory = SellerInventory.query.filter_by(
                seller_id=seller.id, candy_id=candy_id
            ).first()
            if not inventory or inventory.inventory_count < quantity:
                abort(400, description=f"insufficient inventory for {candy.name}")

            db.session.add(
                OrderItem(
                    order=order,
                    candy=candy,
                    quantity=quantity,
                    unit_price_cents=candy.price_cents,
                )
            )
            inventory.apply_count_change(-quantity)
            subtotal += candy.price_cents * quantity

        order.total_cents = subtotal
        order.platform_fee_cents = payments.platform_fee_for(subtotal)
        db.session.flush()

        # If Stripe rejects the session the request aborts here and the
        # uncommitted order (and its stock hold) is discarded on teardown.
        checkout_url = start_checkout(order, user)
        db.session.commit()
        return jsonify(order_response(order, checkout_url=checkout_url)), 201

    @app.route("/orders/<int:order_id>/checkout", methods=["POST"])
    @require_roles("buyer", "admin")
    def resume_checkout(order_id):
        """Re-open Stripe Checkout for an order the buyer did not finish."""
        order = Order.query.get_or_404(order_id)
        assert_order_access(current_user(), order)
        if order.payment_status == "paid":
            abort(400, description="this order is already paid")
        if order.payment_status not in ("pending", "unpaid"):
            abort(400, description="this order can no longer be paid; place a new one")
        if order.inventory_released_at is not None:
            abort(400, description="this checkout expired; place a new order")

        if order.stripe_checkout_session_id:
            session = payments.retrieve_checkout_session(order.stripe_checkout_session_id)
            if session.get("status") == "open" and session.get("url"):
                return jsonify(order_response(order, checkout_url=session["url"]))
            if session.get("payment_status") == "paid":
                mark_order_paid(order, session)
                return jsonify(order_response(order))

        checkout_url = start_checkout(order, order.user)
        db.session.commit()
        return jsonify(order_response(order, checkout_url=checkout_url))

    @app.route("/orders/<int:order_id>/payment/confirm", methods=["POST"])
    @require_roles("buyer", "admin")
    def confirm_payment(order_id):
        """Authenticated fallback for environments without a webhook.

        The result comes from Stripe, not from the caller, so this cannot be
        used to fake a payment.
        """
        order = Order.query.get_or_404(order_id)
        assert_order_access(current_user(), order)
        if order.payment_status == "paid":
            return jsonify(order_response(order))

        session_id = order.stripe_checkout_session_id
        if not session_id:
            abort(400, description="this order has no checkout session")

        session = payments.retrieve_checkout_session(session_id)
        if session.get("payment_status") == "paid":
            mark_order_paid(order, session)
        elif session.get("status") == "expired":
            if order.inventory_released_at is None:
                release_order_inventory(order)
            order.payment_status = "expired"
            db.session.commit()
        return jsonify(order_response(order))

    @app.route("/orders/<int:order_id>/cancel", methods=["POST"])
    @require_roles("buyer", "admin")
    def cancel_order(order_id):
        order = Order.query.get_or_404(order_id)
        assert_order_access(current_user(), order)
        if order.payment_status == "paid":
            abort(400, description="paid orders cannot be cancelled here")
        if order.inventory_released_at is None:
            release_order_inventory(order)
        order.payment_status = "expired"
        db.session.commit()
        return jsonify(order_response(order))

    @app.route("/orders/<int:order_id>/status", methods=["PUT"])
    @require_roles("seller", "admin")
    def update_order_status(order_id):
        order = Order.query.get_or_404(order_id)
        assert_seller_access(current_user(), order.seller_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in ORDER_STATUSES:
            abort(400, description="invalid order status")
        if not order.is_fulfillable:
            abort(400, description="this order has not been paid yet")

        order.status = status
        db.session.commit()
        return jsonify(order_response(order))

    @app.route("/stripe/webhook", methods=["POST"])
    def stripe_webhook():
        event = payments.construct_webhook_event(
            request.get_data(), request.headers.get("Stripe-Signature")
        )
        event_type = event.get("type")
        session = (event.get("data") or {}).get("object") or {}
        order = _order_for_session(session)
        if order is None:
            return jsonify(received=True, handled=False)

        if event_type == "checkout.session.completed":
            if session.get("payment_status") == "paid":
                mark_order_paid(order, session)
        elif event_type == "checkout.session.expired":
            if order.payment_status not in ("paid", "refunded"):
                if order.inventory_released_at is None:
                    release_order_inventory(order)
                order.payment_status = "expired"
                db.session.commit()
        elif event_type in ("charge.refunded", "charge.refund.updated"):
            if order.payment_status == "paid":
                order.payment_status = "refunded"
                db.session.commit()

        return jsonify(received=True, handled=True)

    def _order_for_session(event_object):
        """Find the order behind a webhook payload.

        Checkout sessions carry our metadata, but a charge (refund events) may
        not, so fall back to the stored session and payment intent ids.
        """
        metadata = event_object.get("metadata") or {}
        order_id = metadata.get("order_id") or event_object.get("client_reference_id")
        if order_id:
            try:
                order = Order.query.get(int(order_id))
            except (TypeError, ValueError):
                order = None
            if order:
                return order

        session_id = event_object.get("id")
        if session_id:
            order = Order.query.filter_by(stripe_checkout_session_id=session_id).first()
            if order:
                return order

        payment_intent = event_object.get("payment_intent")
        if isinstance(payment_intent, dict):
            payment_intent = payment_intent.get("id")
        if payment_intent:
            return Order.query.filter_by(stripe_payment_intent_id=payment_intent).first()
        return None

    # ------------------------------------------------------------------
    # Admin reporting
    # ------------------------------------------------------------------
    @app.route("/admin/revenue", methods=["GET"])
    @require_roles("admin")
    def admin_revenue():
        """What the platform has collected and what it owes sellers."""
        paid = Order.query.filter(Order.payment_status == "paid")
        totals = paid.with_entities(
            func.coalesce(func.sum(Order.total_cents), 0),
            func.coalesce(func.sum(Order.platform_fee_cents), 0),
            func.count(Order.id),
        ).one()
        gross_cents, fee_cents, order_count = int(totals[0]), int(totals[1]), int(totals[2])
        return jsonify(
            paid_order_count=order_count,
            gross_cents=gross_cents,
            platform_fee_cents=fee_cents,
            seller_payout_cents=max(0, gross_cents - fee_cents),
            platform_fee_percent=app.config["PLATFORM_FEE_PERCENT"],
            platform_fee_flat_cents=app.config["PLATFORM_FEE_FLAT_CENTS"],
        )


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
