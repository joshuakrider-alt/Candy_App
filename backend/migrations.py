"""Small forward-only schema migrations.

The project does not use Alembic yet, and the production Neon database holds
real rows, so `db.create_all()` alone is not enough: it creates missing tables
but never adds columns to tables that already exist. These helpers add the new
columns in place and backfill them, and they are safe to run on every boot.
"""

import logging

from sqlalchemy import MetaData, inspect, text
from sqlalchemy.schema import CreateTable

from models import ROLES, Order, Seller, User, db

logger = logging.getLogger(__name__)

USER_ROLE_CONSTRAINT = "ck_user_role"

# Scratch name used while SQLite rebuilds the order table.
ORDER_REBUILD_TABLE = "order_user_id_rebuild"

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

    _relax_order_user_id_not_null(existing_tables)
    _backfill(existing_tables, added)
    _ensure_user_role_check_constraint(existing_tables)
    return added


def _relax_order_user_id_not_null(existing_tables):
    """Allow `order.user_id` to be NULL so deleted accounts leave their orders.

    Account deletion de-identifies orders instead of destroying sales a seller
    still has to fulfill, which needs the column to be nullable. Databases
    created before this ran have it NOT NULL. This is not wrapped in a
    try/except: without the change `DELETE /me` cannot work, so a deploy that
    fails here should fail loudly rather than half-ship the feature.
    """
    if "order" not in existing_tables:
        return False

    user_id = next(
        (
            column
            for column in inspect(db.engine).get_columns("order")
            if column["name"] == "user_id"
        ),
        None,
    )
    if user_id is None or user_id["nullable"]:
        return False

    if db.engine.dialect.name == "postgresql":
        with db.engine.begin() as connection:
            connection.execute(
                text(
                    f"ALTER TABLE {_quote('order')} "
                    "ALTER COLUMN user_id DROP NOT NULL"
                )
            )
    elif db.engine.dialect.name == "sqlite":
        _rebuild_sqlite_order_table()
    else:  # pragma: no cover - only SQLite and Postgres are supported
        logger.warning(
            "migration: cannot relax order.user_id on %s", db.engine.dialect.name
        )
        return False

    logger.info("migration: order.user_id is now nullable")
    return True


def _rebuild_sqlite_order_table():
    """Copy the order table into one built from the current model.

    SQLite has no `ALTER COLUMN`, so relaxing a NOT NULL means rebuilding the
    table. Foreign keys are switched off for the swap, and `legacy_alter_table`
    keeps the rename from tripping over `order_item`'s reference to the table
    being replaced.
    """
    existing = {column["name"] for column in inspect(db.engine).get_columns("order")}
    carried = [
        column.name for column in Order.__table__.columns if column.name in existing
    ]
    column_list = ", ".join(_quote(name) for name in carried)

    # The copy needs the tables it points at, or its foreign keys cannot be
    # resolved into DDL. Only the order table is ever created from this.
    staging_metadata = MetaData()
    for parent in (User.__table__, Seller.__table__):
        parent.to_metadata(staging_metadata)
    staging = Order.__table__.to_metadata(staging_metadata, name=ORDER_REBUILD_TABLE)
    statements = (
        str(CreateTable(staging).compile(db.engine)),
        f"INSERT INTO {_quote(ORDER_REBUILD_TABLE)} ({column_list}) "
        f"SELECT {column_list} FROM {_quote('order')}",
        f"DROP TABLE {_quote('order')}",
        f"ALTER TABLE {_quote(ORDER_REBUILD_TABLE)} RENAME TO {_quote('order')}",
    )

    with db.engine.connect() as connection:
        connection.execution_options(isolation_level="AUTOCOMMIT")
        connection.execute(text(f"DROP TABLE IF EXISTS {_quote(ORDER_REBUILD_TABLE)}"))
        connection.execute(text("PRAGMA foreign_keys=OFF"))
        connection.execute(text("PRAGMA legacy_alter_table=ON"))
        try:
            connection.execute(text("BEGIN"))
            for statement in statements:
                connection.execute(text(statement))
            connection.execute(text("COMMIT"))
        except Exception:
            connection.execute(text("ROLLBACK"))
            raise
        finally:
            connection.execute(text("PRAGMA legacy_alter_table=OFF"))
            connection.execute(text("PRAGMA foreign_keys=ON"))


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
