"""Operational CLI: migrations, account passwords, and demo seeding.

Run from the `backend` directory, for example:

    python manage.py init-db
    python manage.py set-password --email you@example.com --password '...'
    python manage.py create-user --name Admin --email a@b.com --role admin --password '...'
    python manage.py list-users
"""

import argparse
import sys

from auth import MINIMUM_PASSWORD_LENGTH, normalize_email
from migrations import run_migrations
from models import ROLES, Seller, User, db


def _fail(message):
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def _check_password(password):
    if len(password or "") < MINIMUM_PASSWORD_LENGTH:
        _fail(f"password must be at least {MINIMUM_PASSWORD_LENGTH} characters")
    return password


def cmd_init_db(_args):
    db.create_all()
    added = run_migrations()
    if added:
        for table, column in sorted(added):
            print(f"added column {table}.{column}")
    print("Schema is up to date.")


def cmd_set_password(args):
    email = normalize_email(args.email)
    user = User.query.filter_by(email=email).first()
    if user is None:
        _fail(f"no account with email {email}")
    user.set_password(_check_password(args.password))
    db.session.commit()
    print(f"Password set for {email} (role={user.role}).")


def cmd_create_user(args):
    email = normalize_email(args.email)
    if args.role not in ROLES:
        _fail(f"role must be one of: {', '.join(ROLES)}")
    if User.query.filter_by(email=email).first():
        _fail(f"an account with email {email} already exists")

    seller_id = args.seller_id
    if args.role == "seller":
        if not seller_id:
            _fail("seller accounts need --seller-id")
        if Seller.query.get(seller_id) is None:
            _fail(f"no seller with id {seller_id}")
    else:
        seller_id = None

    user = User(name=args.name, email=email, role=args.role, seller_id=seller_id)
    user.set_password(_check_password(args.password))
    db.session.add(user)
    db.session.commit()
    print(f"Created {args.role} account {email} (id={user.id}).")


def cmd_set_role(args):
    email = normalize_email(args.email)
    if args.role not in ROLES:
        _fail(f"role must be one of: {', '.join(ROLES)}")
    user = User.query.filter_by(email=email).first()
    if user is None:
        _fail(f"no account with email {email}")
    if args.role == "seller":
        if not args.seller_id:
            _fail("seller accounts need --seller-id")
        if Seller.query.get(args.seller_id) is None:
            _fail(f"no seller with id {args.seller_id}")
        user.seller_id = args.seller_id
    else:
        user.seller_id = None
    user.role = args.role
    db.session.commit()
    print(f"{email} is now {user.role} (seller_id={user.seller_id}).")


def cmd_list_users(_args):
    users = User.query.order_by(User.id).all()
    if not users:
        print("No accounts yet.")
        return
    print(f"{'id':>4}  {'role':<7} {'password':<9} {'seller':<7} email")
    for user in users:
        has_password = "set" if user.has_password else "MISSING"
        seller = user.seller_id if user.seller_id else "-"
        print(f"{user.id:>4}  {user.role:<7} {has_password:<9} {str(seller):<7} {user.email}")


def cmd_list_sellers(_args):
    sellers = Seller.query.order_by(Seller.id).all()
    if not sellers:
        print("No sellers yet.")
        return
    print(f"{'id':>4}  {'status':<9} shop / contact email")
    for seller in sellers:
        print(
            f"{seller.id:>4}  {seller.status:<9} {seller.shop_name} "
            f"/ {seller.contact_email or '-'}"
        )


def cmd_seed_demo(_args):
    from seed import seed_demo_data

    seed_demo_data()


def build_parser():
    parser = argparse.ArgumentParser(description="Candy Lady API management commands.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Create tables and apply column migrations.").set_defaults(
        func=cmd_init_db
    )

    set_password = sub.add_parser("set-password", help="Set an account's password.")
    set_password.add_argument("--email", required=True)
    set_password.add_argument("--password", required=True)
    set_password.set_defaults(func=cmd_set_password)

    create_user = sub.add_parser("create-user", help="Create an account with a password.")
    create_user.add_argument("--name", required=True)
    create_user.add_argument("--email", required=True)
    create_user.add_argument("--password", required=True)
    create_user.add_argument("--role", default="buyer", choices=list(ROLES))
    create_user.add_argument("--seller-id", type=int, dest="seller_id")
    create_user.set_defaults(func=cmd_create_user)

    set_role = sub.add_parser("set-role", help="Change an account's role.")
    set_role.add_argument("--email", required=True)
    set_role.add_argument("--role", required=True, choices=list(ROLES))
    set_role.add_argument("--seller-id", type=int, dest="seller_id")
    set_role.set_defaults(func=cmd_set_role)

    sub.add_parser("list-users", help="List accounts and whether they have a password.").set_defaults(
        func=cmd_list_users
    )
    sub.add_parser("list-sellers", help="List shops and their contact emails.").set_defaults(
        func=cmd_list_sellers
    )
    sub.add_parser("seed-demo", help="Insert demo catalog/sellers/logins if missing.").set_defaults(
        func=cmd_seed_demo
    )
    return parser


def main():
    args = build_parser().parse_args()
    from app import app

    with app.app_context():
        args.func(args)


if __name__ == "__main__":
    main()
