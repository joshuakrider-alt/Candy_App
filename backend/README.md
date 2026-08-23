Quick backend for Candy_App (Flask + SQLAlchemy)

By default, the API uses a local SQLite database at `backend/data.db`.
If `DATABASE_URL` is set, Flask-SQLAlchemy uses that database instead.

Setup with local SQLite:
1. `cd backend`
2. `python -m venv .venv`
3. Activate the virtual environment:
   - Windows: `.\.venv\Scripts\activate`
   - macOS/Linux: `source .venv/bin/activate`
4. `pip install -r requirements.txt`
5. `python seed.py`
6. `python app.py`

Setup with another database, such as Postgres:
1. Create the database.
2. Set `DATABASE_URL`, for example:
   - macOS/Linux: `export DATABASE_URL="postgresql://localhost/candy_app"`
   - Windows PowerShell: `$env:DATABASE_URL="postgresql://localhost/candy_app"`
3. Run `python seed.py`.
4. Run `python app.py`.

Authentication:
- `POST /login` accepts `email` and `password`.
- For this prototype, any seeded user can log in with the shared password `password`.
- Seller/admin routes require `Authorization: Bearer <access_token>`.
- User/order reads and candy writes (POST/PUT/DELETE) now need a Bearer token.

Available endpoints (examples):
- `GET /candies`
- `POST /applications`
- `GET /applications?status=pending`
- `PUT /applications/<seller_id>`
- `GET /sellers/<seller_id>/inventory`
- `PUT /sellers/<seller_id>/inventory/<candy_id>`
- `GET /sellers/<seller_id>/orders`
- `POST /orders`
- `PUT /orders/<order_id>/status`
