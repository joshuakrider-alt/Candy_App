"""Small forward-only schema migrations.

The project does not use Alembic yet, and the production Neon database holds
real rows, so `db.create_all()` alone is not enough: it creates missing tables
but never adds columns to tables that already exist. These helpers add the new
columns in place and backfill them, and they are safe to run on every boot.
"""

import logging

from sqlalchemy import inspect, text

from models import ROLES, db

logger = logging.getLogger(__name__)

USER_ROLE_CONSTRAINT = "ck_user_role"

# (table, column, DDL type + default). Defaults must be constants so that
# SQLite accepts them in ALTER TABLE ... ADD COLUMN.
NEW_COLUMNS = (
    ("user", "password_hash", "VARCHAR(255)"),
    ("user", "role", "VARCHAR(20) NOT NULL DEFAULT 'buyer'"),
    ("user", "seller_id", "INTEGER"),
    ("user", "created_at", "TIMESTAMP"),
    ("seller", "contact_email", "VARCHAR(200)"),
    ("order", "payment_status", "VARCHAR(20) NOT NULL DEFAULT 'unpaid'"),
    ("order", "platform_fee_cents", "INTEGER NOT NULL DEFAULT 0"),
    ("order", "currency", "VARCHAR(10) NOT NULL DEFAULT 'usd'"),
    ("order", "pickup_code", "VARCHAR(32)"),
    ("order", "stripe_checkout_session_id", "VARCHAR(255)"),
    ("order", "stripe_payment_intent_id", "VARCHAR(255)"),
    ("order", "paid_at", "TIMESTAMP"),
    ("order", "inventory_released_at", "TIMESTAMP"),
)


def _quote(name):
    return db.engine.dialect.identifier_preparer.quote(name)


def run_migrations():
    """Add any missing columns and backfill legacy rows. Idempotent."""
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())
    added = set()

    for table, column, ddl in NEW_COLUMNS:
        if table not in existing_tables:
            continue
        columns = {col["name"] for col in inspector.get_columns(table)}
        if column in columns:
            continue
        statement = f"ALTER TABLE {_quote(table)} ADD COLUMN {_quote(column)} {ddl}"
        with db.engine.begin() as connection:
            connection.execute(text(statement))
        added.add((table, column))
        logger.info("migration: added %s.%s", table, column)

    _backfill(existing_tables, added)
    _ensure_user_role_check_constraint(existing_tables)
    return added


def _ensure_user_role_check_constraint(existing_tables):
    """Add ck_user_role to a `user` table that was created without it.

    `db.create_all()` only attaches check constraints to tables it creates, so
    the Neon `user` table predates the constraint and would never get one.
    SQLite cannot add a constraint to an existing table, so this is a no-op
    there; the model definition already covers freshly created databases.
    """
    if db.engine.dialect.name != "postgresql" or "user" not in existing_tables:
        return False

    allowed = ", ".join(f"'{role}'" for role in ROLES)
    try:
        with db.engine.begin() as connection:
            already_applied = connection.execute(
                text(
                    "SELECT 1 FROM pg_constraint constraint_row "
                    "JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid "
                    "WHERE constraint_row.conname = :name AND table_row.relname = 'user'"
                ),
                {"name": USER_ROLE_CONSTRAINT},
            ).first()
            if already_applied:
                return False
            connection.execute(
                text(
                    f"ALTER TABLE {_quote('user')} "
                    f"ADD CONSTRAINT {_quote(USER_ROLE_CONSTRAINT)} "
                    f"CHECK (role IN ({allowed}))"
                )
            )
    except Exception:  # pragma: no cover - depends on existing rows and grants
        # A row with an unexpected role would fail the ALTER. Log it instead of
        # blocking boot; every write path already validates the role.
        logger.warning("migration: could not add %s", USER_ROLE_CONSTRAINT, exc_info=True)
        return False

    logger.info("migration: added %s", USER_ROLE_CONSTRAINT)
    return True


def _backfill(existing_tables, added):
    statements = []

    if "user" in existing_tables:
        statements.append(f"UPDATE {_quote('user')} SET role = 'buyer' WHERE role IS NULL")
        statements.append(
            f"UPDATE {_quote('user')} SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
        )

    if "order" in existing_tables:
        # Orders that predate online payment were settled in cash at pickup.
        # Flag them so they stay visible in the seller queue.
        if ("order", "payment_status") in added:
            statements.append(
                f"UPDATE {_quote('order')} SET payment_status = 'pay_at_pickup' "
                "WHERE payment_status = 'unpaid' OR payment_status IS NULL"
            )
        statements.append(
            f"UPDATE {_quote('order')} SET pickup_code = 'CL-' || id WHERE pickup_code IS NULL"
        )
        statements.append(
            f"UPDATE {_quote('order')} SET platform_fee_cents = 0 WHERE platform_fee_cents IS NULL"
        )
        statements.append(
            f"UPDATE {_quote('order')} SET currency = 'usd' WHERE currency IS NULL"
        )

    with db.engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

    if "order" in existing_tables:
        # Not critical enough to block boot: some managed Postgres roles cannot
        # create indexes concurrently with an active deploy.
        try:
            with db.engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_order_pickup_code "
                        f"ON {_quote('order')} (pickup_code)"
                    )
                )
        except Exception:  # pragma: no cover - depends on database privileges
            logger.warning("migration: could not create uq_order_pickup_code", exc_info=True)
