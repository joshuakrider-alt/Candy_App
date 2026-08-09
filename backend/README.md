Quick backend for Candy_App (Flask + SQLite)

Setup (Windows):
1. cd backend
2. python -m venv .venv
3. .\.venv\Scripts\activate
4. pip install -r requirements.txt
5. python seed.py  # creates backend\data.db with sample data
6. python app.py   # runs the API on http://127.0.0.1:5000

Available endpoints (examples):
- GET /candies
- GET /candies/<id>
- POST /candies {name, price_cents, description?, inventory?}
- GET /users
- POST /orders {user_id, items:[{candy_id, quantity}]}
