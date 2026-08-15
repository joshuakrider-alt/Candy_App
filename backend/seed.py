from app import app
from models import Candy, Order, OrderItem, Seller, SellerInventory, User, db


if __name__ == "__main__":
    with app.app_context():
        db.drop_all()
        db.create_all()

        users = [
            User(name="Alice Carter", email="alice@example.com"),
            User(name="Bob Davis", email="bob@example.com"),
        ]
        approved_seller = Seller(
            shop_name="Ms. Kiki's Snack Spot",
            contact_name="Kiana Roberts",
            neighborhood="Cherry Hill",
            pickup_window="Weekdays, 2:30 PM - 7:00 PM",
            status="approved",
        )
        pending_seller = Seller(
            shop_name="Northview Snack Stop",
            contact_name="Jordan Lee",
            neighborhood="Northview",
            pickup_window="Weekdays, 3:00 PM - 6:30 PM",
            status="pending",
        )
        candies = [
            Candy(name="Sour Gummy Mix", description="Tangy fruit gummies", price_cents=250),
            Candy(name="Orange Soda Bottle", description="Chilled orange soda", price_cents=175),
            Candy(name="Hot Chips", description="Spicy crunchy chips", price_cents=150),
            Candy(name="Chocolate Bar", description="Creamy milk chocolate", price_cents=199),
        ]
        db.session.add_all(users + [approved_seller, pending_seller] + candies)
        db.session.flush()

        inventory = [
            SellerInventory(seller=approved_seller, candy=candies[0], inventory_count=24, status="in-stock"),
            SellerInventory(seller=approved_seller, candy=candies[1], inventory_count=4, status="low-stock"),
            SellerInventory(seller=approved_seller, candy=candies[2], inventory_count=0, status="out-of-stock"),
            SellerInventory(seller=approved_seller, candy=candies[3], inventory_count=12, status="in-stock"),
        ]
        orders = [
            Order(user=users[0], seller=approved_seller, status="new", total_cents=425),
            Order(user=users[1], seller=approved_seller, status="packing", total_cents=325),
            Order(user=users[0], seller=approved_seller, status="ready", total_cents=500),
        ]
        db.session.add_all(inventory + orders)
        db.session.flush()

        db.session.add_all(
            [
                OrderItem(order=orders[0], candy=candies[0], quantity=1, unit_price_cents=250),
                OrderItem(order=orders[0], candy=candies[1], quantity=1, unit_price_cents=175),
                OrderItem(order=orders[1], candy=candies[2], quantity=1, unit_price_cents=150),
                OrderItem(order=orders[1], candy=candies[1], quantity=1, unit_price_cents=175),
                OrderItem(order=orders[2], candy=candies[0], quantity=2, unit_price_cents=250),
            ]
        )
        db.session.commit()
        print("Seeded users, sellers, catalog inventory, and seller pickup orders.")
