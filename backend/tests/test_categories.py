import pytest

from models import category_for_name
from seed import CATALOG

# What each seeded catalog item is. The seed is the same catalog production
# started from, so this pins the categories buyers see there too.
SEEDED = {
    "Sour Gummy Mix": "candy",
    "Chocolate Bar": "candy",
    "Rainbow Lollipop": "candy",
    "Peanut Butter Cups": "candy",
    "Gummy Worms": "candy",
    "Hot Chips": "chips",
    "Nacho Cheese Chips": "chips",
    "Cheese Puffs": "chips",
    "Salted Pretzels": "chips",
    "Orange Soda Bottle": "drinks",
    "Grape Soda Bottle": "drinks",
    "Fruit Punch Juice": "drinks",
    "Lemonade Cup": "drinks",
}


def test_every_seeded_item_has_its_expected_category():
    assert {name for name, _, _ in CATALOG} == set(SEEDED)
    assert {name: category_for_name(name) for name, _, _ in CATALOG} == SEEDED


@pytest.mark.parametrize(
    "name, category",
    [
        # Substrings of drink words inside candy names (the original bug).
        ("Chocolate Bar", "candy"),
        ("chocolate bar", "candy"),
        ("Homemade Fudge", "candy"),
        ("Marmalade Drops", "candy"),
        ("Decadent Truffles", "candy"),
        ("Chipotle Caramels", "candy"),
        ("Spade Lollipops", "candy"),
        # A candy word wins over a drink word.
        ("Cola Gummies", "candy"),
        ("Fruit Punch Gummies", "candy"),
        ("Ring Pop", "candy"),
        ("Milk Duds", "candy"),
        # Real drinks and chips still land where they did.
        ("Coca-Cola", "drinks"),
        ("Pink Lemonade", "drinks"),
        ("Iced Tea", "drinks"),
        ("Bottled Water", "drinks"),
        ("Juice Box", "drinks"),
        ("Hot Cheetos", "chips"),
        ("Kettle Chips", "chips"),
        ("Caramel Popcorn", "chips"),
        ("", "candy"),
        (None, "candy"),
    ],
)
def test_category_matches_whole_words(name, category):
    assert category_for_name(name) == category


def test_chocolate_bar_is_candy_in_a_shop(client):
    shop = client.get("/shops").get_json()[0]
    items = client.get(f"/shops/{shop['slug']}").get_json()["items"]
    by_name = {item["candy"]["name"]: item["candy"]["category"] for item in items}
    assert by_name["Chocolate Bar"] == "candy"
