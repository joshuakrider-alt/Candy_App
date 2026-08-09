from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import os
from models import db, User, Candy, Order, OrderItem


def create_app():
    app = Flask(__name__)
    db_path = os.path.join(os.path.dirname(__file__), 'data.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    CORS(app)

    with app.app_context():
        db.create_all()

    # Candy endpoints
    @app.route('/candies', methods=['GET'])
    def list_candies():
        candies = Candy.query.all()
        return jsonify([c.to_dict() for c in candies])

    @app.route('/candies/<int:candy_id>', methods=['GET'])
    def get_candy(candy_id):
        c = Candy.query.get_or_404(candy_id)
        return jsonify(c.to_dict())

    @app.route('/candies', methods=['POST'])
    def create_candy():
        data = request.get_json() or {}
        if 'name' not in data or 'price_cents' not in data:
            return abort(400)
        c = Candy(name=data['name'], description=data.get('description', ''), price_cents=int(data['price_cents']), inventory=int(data.get('inventory', 0)))
        db.session.add(c)
        db.session.commit()
        return jsonify(c.to_dict()), 201

    @app.route('/candies/<int:candy_id>', methods=['PUT'])
    def update_candy(candy_id):
        c = Candy.query.get_or_404(candy_id)
        data = request.get_json() or {}
        c.name = data.get('name', c.name)
        c.description = data.get('description', c.description)
        c.price_cents = int(data.get('price_cents', c.price_cents))
        c.inventory = int(data.get('inventory', c.inventory))
        db.session.commit()
        return jsonify(c.to_dict())

    @app.route('/candies/<int:candy_id>', methods=['DELETE'])
    def delete_candy(candy_id):
        c = Candy.query.get_or_404(candy_id)
        db.session.delete(c)
        db.session.commit()
        return '', 204

    # Users
    @app.route('/users', methods=['GET'])
    def list_users():
        users = User.query.all()
        return jsonify([u.to_dict() for u in users])

    @app.route('/users/<int:user_id>', methods=['GET'])
    def get_user(user_id):
        u = User.query.get_or_404(user_id)
        return jsonify(u.to_dict())

    @app.route('/users', methods=['POST'])
    def create_user():
        data = request.get_json() or {}
        if 'name' not in data or 'email' not in data:
            return abort(400)
        u = User(name=data['name'], email=data['email'])
        db.session.add(u)
        db.session.commit()
        return jsonify(u.to_dict()), 201

    # Orders
    @app.route('/orders', methods=['GET'])
    def list_orders():
        orders = Order.query.all()
        return jsonify([o.to_dict() for o in orders])

    @app.route('/orders/<int:order_id>', methods=['GET'])
    def get_order(order_id):
        o = Order.query.get_or_404(order_id)
        return jsonify(o.to_dict())

    @app.route('/orders', methods=['POST'])
    def create_order():
        data = request.get_json() or {}
        user_id = data.get('user_id')
        items = data.get('items', [])
        if not user_id or not items:
            return abort(400)
        user = User.query.get_or_404(user_id)
        order = Order(user_id=user.id, total_cents=0)
        db.session.add(order)
        total = 0
        for it in items:
            candy = Candy.query.get_or_404(it['candy_id'])
            qty = int(it.get('quantity', 1))
            oi = OrderItem(order=order, candy=candy, quantity=qty, unit_price_cents=candy.price_cents)
            db.session.add(oi)
            total += candy.price_cents * qty
            candy.inventory = max(0, candy.inventory - qty)
        order.total_cents = total
        db.session.commit()
        return jsonify(order.to_dict()), 201

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
