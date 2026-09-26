import logging
import os
from datetime import timedelta

from flask import Flask, abort, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException

import accounts
import connect
import identity
import payments
import storage
import storefront
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
    PHOTO_STATUSES,
    Candy,
    Order,
    OrderItem,
    Seller,
    SellerInventory,
    SellerPhoto,
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


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


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


def seller_inventory_lock_query(seller_id, candy_ids):
    """Query one seller's rows for a cart, holding a write lock on each.

    The rows are locked in ascending candy_id order so two carts that share
    items cannot grab the same pair in opposite orders and deadlock. On SQLite
    `with_for_update()` renders nothing, because it has no row-level locks.
    """
    return (
        SellerInventory.query.filter(
            SellerInventory.seller_id == seller_id,
            SellerInventory.candy_id.in_(sorted(candy_ids)),
        )
        .order_by(SellerInventory.candy_id.asc())
        .with_for_update()
    )


def create_app(config_overrides=None):
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = resolve_database_url()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    # Neon suspends its compute after a few idle minutes and drops any
    # connections SQLAlchemy is still holding open. Without pre_ping, the
    # first request after a suspend reuses the dead connection and dies with
    # "SSL connection has been closed unexpectedly" instead of reconnecting.
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }
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
    app.config["STRIPE_CONNECT_WEBHOOK_SECRET"] = os.environ.get(
        "STRIPE_CONNECT_WEBHOOK_SECRET", ""
    )
    app.config["CURRENCY"] = os.environ.get("CURRENCY", "usd").lower()
    app.config["PLATFORM_FEE_PERCENT"] = _env_float("PLATFORM_FEE_PERCENT", 10)
    app.config["PLATFORM_FEE_FLAT_CENTS"] = _env_int("PLATFORM_FEE_FLAT_CENTS", 0)
    app.config["CHECKOUT_SESSION_TTL_MINUTES"] = _env_int("CHECKOUT_SESSION_TTL_MINUTES", 31)
    app.config["PENDING_ORDER_TTL_MINUTES"] = _env_int("PENDING_ORDER_TTL_MINUTES", 45)

    # Image storage. Any S3-compatible bucket works; Cloudflare R2 is what this
    # was written against. Leaving these unset simply disables uploads -- the
    # rest of the marketplace keeps working, and /config tells the frontend to
    # hide the upload controls rather than offer a button that cannot succeed.
    app.config["STORAGE_ENDPOINT_URL"] = os.environ.get("STORAGE_ENDPOINT_URL", "")
    app.config["STORAGE_BUCKET"] = os.environ.get("STORAGE_BUCKET", "")
    app.config["STORAGE_ACCESS_KEY_ID"] = os.environ.get("STORAGE_ACCESS_KEY_ID", "")
    app.config["STORAGE_SECRET_ACCESS_KEY"] = os.environ.get(
        "STORAGE_SECRET_ACCESS_KEY", ""
    )
    app.config["STORAGE_REGION"] = os.environ.get("STORAGE_REGION", "auto")
    app.config["STORAGE_PUBLIC_BASE_URL"] = os.environ.get("STORAGE_PUBLIC_BASE_URL", "")
    app.config["MAX_UPLOAD_BYTES"] = _env_int(
        "MAX_UPLOAD_BYTES", storage.DEFAULT_MAX_UPLOAD_BYTES
    )
    app.config["MAX_SELLER_PHOTOS"] = _env_int("MAX_SELLER_PHOTOS", 12)

    # Off by default so this deploy does not lock out the shops that are
    # already approved. Turn it on before launch to require that a shop's owner
    # has passed Stripe Identity before an admin can approve them.
    app.config["REQUIRE_SELLER_IDENTITY"] = _env_bool("REQUIRE_SELLER_IDENTITY", False)

    app.config["RUN_MIGRATIONS_ON_BOOT"] = True

    if config_overrides:
        app.config.update(config_overrides)

    db.init_app(app)
    jwt = JWTManager(app)
    CORS(app, origins=origin_list or "*")

    @app.after_request
    def set_security_headers(response):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https://api.neighborhoodcandylady.com"
        )
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

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
        """Give a shop toggle rows for active platform catalog items only."""
        existing = {
            row.candy_id
            for row in SellerInventory.query.filter_by(seller_id=seller_id).all()
        }
        missing = [
            candy
            for candy in Candy.query.filter_by(owner_seller_id=None, is_active=True).all()
            if candy.id not in existing
        ]
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

    def slug_taken(candidate, exclude_seller_id=None):
        query = Seller.query.filter(Seller.slug == candidate)
        if exclude_seller_id is not None:
            query = query.filter(Seller.id != exclude_seller_id)
        return db.session.query(query.exists()).scalar()

    def ensure_seller_slug(seller):
        """Give a shop its public address the first time it is approved.

        An existing slug is never rewritten here: it may already be printed on
        a flyer. Only the seller (or an admin) changes it, on purpose.
        """
        if not seller.slug:
            seller.slug = storefront.unique_slug(
                seller.shop_name,
                lambda candidate: slug_taken(candidate, seller.id),
            )
        return seller.slug

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

    def require_connect_ready(seller):
        """Refuse card checkout for a shop Stripe cannot pay out to yet.

        Money for a new order always goes straight to the shop's Express
        account. Collecting it on the platform instead would quietly bring back
        the hand-payout model this replaces, so a shop that has not finished
        Connect onboarding simply cannot take cards until it does.
        """
        if not seller or not seller.accepts_connect_payments:
            abort(
                409,
                description=(
                    f"{seller.shop_name if seller else 'This shop'} cannot accept "
                    "card payments yet. The seller needs to finish payout setup."
                ),
            )
        return seller.stripe_account_id

    def start_checkout(order, user, return_to=None):
        # Decided per session, not per order: the destination is whatever the
        # shop's account is when the buyer actually pays.
        destination = require_connect_ready(order.seller)
        session = payments.create_checkout_session(
            order,
            user,
            payments.checkout_return_base(request.headers.get("Origin")),
            destination_account_id=destination,
            return_to=return_to,
        )
        order.stripe_destination_account_id = destination
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
        # The frontend uses these to decide whether to show upload and
        # verification controls at all, so a half-configured deploy degrades to
        # a missing button instead of one that always fails.
        config["uploads_enabled"] = storage.is_configured(app.config)
        config["max_upload_bytes"] = storage.max_upload_bytes(app.config)
        config["accepted_image_types"] = sorted(storage.ALLOWED_CONTENT_TYPES)
        config["identity_enabled"] = identity.identity_enabled()
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

    @app.route("/me", methods=["DELETE"])
    @require_roles()
    def delete_me():
        """Permanently delete the signed-in account (App Store 5.1.1(v)).

        The token is the authorization, like every other /me route. A client
        that wants the extra confirmation step can also send the account
        password, and then it has to be right.
        """
        user = current_user()
        accounts.assert_self_deletable(user)

        data = request.get_json(silent=True) or {}
        password = data.get("password")
        if password and not user.check_password(password):
            abort(401, description="current password is incorrect")

        # Hand back the stock held by checkouts the buyer will never finish.
        for order in accounts.orders_to_release(user):
            release_order_inventory(order)
            order.payment_status = "expired"

        accounts.delete_account(user)
        db.session.commit()
        # The token outlives the row by design, but every authenticated route
        # resolves it to a user first, so it stops working right now.
        return "", 204

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
        candies = Candy.query.filter_by(owner_seller_id=None, is_active=True).order_by(Candy.name)
        return jsonify([candy.to_dict() for candy in candies.all()])

    @app.route("/candies/<int:candy_id>", methods=["GET"])
    def get_candy(candy_id):
        candy = Candy.query.filter_by(
            id=candy_id, owner_seller_id=None, is_active=True
        ).first_or_404()
        return jsonify(candy.to_dict())

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
        if candy.owner_seller_id is not None:
            abort(400, description="seller-owned items must be managed through the seller item API")
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
        if candy.owner_seller_id is not None:
            abort(400, description="seller-owned items must be managed through the seller item API")
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

        # Once this is switched on, a shop cannot go live until the person
        # behind it has passed an ID check. Rejection is always allowed: there
        # is no reason to make an admin verify someone in order to turn them
        # down.
        if (
            status == "approved"
            and app.config["REQUIRE_SELLER_IDENTITY"]
            and not seller.identity_verified
        ):
            abort(
                409,
                description=(
                    "this shop's owner has not completed identity verification yet"
                ),
            )

        seller.status = status
        if status == "approved":
            ensure_seller_slug(seller)
        db.session.commit()
        if status == "approved":
            ensure_seller_inventory_rows(seller.id)
        return jsonify(seller.to_dict(include_contact_email=True))

    # ------------------------------------------------------------------
    # Image uploads
    #
    # The browser uploads straight to the bucket. This API only signs the
    # request beforehand and checks what landed afterwards, so a 4MB phone
    # photo never occupies a request worker on the free tier.
    # ------------------------------------------------------------------
    def require_storage():
        if not storage.is_configured(app.config):
            abort(503, description="Photo uploads are not configured on this server.")

    def validate_upload_request(data):
        """Shared checks for signing and for confirming."""
        content_type = (data.get("content_type") or "").split(";")[0].strip().lower()
        if content_type not in storage.ALLOWED_CONTENT_TYPES:
            abort(
                400,
                description=(
                    "photos must be JPEG, PNG or WebP "
                    f"(got {content_type or 'nothing'})"
                ),
            )
        return content_type

    @app.route("/uploads/sign", methods=["POST"])
    @require_roles()
    def sign_upload():
        """Hand back a short-lived URL the browser can PUT one image to.

        Authorization happens here rather than at confirm time: the key embeds
        the requesting account, and the URL only permits that one key.
        """
        require_storage()
        user = current_user()
        data = request.get_json() or {}

        purpose = (data.get("purpose") or "").strip()
        if purpose not in storage.PURPOSES:
            abort(400, description=f"purpose must be one of: {', '.join(storage.PURPOSES)}")
        content_type = validate_upload_request(data)

        limit = storage.max_upload_bytes(app.config)
        try:
            byte_size = int(data.get("byte_size") or 0)
        except (TypeError, ValueError):
            byte_size = 0
        if byte_size <= 0:
            abort(400, description="byte_size is required")
        if byte_size > limit:
            abort(413, description=f"photos must be smaller than {limit // (1024 * 1024)}MB")

        # Only a seller or an admin has a shop to put candy photos on. Profile
        # photos belong to whoever is asking, buyer or seller alike.
        if purpose == "candy_photo" and user.role not in ("seller", "admin"):
            abort(403, description="only a shop can upload candy photos")

        key = storage.build_object_key(purpose, user.id, content_type)
        try:
            signed = storage.create_upload_url(app.config, key, content_type)
        except storage.StorageNotConfigured:
            abort(503, description="Photo uploads are not configured on this server.")
        signed["content_type"] = content_type
        return jsonify(signed), 201

    def confirm_uploaded_object(key, content_type):
        """Re-read the object and reject anything that does not match.

        Without this, a client could confirm a key it never wrote, or write
        something far larger than it declared, since a presigned PUT cannot
        constrain length. Anything that fails here is deleted rather than left
        to sit in the bucket.
        """
        require_storage()
        if not key or not isinstance(key, str):
            abort(400, description="key is required")
        verified = storage.verify_uploaded_object(
            app.config, key, content_type, storage.max_upload_bytes(app.config)
        )
        if verified is None:
            storage.delete_object(app.config, key)
            abort(400, description="that upload could not be verified; try again")
        return verified

    def assert_key_belongs_to(key, purpose, user):
        """Keys are minted per account, so this catches a confirm that replays
        someone else's key."""
        expected_prefix = f"{purpose}/"
        if not key.startswith(expected_prefix):
            abort(400, description="that upload does not match this request")
        if not key.rsplit("/", 1)[-1].startswith(f"{user.id}-"):
            abort(403, description="that upload belongs to another account")

    @app.route("/sellers/<int:seller_id>/photos", methods=["GET"])
    @require_roles("seller", "admin")
    def list_seller_photos(seller_id):
        """Everything the shop has uploaded, including what is still waiting on
        review. The public storefront only ever sees approved ones."""
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        photos = sorted(seller.photos, key=lambda photo: photo.id, reverse=True)
        return jsonify([photo.to_dict() for photo in photos])

    @app.route("/sellers/<int:seller_id>/photos", methods=["POST"])
    @require_roles("seller", "admin")
    def create_seller_photo(seller_id):
        user = current_user()
        assert_seller_access(user, seller_id)
        seller = Seller.query.get_or_404(seller_id)

        data = request.get_json() or {}
        content_type = validate_upload_request(data)
        key = data.get("key")
        assert_key_belongs_to(key or "", "candy_photo", user)

        limit = app.config["MAX_SELLER_PHOTOS"]
        if len(seller.photos) >= limit:
            abort(409, description=f"a shop can hold at most {limit} photos")
        if SellerPhoto.query.filter_by(object_key=key).first():
            abort(409, description="that photo has already been added")

        candy_id = data.get("candy_id")
        if candy_id is not None:
            Candy.query.get_or_404(int(candy_id))

        verified = confirm_uploaded_object(key, content_type)
        photo = SellerPhoto(
            seller_id=seller.id,
            candy_id=int(candy_id) if candy_id is not None else None,
            object_key=verified["key"],
            content_type=verified["content_type"],
            byte_size=verified["byte_size"],
            caption=(data.get("caption") or "").strip()[:200] or None,
            status="pending",
        )
        db.session.add(photo)
        db.session.commit()
        return jsonify(photo.to_dict()), 201

    @app.route("/sellers/<int:seller_id>/photos/<int:photo_id>", methods=["DELETE"])
    @require_roles("seller", "admin")
    def delete_seller_photo(seller_id, photo_id):
        assert_seller_access(current_user(), seller_id)
        photo = SellerPhoto.query.filter_by(id=photo_id, seller_id=seller_id).first_or_404()
        key = photo.object_key
        db.session.delete(photo)
        db.session.commit()
        storage.delete_object(app.config, key)
        return "", 204

    @app.route("/sellers/<int:seller_id>/profile-photo", methods=["PUT"])
    @require_roles("seller", "admin")
    def set_seller_profile_photo(seller_id):
        """The face buyers see on the storefront. Not the Stripe selfie."""
        user = current_user()
        assert_seller_access(user, seller_id)
        seller = Seller.query.get_or_404(seller_id)

        data = request.get_json() or {}
        content_type = validate_upload_request(data)
        key = data.get("key")
        assert_key_belongs_to(key or "", "profile_photo", user)
        verified = confirm_uploaded_object(key, content_type)

        previous_key = seller.profile_photo_key
        seller.profile_photo_key = verified["key"]
        # A replacement goes back through review; otherwise an approved photo
        # could be swapped for anything after the fact.
        seller.profile_photo_status = "pending"
        db.session.commit()
        if previous_key and previous_key != verified["key"]:
            storage.delete_object(app.config, previous_key)
        return jsonify(seller.to_dict(include_contact_email=True))

    @app.route("/me/photo", methods=["PUT"])
    @require_roles()
    def set_my_photo():
        user = current_user()
        data = request.get_json() or {}
        content_type = validate_upload_request(data)
        key = data.get("key")
        assert_key_belongs_to(key or "", "profile_photo", user)
        verified = confirm_uploaded_object(key, content_type)

        previous_key = user.photo_key
        user.photo_key = verified["key"]
        user.photo_status = "pending"
        db.session.commit()
        if previous_key and previous_key != verified["key"]:
            storage.delete_object(app.config, previous_key)
        return jsonify(user.to_dict())

    # ------------------------------------------------------------------
    # Photo moderation
    # ------------------------------------------------------------------
    @app.route("/admin/photos", methods=["GET"])
    @require_roles("admin")
    def list_photos_for_review():
        status = request.args.get("status", "pending")
        if status not in PHOTO_STATUSES:
            abort(400, description="invalid photo status")
        photos = (
            SellerPhoto.query.filter_by(status=status).order_by(SellerPhoto.id.asc()).all()
        )
        return jsonify(
            [
                dict(photo.to_dict(), shop_name=photo.seller.shop_name if photo.seller else None)
                for photo in photos
            ]
        )

    @app.route("/admin/photos/<int:photo_id>", methods=["PUT"])
    @require_roles("admin")
    def review_photo(photo_id):
        photo = SellerPhoto.query.get_or_404(photo_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in ("approved", "rejected"):
            abort(400, description="status must be approved or rejected")

        photo.status = status
        photo.reviewed_at = utcnow()
        photo.reviewed_by_user_id = current_user().id
        photo.rejection_reason = (data.get("rejection_reason") or "").strip()[:300] or None
        db.session.commit()

        # A rejected image has no reason to stay in the bucket. The row remains
        # so the seller can see it was reviewed and why.
        if status == "rejected":
            storage.delete_object(app.config, photo.object_key)
        return jsonify(photo.to_dict())

    @app.route("/admin/sellers/<int:seller_id>/profile-photo", methods=["PUT"])
    @require_roles("admin")
    def review_seller_profile_photo(seller_id):
        seller = Seller.query.get_or_404(seller_id)
        data = request.get_json() or {}
        status = data.get("status")
        if status not in ("approved", "rejected"):
            abort(400, description="status must be approved or rejected")
        seller.profile_photo_status = status
        db.session.commit()
        if status == "rejected" and seller.profile_photo_key:
            storage.delete_object(app.config, seller.profile_photo_key)
            seller.profile_photo_key = None
            db.session.commit()
        return jsonify(seller.to_dict(include_contact_email=True))

    # ------------------------------------------------------------------
    # Identity verification
    #
    # The ID document and the selfie are collected by Stripe on its own hosted
    # page and stay there. What lands here is a verdict.
    # ------------------------------------------------------------------
    def identity_payload(user):
        return {
            "identity_status": user.identity_status,
            "identity_verified": user.identity_verified,
            "identity_error": identity.friendly_error(user.identity_error_code),
            "identity_verified_at": (
                user.identity_verified_at.isoformat()
                if user.identity_verified_at
                else None
            ),
        }

    def apply_identity_session(user, session):
        """Write a Stripe verdict onto the account it belongs to."""
        status = identity.map_status(session.get("status"))
        user.identity_status = status
        user.identity_session_id = session.get("id") or user.identity_session_id
        if status == "verified":
            user.identity_error_code = None
            if user.identity_verified_at is None:
                user.identity_verified_at = utcnow()
        else:
            user.identity_error_code = identity.error_code_from_session(session)
        db.session.commit()
        return status

    @app.route("/identity/session", methods=["POST"])
    @require_roles("seller", "admin")
    def start_identity_verification():
        user = current_user()
        if user.identity_verified:
            return jsonify(dict(identity_payload(user), url=None)), 200

        # An abandoned session left open would keep returning its old verdict.
        if user.identity_session_id and user.identity_status in (
            identity.PROCESSING,
            identity.REQUIRES_INPUT,
        ):
            identity.cancel_verification_session(user.identity_session_id)

        return_url = f"{app.config['PUBLIC_SITE_URL']}/seller.html?identity=return"
        session = identity.create_verification_session(user, return_url)
        apply_identity_session(user, session)
        return (
            jsonify(dict(identity_payload(user), url=session.get("url"))),
            201,
        )

    @app.route("/identity/status", methods=["GET"])
    @require_roles()
    def get_identity_status():
        return jsonify(identity_payload(current_user()))

    @app.route("/identity/refresh", methods=["POST"])
    @require_roles()
    def refresh_identity_status():
        """Pull the verdict from Stripe on demand.

        The webhook is the normal path, but it needs STRIPE_WEBHOOK_SECRET set
        and a reachable endpoint. This is the authenticated fallback, the same
        shape as the payment confirm path, so verification still completes on a
        deploy with no webhook configured.
        """
        user = current_user()
        if not user.identity_session_id:
            return jsonify(identity_payload(user))
        session = identity.retrieve_verification_session(user.identity_session_id)
        apply_identity_session(user, session)
        return jsonify(identity_payload(user))

    # ------------------------------------------------------------------
    # Stripe Connect (Express)
    #
    # A shop links a connected account through Stripe's hosted onboarding.
    # Nothing a seller types there (legal name, bank, SSN) reaches this API;
    # we keep the acct_ id and the two readiness flags Stripe reports.
    # ------------------------------------------------------------------
    def connect_payload(seller):
        payload = seller.connect_dict()
        payload["seller_id"] = seller.id
        return payload

    def connect_return_url(outcome):
        # Same rule as checkout: an allow-listed requesting origin (so local
        # and preview frontends come back to themselves), else PUBLIC_SITE_URL.
        base = payments.checkout_return_base(request.headers.get("Origin"))
        return f"{base}/seller.html?stripe={outcome}"

    @app.route("/sellers/<int:seller_id>/stripe/connect", methods=["POST"])
    @require_roles("seller", "admin")
    def start_stripe_connect(seller_id):
        """Create (or reuse) the shop's Express account and hand back onboarding.

        Calling this again is how a seller resumes an unfinished onboarding or
        updates details later: the account is reused and a fresh one-time link
        is issued, since Account Links expire within minutes.
        """
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        if seller.status == "rejected":
            abort(400, description="a rejected shop cannot set up payouts")

        if not seller.stripe_account_id:
            account = connect.create_express_account(seller)
            seller.stripe_account_id = account["id"]
            connect.apply_account(seller, account, utcnow())
            db.session.commit()

        link = connect.create_account_link(
            seller.stripe_account_id,
            refresh_url=connect_return_url("refresh"),
            return_url=connect_return_url("return"),
        )
        return jsonify(dict(connect_payload(seller), url=link.get("url"))), 201

    @app.route("/sellers/<int:seller_id>/stripe/status", methods=["GET"])
    @require_roles("seller", "admin")
    def get_stripe_connect_status(seller_id):
        """Pull the account from Stripe and mirror its readiness flags.

        The authenticated counterpart to the account.updated webhook, so a
        deploy without the Connect webhook still learns when a shop is ready.
        """
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        if seller.stripe_account_id:
            account = connect.retrieve_account(seller.stripe_account_id)
            connect.apply_account(seller, account, utcnow())
            db.session.commit()
        return jsonify(connect_payload(seller))

    @app.route("/sellers/<int:seller_id>/stripe/dashboard", methods=["POST"])
    @require_roles("seller", "admin")
    def open_stripe_dashboard(seller_id):
        """One-time link into the shop's Stripe Express dashboard."""
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        if not seller.stripe_account_id or not seller.stripe_details_submitted:
            abort(400, description="finish payout setup first")
        link = connect.create_login_link(seller.stripe_account_id)
        return jsonify(url=link.get("url"))

    # ------------------------------------------------------------------
    # Storefronts
    # ------------------------------------------------------------------
    def in_stock_counts():
        """seller_id -> number of distinct items a buyer could order now.

        Counts the same rows the storefront shows: active items that are the
        platform's or the shop's own, never another shop's custom item.
        """
        return dict(
            db.session.query(SellerInventory.seller_id, func.count(SellerInventory.id))
            .join(Candy)
            .filter(
                SellerInventory.inventory_count > 0,
                SellerInventory.status.in_(("in-stock", "low-stock")),
                Candy.is_active.is_(True),
                or_(
                    Candy.owner_seller_id.is_(None),
                    Candy.owner_seller_id == SellerInventory.seller_id,
                ),
            )
            .group_by(SellerInventory.seller_id)
            .all()
        )

    @app.route("/shops", methods=["GET"])
    def list_shops():
        """Compact directory of approved shops that have a public address.

        For a buyer hub that links out to `/s/<slug>`; lighter than /sellers
        (no photo gallery) and keyed by slug rather than id.
        """
        release_stale_pending_orders()
        sellers = (
            Seller.query.filter(Seller.status == "approved", Seller.slug.isnot(None))
            .order_by(Seller.shop_name)
            .all()
        )
        counts = in_stock_counts()
        return jsonify(
            [
                {
                    "id": seller.id,
                    "slug": seller.slug,
                    "storefront_path": seller.storefront_path,
                    "shop_name": seller.shop_name,
                    "tagline": seller.tagline,
                    "neighborhood": seller.neighborhood,
                    "pickup_window": seller.pickup_window,
                    "logo_url": seller.logo_url,
                    "theme": seller.theme_dict(),
                    "identity_verified": seller.identity_verified,
                    "accepts_card_payments": seller.accepts_connect_payments,
                    "in_stock_count": counts.get(seller.id, 0),
                }
                for seller in sellers
            ]
        )

    @app.route("/sellers", methods=["GET"])
    def list_sellers():
        """Every approved shop a buyer can order from."""
        release_stale_pending_orders()
        sellers = (
            Seller.query.filter_by(status="approved").order_by(Seller.shop_name).all()
        )
        counts = in_stock_counts()
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

        inventory = SellerInventory.query.join(Candy).filter(
            SellerInventory.seller_id == seller_id,
            SellerInventory.inventory_count > 0,
            SellerInventory.status.in_(("in-stock", "low-stock")),
            Candy.is_active.is_(True),
            or_(Candy.owner_seller_id.is_(None), Candy.owner_seller_id == seller_id),
        ).all()
        return jsonify(
            {
                "seller": seller.to_dict(),
                "items": [item.to_dict() for item in inventory],
            }
        )

    @app.route("/shops/<slug>", methods=["GET"])
    def get_shop_by_slug(slug):
        """The public `/s/<slug>` page's data: one shop, its branding, its shelf.

        Same shape as `/sellers/<id>/storefront`, and the same visibility rule:
        a shop that is not approved has no public page, whatever its slug.
        """
        seller = Seller.query.filter_by(slug=storefront.normalize_slug(slug)).first()
        if seller is None or seller.status != "approved":
            abort(404, description="that shop is not available")
        return get_seller_storefront(seller.id)

    @app.route("/sellers/<int:seller_id>/storefront", methods=["PUT"])
    @require_roles("seller", "admin")
    def update_storefront_settings(seller_id):
        """Edit the shop's public identity: slug, tagline, logo, theme.

        Partial update: only fields present in the body change, and sending
        null or "" clears an optional field. The slug cannot be cleared once
        set, only replaced, so an approved shop always has a working link.
        """
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        data = request.get_json() or {}

        if "slug" in data:
            slug = storefront.normalize_slug(data.get("slug"))
            problem = storefront.slug_problem(slug)
            if problem:
                abort(400, description=problem)
            if slug_taken(slug, seller.id):
                abort(409, description="that address is already taken")
            seller.slug = slug

        if "tagline" in data:
            tagline = str(data.get("tagline") or "").strip()
            if len(tagline) > storefront.TAGLINE_MAX_LENGTH:
                abort(
                    400,
                    description=(
                        f"tagline must be {storefront.TAGLINE_MAX_LENGTH} characters or fewer"
                    ),
                )
            seller.tagline = tagline or None

        for field in ("theme_primary", "theme_accent"):
            if field in data:
                try:
                    setattr(seller, field, storefront.normalize_hex_color(data.get(field)))
                except ValueError as error:
                    abort(400, description=f"{field}: {error}")

        if "logo_url" in data:
            try:
                seller.logo_url = storefront.normalize_logo_url(data.get("logo_url"))
            except ValueError as error:
                abort(400, description=str(error))

        try:
            db.session.commit()
        except IntegrityError:
            # Lost a race for the same slug between the check and the write.
            db.session.rollback()
            abort(409, description="that address is already taken")
        return jsonify(seller.to_dict(include_contact_email=True))

    # ------------------------------------------------------------------
    # Seller dashboard
    # ------------------------------------------------------------------
    def seller_item_values(data, partial=False):
        values = {}
        if not partial or "name" in data:
            name = str(data.get("name", "")).strip()
            if not name:
                abort(400, description="name is required")
            values["name"] = name
        if "description" in data or not partial:
            values["description"] = str(data.get("description") or "").strip()
        for field in ("price_cents", "inventory_count"):
            if field not in data:
                if not partial and field == "price_cents":
                    abort(400, description="price_cents is required")
                continue
            try:
                value = int(data[field])
            except (TypeError, ValueError):
                abort(400, description=f"{field} must be a non-negative integer")
            if (
                isinstance(data[field], bool)
                or (isinstance(data[field], float) and not data[field].is_integer())
                or value < 0
            ):
                abort(400, description=f"{field} must be a non-negative integer")
            values[field] = value
        if "status" in data:
            if data["status"] not in INVENTORY_STATUSES:
                abort(400, description="invalid inventory status")
            values["status"] = data["status"]
        return values

    def owned_item_or_404(seller_id, candy_id):
        candy = Candy.query.get_or_404(candy_id)
        if candy.owner_seller_id != seller_id:
            abort(403, description="this item belongs to another shop or the platform catalog")
        return candy

    @app.route("/sellers/<int:seller_id>/items", methods=["POST"])
    @require_roles("seller", "admin")
    def create_seller_item(seller_id):
        assert_seller_access(current_user(), seller_id)
        seller = Seller.query.get_or_404(seller_id)
        if seller.status != "approved":
            abort(400, description="seller must be approved before adding items")
        values = seller_item_values(request.get_json() or {})
        count = values.pop("inventory_count", 0)
        status = values.pop("status", "in-stock" if count > 4 else "low-stock")
        if count == 0:
            status = "out-of-stock"
        elif status == "out-of-stock":
            count = 0
        candy = Candy(owner_seller_id=seller_id, is_active=True, **values)
        db.session.add(candy)
        db.session.flush()
        inventory = SellerInventory(
            seller_id=seller_id, candy_id=candy.id, inventory_count=count, status=status
        )
        db.session.add(inventory)
        db.session.commit()
        return jsonify(inventory.to_dict()), 201

    @app.route("/sellers/<int:seller_id>/items/<int:candy_id>", methods=["PUT"])
    @require_roles("seller", "admin")
    def update_seller_item(seller_id, candy_id):
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        candy = owned_item_or_404(seller_id, candy_id)
        if not candy.is_active:
            abort(400, description="removed items cannot be edited")
        values = seller_item_values(request.get_json() or {}, partial=True)
        inventory = SellerInventory.query.filter_by(
            seller_id=seller_id, candy_id=candy_id
        ).first_or_404()
        for field in ("name", "description", "price_cents"):
            if field in values:
                setattr(candy, field, values[field])
        if "inventory_count" in values:
            inventory.inventory_count = values["inventory_count"]
            if inventory.inventory_count == 0:
                inventory.status = "out-of-stock"
            elif "status" not in values:
                inventory.status = "low-stock" if inventory.inventory_count <= 4 else "in-stock"
        if "status" in values:
            inventory.status = values["status"]
            if inventory.status == "out-of-stock":
                inventory.inventory_count = 0
        db.session.commit()
        return jsonify(inventory.to_dict())

    @app.route("/sellers/<int:seller_id>/items/<int:candy_id>", methods=["DELETE"])
    @require_roles("seller", "admin")
    def delete_seller_item(seller_id, candy_id):
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        candy = owned_item_or_404(seller_id, candy_id)
        candy.is_active = False
        inventory = SellerInventory.query.filter_by(
            seller_id=seller_id, candy_id=candy_id
        ).first()
        if inventory:
            inventory.inventory_count = 0
            inventory.status = "out-of-stock"
        db.session.commit()
        return "", 204

    @app.route("/sellers/<int:seller_id>/inventory", methods=["GET"])
    @require_roles("seller", "admin")
    def get_seller_inventory(seller_id):
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        ensure_seller_inventory_rows(seller_id)
        inventory = (
            SellerInventory.query.filter_by(seller_id=seller_id)
            .join(Candy)
            .filter(Candy.is_active.is_(True))
            .order_by(Candy.name)
            .all()
        )
        return jsonify([item.to_dict() for item in inventory])

    @app.route("/sellers/<int:seller_id>/inventory/<int:candy_id>", methods=["PUT"])
    @require_roles("seller", "admin")
    def update_seller_inventory(seller_id, candy_id):
        assert_seller_access(current_user(), seller_id)
        Seller.query.get_or_404(seller_id)
        candy = Candy.query.get_or_404(candy_id)
        if not candy.is_active or candy.owner_seller_id not in (None, seller_id):
            abort(403, description="this item is not available to this shop")
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
            # A missing buyer means the account was deleted; the order still
            # has to be handed over, so it stays in the queue without a name.
            data["buyer_name"] = (
                order.user.name if order.user else accounts.ANONYMOUS_BUYER_LABEL
            )
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

        # Fail before touching stock if payments are not wired up, or if this
        # shop has nowhere for Stripe to send the money.
        payments.require_stripe()
        require_connect_ready(seller)

        # A cart can list the same candy on more than one line. Total them up
        # first so the stock check sees the real demand for each item instead
        # of judging every line on its own.
        requested = {}
        for item in items:
            candy_id = item.get("candy_id")
            if not candy_id:
                abort(400, description="each order item requires candy_id")
            try:
                candy_id = int(candy_id)
            except (TypeError, ValueError):
                abort(400, description="each order item requires candy_id")
            quantity = int(item.get("quantity", 1))
            if quantity <= 0:
                abort(400, description="quantity must be positive")
            requested[candy_id] = requested.get(candy_id, 0) + quantity

        # Lock every row this cart draws from before reading any count, so a
        # second checkout cannot read the same stock and sell it twice.
        locked = {
            inventory.candy_id: inventory
            for inventory in seller_inventory_lock_query(seller.id, requested.keys()).all()
        }

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
        for candy_id, quantity in sorted(requested.items()):
            candy = Candy.query.get_or_404(candy_id)
            if not candy.is_active or candy.owner_seller_id not in (None, seller.id):
                abort(400, description="item is not available from this seller")
            inventory = locked.get(candy_id)
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
        checkout_url = start_checkout(order, user, return_to=data.get("return_to"))
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

        data = request.get_json(silent=True) or {}
        checkout_url = start_checkout(order, order.user, return_to=data.get("return_to"))
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

    @app.route("/admin/orders/<int:order_id>/refund", methods=["POST"])
    @require_roles("admin")
    def refund_order(order_id):
        """Full refund. Connect orders pull the money back from the shop.

        The order flips to "refunded" here as well as on the charge.refunded
        webhook, so the admin sees the result without waiting on delivery.
        """
        order = Order.query.get_or_404(order_id)
        if order.payment_status != "paid":
            abort(400, description="only paid orders can be refunded")
        payments.refund_order(order)
        order.payment_status = "refunded"
        db.session.commit()
        return jsonify(order_response(order))

    @app.route("/stripe/webhook", methods=["POST"])
    def stripe_webhook():
        event = payments.construct_webhook_event(
            request.get_data(), request.headers.get("Stripe-Signature")
        )
        event_type = event.get("type")
        session = (event.get("data") or {}).get("object") or {}

        # Identity events arrive on the same endpoint and the same signing
        # secret, but they are about a person, not an order, so they branch
        # before any order lookup.
        if (event_type or "").startswith("identity.verification_session."):
            handled = _apply_identity_event(session)
            return jsonify(received=True, handled=handled)

        # A shop's Express account changed (onboarding finished, Stripe asked
        # for more, charges switched off). Matched on the stored acct_ id only:
        # metadata is ours, but the id is what Stripe actually vouches for.
        if event_type == "account.updated":
            seller = (
                Seller.query.filter_by(stripe_account_id=session.get("id")).first()
                if session.get("id")
                else None
            )
            if seller is None:
                return jsonify(received=True, handled=False)
            connect.apply_account(seller, session, utcnow())
            db.session.commit()
            return jsonify(received=True, handled=True)

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

    def _apply_identity_event(event_object):
        """Route a verification verdict to the account that started it.

        Match on our own metadata first, then on the stored session id, so a
        session started before metadata existed still resolves.  A seller can
        replace an unfinished session, though, and Stripe may deliver events
        out of order.  Only the currently stored session is authoritative;
        otherwise a late event for the abandoned session could overwrite the
        newer verdict.
        """
        metadata = event_object.get("metadata") or {}
        session_id = event_object.get("id")
        if not session_id:
            return False

        user = None
        user_id = metadata.get("user_id")
        if user_id:
            try:
                user = User.query.get(int(user_id))
            except (TypeError, ValueError):
                user = None
        if user is None:
            user = User.query.filter_by(identity_session_id=session_id).first()
        if user is None or user.identity_session_id != session_id:
            return False

        apply_identity_session(user, event_object)
        return True

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
        """What the platform has collected and what it still owes sellers.

        Connect orders (a destination was recorded) were paid out to the shop
        by Stripe at charge time, so only pre-Connect "manual" orders count
        toward what the platform owes by hand.
        """
        paid = Order.query.filter(Order.payment_status == "paid")

        def totals(query):
            row = query.with_entities(
                func.coalesce(func.sum(Order.total_cents), 0),
                func.coalesce(func.sum(Order.platform_fee_cents), 0),
                func.count(Order.id),
            ).one()
            return int(row[0]), int(row[1]), int(row[2])

        gross_cents, fee_cents, order_count = totals(paid)
        connect_gross, connect_fee, connect_count = totals(
            paid.filter(Order.stripe_destination_account_id.isnot(None))
        )
        manual_gross, manual_fee, manual_count = totals(
            paid.filter(Order.stripe_destination_account_id.is_(None))
        )
        return jsonify(
            paid_order_count=order_count,
            gross_cents=gross_cents,
            platform_fee_cents=fee_cents,
            # Every seller share, however it is paid. Kept for compatibility.
            seller_payout_cents=max(0, gross_cents - fee_cents),
            connect_order_count=connect_count,
            connect_seller_payout_cents=max(0, connect_gross - connect_fee),
            manual_order_count=manual_count,
            # What the platform still has to pay sellers itself.
            seller_payout_owed_cents=max(0, manual_gross - manual_fee),
            platform_fee_percent=app.config["PLATFORM_FEE_PERCENT"],
            platform_fee_flat_cents=app.config["PLATFORM_FEE_FLAT_CENTS"],
        )


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
