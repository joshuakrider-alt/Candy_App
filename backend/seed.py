"""Idempotent demo seed.

This never drops tables by default: the same code path runs against the
production Neon database, so it only inserts what is missing and leaves
existing rows (and their passwords) alone.

Passwords come from SEED_ADMIN_PASSWORD / SEED_SELLER_PASSWORD /
SEED_BUYER_PASSWORD when set. Otherwise a random one is generated and printed
once, so no credential is ever committed to the repo.
"""

import argparse
import os
import secrets

from models import Candy, Seller, SellerInventory, User, db

CATALOG = (
    ("Sour Gummy Mix", "Tangy fruit gummies", 250),
    ("Chocolate Bar", "Creamy milk chocolate", 199),
    ("Rainbow Lollipop", "Oversized swirl pop", 125),
    ("Peanut Butter Cups", "Two-pack of cups", 175),
    ("Gummy Worms", "Sour coated worms", 225),
    ("Hot Chips", "Spicy crunchy chips", 150),
    ("Nacho Cheese Chips", "Cheesy tortilla chips", 175),
    ("Cheese Puffs", "Light and cheesy puffs", 150),
    ("Salted Pretzels", "Crunchy mini pretzels", 125),
    ("Orange Soda Bottle", "Chilled orange soda", 175),
    ("Grape Soda Bottle", "Chilled grape soda", 175),
    ("Fruit Punch Juice", "Cold fruit punch", 150),
    ("Lemonade Cup", "Fresh squeezed lemonade", 200),
)

SELLERS = (
    {
        "shop_name": "Ms. Kiki's Snack Spot",
        "contact_name": "Kiana Roberts",
        "contact_email": "kiki@example.com",
        "neighborhood": "Cherry Hill",
        "pickup_window": "Weekdays, 2:30 PM - 7:00 PM",
        "status": "approved",
        "stock": {
            "Sour Gummy Mix": 24,
            "Chocolate Bar": 12,
            "Hot Chips": 10,
            "Orange Soda Bottle": 4,
            "Lemonade Cup": 8,
            "Gummy Worms": 6,
        },
    },
    {
        "shop_name": "Northview Snack Stop",
        "contact_name": "Jordan Lee",
        "contact_email": "jordan@example.com",
        "neighborhood": "Northview",
        "pickup_window": "Weekdays, 3:00 PM - 6:30 PM",
        "status": "approved",
        "stock": {
            "Rainbow Lollipop": 18,
            "Peanut Butter Cups": 9,
            "Nacho Cheese Chips": 14,
            "Cheese Puffs": 7,
            "Grape Soda Bottle": 11,
            "Fruit Punch Juice": 5,
        },
    },
    {
        "shop_name": "Eastside Corner Treats",
        "contact_name": "Marcus Hill",
        "contact_email": "marcus@example.com",
        "neighborhood": "Eastside",
        "pickup_window": "Weekends, 12:00 PM - 8:00 PM",
        "status": "pending",
        "stock": {},
    },
)

BUYERS = (
    ("Alice Carter", "alice@example.com"),
    ("Bob Davis", "bob@example.com"),
)

ADMIN = ("Platform Admin", "admin@example.com")


def _password(env_name, generated):
    return os.environ.get(env_name) or generated


def _upsert_user(name, email, role, password, seller_id=None):
    """Create a login, or align an existing one without touching its password."""
    email = email.strip().lower()
    user = User.query.filter_by(email=email).first()
    created = False
    if user is None:
        user = User(name=name, email=email)
        db.session.add(user)
        created = True
    user.role = role
    user.seller_id = seller_id
    if created or not user.has_password:
        user.set_password(password)
    return user, created


def seed_demo_data(verbose=True):
    generated = secrets.token_urlsafe(12)
    passwords = {
        "admin": _password("SEED_ADMIN_PASSWORD", generated),
        "seller": _password("SEED_SELLER_PASSWORD", generated),
        "buyer": _password("SEED_BUYER_PASSWORD", generated),
    }

    catalog = {}
    for name, description, price_cents in CATALOG:
        candy = Candy.query.filter_by(name=name).first()
        if candy is None:
            candy = Candy(name=name, description=description, price_cents=price_cents)
            db.session.add(candy)
        catalog[name] = candy
    db.session.flush()

    for spec in SELLERS:
        seller = Seller.query.filter_by(shop_name=spec["shop_name"]).first()
        if seller is None:
            seller = Seller(
                shop_name=spec["shop_name"],
                contact_name=spec["contact_name"],
                contact_email=spec["contact_email"],
                neighborhood=spec["neighborhood"],
                pickup_window=spec["pickup_window"],
                status=spec["status"],
            )
            db.session.add(seller)
        elif not seller.contact_email:
            seller.contact_email = spec["contact_email"]
        db.session.flush()

        # Every approved shop gets a toggle row for every catalog item.
        for name, candy in catalog.items():
            row = SellerInventory.query.filter_by(
                seller_id=seller.id, candy_id=candy.id
            ).first()
            if row is None:
                count = spec["stock"].get(name, 0)
                row = SellerInventory(seller_id=seller.id, candy_id=candy.id)
                row.inventory_count = 0
                row.status = "out-of-stock"
                if count:
                    row.apply_count_change(count)
                db.session.add(row)

        _upsert_user(
            spec["contact_name"],
            spec["contact_email"],
            "seller",
            passwords["seller"],
            seller_id=seller.id,
        )

    for name, email in BUYERS:
        _upsert_user(name, email, "buyer", passwords["buyer"])
    _upsert_user(ADMIN[0], ADMIN[1], "admin", passwords["admin"])

    db.session.commit()

    if verbose:
        print("Seeded catalog, sellers, inventory, and logins (existing rows kept).")
        print("Logins:")
        print(f"  admin  {ADMIN[1]} / {passwords['admin']}")
        for spec in SELLERS:
            print(f"  seller {spec['contact_email']} / {passwords['seller']}")
        for _, email in BUYERS:
            print(f"  buyer  {email} / {passwords['buyer']}")
        print(
            "Passwords shown above only apply to accounts that had none. "
            "Set SEED_* env vars to choose them."
        )
    return passwords


def main():
    parser = argparse.ArgumentParser(description="Seed demo data (non-destructive).")
    parser.add_argument(
        "--reset",
        action="store_true",
        help=(
            "Drop and recreate every table first. Requires "
            "CANDY_ALLOW_DESTRUCTIVE_SEED=1 so it cannot wipe production by accident."
        ),
    )
    args = parser.parse_args()

    from app import app

    with app.app_context():
        if args.reset:
            if os.environ.get("CANDY_ALLOW_DESTRUCTIVE_SEED") != "1":
                raise SystemExit(
                    "Refusing to drop tables. Re-run with "
                    "CANDY_ALLOW_DESTRUCTIVE_SEED=1 if you really mean it."
                )
            db.drop_all()
            db.create_all()
            print("Dropped and recreated all tables.")
        seed_demo_data()


if __name__ == "__main__":
    main()
