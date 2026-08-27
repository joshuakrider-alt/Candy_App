# Candy Lady API

Flask + SQLAlchemy backend for The Candy Lady.

By default the API uses SQLite at `backend/data.db`.
If `DATABASE_URL` is set, Flask-SQLAlchemy uses that database instead (Postgres on Render).

## Local setup

1. `cd backend`
2. `python -m venv .venv`
3. Activate the virtual environment
4. `pip install -r requirements.txt`
5. `python seed.py`
6. `python app.py`

## Render env vars

- `DATABASE_URL` — Postgres URL
- `JWT_SECRET_KEY` — required in production
- `CORS_ORIGINS` — `https://www.neighborhoodcandylady.com,https://neighborhoodcandylady.com`
- `PROTOTYPE_LOGIN_PASSWORD` — shared prototype password

## Auth

- `POST /login` with `{ "email", "password" }`
- Seeded users share the prototype password
- User/order reads and candy writes need `Authorization: Bearer <token>`
- Seller inventory, seller orders, application list/approve, and order status need a token
- Public: `GET /candies`, `GET /candies/<id>`, `GET /sellers/<id>/storefront`, `POST /applications`, `POST /login`, `POST /orders`

## Useful endpoints

- `GET /sellers/<id>/storefront` — approved seller + in-stock items (buyer shelf)
- `GET /applications?status=pending`
- `PUT /applications/<seller_id>`
- `GET /sellers/<id>/inventory`
- `PUT /sellers/<id>/inventory/<candy_id>`
- `GET /sellers/<id>/orders`
- `POST /orders`
- `PUT /orders/<id>/status`
