#!/bin/sh
# Starts the Flask API for the browser tests on a fresh SQLite database seeded
# with the demo shops and logins. Used by playwright.config.ts and Web CI.
# Start it before `next build` so the cached pages (/, /shops) are built with
# shops in them.
set -e
cd "$(dirname "$0")/../../../backend"
PYTHON="${PYTHON:-python3}"
DB="${E2E_DATABASE:-/tmp/candy-lady-e2e.db}"
rm -f "$DB"
export DATABASE_URL="sqlite:///$DB"
export CORS_ORIGINS="http://localhost:3055"
export PUBLIC_SITE_URL="http://localhost:3055"
export SEED_ADMIN_PASSWORD="e2e-admin-password"
export SEED_SELLER_PASSWORD="e2e-seller-password"
export SEED_BUYER_PASSWORD="e2e-buyer-password"
"$PYTHON" manage.py seed-demo
exec "$PYTHON" -m flask --app app run --port 5055
