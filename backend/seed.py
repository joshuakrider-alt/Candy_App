from app import app, db, User, Candy, Order, OrderItem

if __name__ == '__main__':
    with app.app_context():
        db.drop_all()
        db.create_all()

        u1 = User(name='Alice', email='alice@example.com')
        u2 = User(name='Bob', email='bob@example.com')

        candies = [
            Candy(name='Chocolate Bar', description='Milk chocolate', price_cents=199, inventory=50),
            Candy(name='Gummy Bears', description='Fruity gummies', price_cents=129, inventory=100),
            Candy(name='Lollipop', description='Cherry flavored', price_cents=49, inventory=200),
        ]

        db.session.add_all([u1, u2] + candies)
        db.session.commit()

        order = Order(user_id=u1.id)
        db.session.add(order)
        db.session.commit()

        oi = OrderItem(order_id=order.id, candy_id=candies[0].id, quantity=2, unit_price_cents=candies[0].price_cents)
        order.total_cents = oi.quantity * oi.unit_price_cents
        db.session.add(oi)
        db.session.commit()

        print('Seeded DB with users, candies, and an order.')
