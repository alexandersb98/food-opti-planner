import pytest
from sqlalchemy import create_engine, text

from .conftest import fixed_portion_recipe, recipe_body, schedule


@pytest.fixture
def oats(catalog):
    return catalog.ingredient()


@pytest.fixture
def milk(catalog):
    return catalog.ingredient("Milk", unit="ml")


def fields(*items, **changes):
    """A porridge recipe of (ingredient id, amount) pairs."""
    return {**recipe_body(items=items), **changes}


def line(ingredient, amount, original_text="", unit=""):
    return {"ingredient_id": ingredient, "amount": amount, "unit": unit, "original_text": original_text}


def items(recipe):
    """The ingredient ids of every line of a response, in order."""
    return [i["ingredient_id"] for section in recipe["sections"] for i in section["items"]]


def create(client, *items, **changes):
    response = client.post("/api/recipes", json=fields(*items, **changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_the_list_starts_empty(client):
    response = client.get("/api/recipes")
    assert response.status_code == 200
    assert response.json() == []


def test_a_created_recipe_is_listed_with_its_tags_and_totals(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein", "g", decimals=1)
    vegan, quick = catalog.tag(), catalog.tag("quick")
    oats = catalog.ingredient(values={energy: "389", protein: "16.9"}, tag_ids=[vegan])
    water = catalog.ingredient("Water", unit="ml", tag_ids=[vegan])
    created = create(client, (oats, "60"), (water, "200"), extra_tag_ids=[quick])
    assert created == {
        "id": created["id"],
        "name": "Porridge",
        "servings": 1,
        "instructions": "",
        "source_url": "",
        "sections": [{"name": "", "items": [line(oats, "60"), line(water, "200")]}],
        "extra_tag_ids": [quick],
        "min_multiplier": "0.5",
        "max_multiplier": "2",
        "step": None,
        "hard_max_multiplier": None,
        "serving_cap_weight": "1",
        "derived_tag_ids": [vegan],
        "unconvertible": False,
        "totals": [{"attribute_id": energy, "value": "233"}, {"attribute_id": protein, "value": "10.1"}],
    }
    assert client.get("/api/recipes").json() == [created]
    assert client.get(f"/api/recipes/{created['id']}").json() == created


def test_items_keep_their_order(client, oats, milk):
    created = create(client, (milk, "200"), (oats, "60"))
    assert items(created) == [milk, oats]


def test_amounts_read_back_exactly_as_typed(client, oats):
    created = create(client, (oats, "0.000001"))
    assert created["sections"][0]["items"][0]["amount"] == "0.000001"
    created = client.put(f"/api/recipes/{created['id']}", json=fields((oats, 60.50))).json()
    assert created["sections"][0]["items"][0]["amount"] == "60.5"


def test_totals_are_rounded_half_away_from_zero_to_the_attributes_decimals(client, catalog):
    energy, salt = catalog.attribute(), catalog.attribute("Salt", "g", decimals=2)
    cost = catalog.attribute("Cost", "kr", decimals=1)
    a = catalog.ingredient("A", basis="1", values={energy: "0.5", salt: "-0.005", cost: "-0.05"})
    created = create(client, (a, "1"))
    assert [t["value"] for t in created["totals"]] == ["1", "-0.01", "-0.1"]


def test_a_total_on_a_rounding_tie_rounds_up_as_the_editor_does(client, catalog):
    # 16.5 of a value of 1 per basis 3 is exactly 5.5, so half away from zero
    # gives 6. Dividing by the basis first, as the library's per-unit values
    # do, leaves 5.4999... and would give 5.
    energy = catalog.attribute()
    third = catalog.ingredient("Third", basis="3", values={energy: "1"})
    assert create(client, (third, "16.5"))["totals"][0]["value"] == "6"


def test_an_attribute_without_values_totals_0(client, catalog, oats):
    catalog.attribute(decimals=2)
    assert create(client, (oats, "60"))["totals"][0]["value"] == "0"


def test_the_portion_size_fields_round_trip(client, oats):
    portion = {
        "min_multiplier": "1",
        "max_multiplier": "2.5",
        "step": "0.5",
        "hard_max_multiplier": "4",
        "serving_cap_weight": "0",
    }
    created = create(client, (oats, "60"), **portion)
    assert {field: created[field] for field in portion} == portion


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": "x" * 101},
        {"sections": []},
        {"servings": 0},
        {"servings": -1},
        {"servings": 1001},
        {"servings": 1.5},
        {"servings": None},
        {"instructions": "x" * 20001},
        {"instructions": None},
        {"source_url": "x" * 2001},
        {"sections": [{"name": "x" * 101, "items": [{"ingredient_id": 1, "amount": "1", "original_text": ""}]}]},
        {"sections": [{"name": "", "items": [{"ingredient_id": 1, "amount": "1", "original_text": "x" * 501}]}]},
        {"min_multiplier": "0"},
        {"min_multiplier": "-1"},
        {"min_multiplier": "0.0005"},
        {"min_multiplier": None},
        {"max_multiplier": "1000000000"},
        {"step": "0"},
        {"step": "0.0001"},
        {"hard_max_multiplier": "0"},
        {"serving_cap_weight": "-1"},
        {"serving_cap_weight": None},
    ],
)
def test_invalid_fields_answer_422(client, oats, changes):
    response = client.post("/api/recipes", json=fields((oats, "60"), **changes))
    assert response.status_code == 422
    assert client.get("/api/recipes").json() == []


@pytest.mark.parametrize("amount", ["0", "-1", "abc", "1.0000001", None])
def test_an_invalid_amount_answers_422(client, oats, amount):
    response = client.post("/api/recipes", json=fields((oats, amount)))
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:5] == ["body", "sections", 0, "items", 0]


@pytest.mark.parametrize(
    ("changes", "field", "error"),
    [
        ({"min_multiplier": "2", "max_multiplier": "1"}, "max_multiplier", "below_min"),
        ({"max_multiplier": "2", "hard_max_multiplier": "1.5"}, "hard_max_multiplier", "below_max"),
        ({"min_multiplier": "0.5", "step": "0.3"}, "min_multiplier", "not_in_steps"),
    ],
)
def test_portion_sizes_the_library_would_refuse_answer_422_on_their_field(client, oats, changes, field, error):
    response = client.post("/api/recipes", json=fields((oats, "60"), **changes))
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(["body", field], error)]


@pytest.mark.parametrize(
    "changes",
    [
        {"min_multiplier": "1", "max_multiplier": "1", "hard_max_multiplier": "1"},
        {"min_multiplier": "1.5", "step": "0.5"},
        {"min_multiplier": "0.25", "step": "0.125"},
    ],
)
def test_portion_sizes_at_the_limits_are_accepted(client, oats, changes):
    create(client, (oats, "60"), **changes)


def test_unknown_ingredients_and_tags_answer_422_at_their_place(client, oats):
    sections = [
        {"name": "A", "items": [line(oats, "60")]},
        {"name": "B", "items": [line(oats, "1"), line(999, "1")]},
    ]
    response = client.post("/api/recipes", json=fields(sections=sections, extra_tag_ids=[999]))
    assert response.status_code == 422
    errors = {tuple(e["loc"]): e["type"] for e in response.json()["detail"]}
    assert errors == {
        ("body", "sections", 1, "items", 1, "ingredient_id"): "unknown_ingredient",
        ("body", "extra_tag_ids", 0): "unknown_tag",
    }


def test_creating_a_name_in_use_answers_409_with_a_field_error(client, oats):
    create(client, (oats, "60"))
    response = client.post("/api/recipes", json=fields((oats, "80")))
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert len(client.get("/api/recipes").json()) == 1


def test_update_changes_every_field(client, catalog, oats, milk):
    vegan, quick = catalog.tag(), catalog.tag("quick")
    porridge = create(client, (oats, "60"), extra_tag_ids=[vegan])
    changes = {
        "name": "Milk porridge",
        "servings": 4,
        "instructions": "Stir.\nServe.",
        "source_url": "https://example.com/porridge",
        "sections": [{"name": "Base", "items": [line(milk, "200"), line(oats, "50", "50 g oats")]}],
        "extra_tag_ids": [quick],
        "min_multiplier": "1",
        "max_multiplier": "3",
        "step": "1",
        "hard_max_multiplier": "5",
        "serving_cap_weight": "2.5",
    }
    response = client.put(f"/api/recipes/{porridge['id']}", json=changes)
    assert response.status_code == 200, response.text
    assert response.json() == {**porridge, **changes}
    assert client.get("/api/recipes").json() == [response.json()]


def test_update_can_remove_items_and_tags(client, catalog, oats, milk):
    vegan = catalog.tag()
    porridge = create(client, (oats, "60"), (milk, "200"), extra_tag_ids=[vegan])
    response = client.put(f"/api/recipes/{porridge['id']}", json=fields((milk, "250")))
    assert response.json()["sections"] == [{"name": "", "items": [line(milk, "250")]}]
    assert response.json()["extra_tag_ids"] == []
    assert client.delete(f"/api/ingredients/{oats}").status_code == 204


def test_renaming_to_a_name_in_use_answers_409_and_changes_nothing(client, oats, milk):
    create(client, (oats, "60"))
    cocoa = create(client, (milk, "200"), name="Cocoa")
    response = client.put(f"/api/recipes/{cocoa['id']}", json=fields((oats, "1")))
    assert response.status_code == 409
    assert client.get(f"/api/recipes/{cocoa['id']}").json() == cocoa


def test_update_checks_its_fields_like_create(client, oats):
    porridge = create(client, (oats, "60"))
    response = client.put(f"/api/recipes/{porridge['id']}", json=fields((oats, "60"), extra_tag_ids=[999]))
    assert response.status_code == 422
    assert client.get(f"/api/recipes/{porridge['id']}").json() == porridge


def test_delete_removes_the_recipe_and_frees_its_ingredients_and_tags(client, catalog, oats):
    vegan = catalog.tag()
    porridge = create(client, (oats, "60"), extra_tag_ids=[vegan])
    assert client.delete(f"/api/recipes/{porridge['id']}").status_code == 204
    assert client.get("/api/recipes").json() == []
    assert client.get("/api/tags").json()[0]["recipe_count"] == 0
    assert client.delete(f"/api/ingredients/{oats}").status_code == 204


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_an_unknown_recipe_answers_404(client, oats, method):
    response = client.request(method, "/api/recipes/12345", json=fields((oats, "60")))
    assert response.status_code == 404


def test_counts_for_the_menu(client, oats, milk):
    assert client.get("/api/counts").json()["recipes"] == 0
    create(client, (oats, "60"))
    create(client, (milk, "200"), name="Cocoa")
    assert client.get("/api/counts").json()["recipes"] == 2


# Ingredients in use


def test_an_ingredient_counts_the_recipes_that_use_it(client, oats, milk):
    create(client, (oats, "60"), (milk, "200"))
    create(client, (oats, "80"), name="Muesli")
    used = {i["name"]: i["recipe_count"] for i in client.get("/api/ingredients").json()}
    assert used == {"Oats": 2, "Milk": 1}
    assert client.get(f"/api/ingredients/{oats}").json()["recipe_count"] == 2


def test_an_ingredient_in_use_cannot_be_deleted(client, oats):
    porridge = create(client, (oats, "60"))
    response = client.delete(f"/api/ingredients/{oats}")
    assert response.status_code == 409
    assert client.get(f"/api/ingredients/{oats}").status_code == 200
    assert client.get(f"/api/recipes/{porridge['id']}").json() == porridge


# Derived tags


@pytest.mark.parametrize(
    ("derive", "expected"),
    [("all", {"oats only": True, "oats and milk": False}), ("any", {"oats only": True, "oats and milk": True})],
)
def test_derived_tags_follow_each_tags_rule(client, catalog, derive, expected):
    gluten = catalog.tag("gluten", derive=derive)
    oats = catalog.ingredient(tag_ids=[gluten])
    milk = catalog.ingredient("Milk", unit="ml")
    oats_only = create(client, (oats, "60"))
    with_milk = create(client, (oats, "60"), (milk, "200"), name="Milk porridge")
    got = {"oats only": oats_only["derived_tag_ids"] == [gluten], "oats and milk": with_milk["derived_tag_ids"] == [gluten]}
    assert got == expected


def test_derived_tags_follow_the_ingredients_tags_and_rules_when_they_change(client, catalog):
    vegan = catalog.tag()
    oats = catalog.ingredient(tag_ids=[vegan])
    porridge = create(client, (oats, "60"))
    assert porridge["derived_tag_ids"] == [vegan]
    client.put(f"/api/ingredients/{oats}", json={"name": "Oats", "unit": "g", "basis": "100", "values": [], "tag_ids": []})
    assert client.get(f"/api/recipes/{porridge['id']}").json()["derived_tag_ids"] == []


def test_a_tag_both_derived_and_added_is_answered_as_both(client, catalog):
    vegan = catalog.tag()
    oats = catalog.ingredient(tag_ids=[vegan])
    created = create(client, (oats, "60"), extra_tag_ids=[vegan])
    assert (created["derived_tag_ids"], created["extra_tag_ids"]) == ([vegan], [vegan])


def test_the_editor_can_ask_which_tags_ingredients_give_before_saving(client, catalog):
    vegan, nuts = catalog.tag(), catalog.tag("contains-nuts", derive="any")
    oats = catalog.ingredient(tag_ids=[vegan])
    almonds = catalog.ingredient("Almonds", tag_ids=[vegan, nuts])
    milk = catalog.ingredient("Milk", unit="ml")

    def derived(*ingredient_ids):
        response = client.post("/api/recipes/derived-tags", json={"ingredient_ids": list(ingredient_ids)})
        assert response.status_code == 200, response.text
        return response.json()

    assert derived(oats) == [vegan]
    assert derived(oats, almonds) == [vegan, nuts]
    assert derived(oats, almonds, milk) == [nuts]


@pytest.mark.parametrize("ingredient_ids", [[], [999]])
def test_derived_tags_need_known_ingredients(client, ingredient_ids):
    response = client.post("/api/recipes/derived-tags", json={"ingredient_ids": ingredient_ids})
    assert response.status_code == 422


# Servings


def test_servings_divide_the_totals(client, catalog):
    energy = catalog.attribute()
    third = catalog.ingredient("Third", basis="3", values={energy: "1"})
    whole = create(client, (third, "33"))
    assert whole["totals"][0]["value"] == "11"
    halved = create(client, (third, "33"), name="Half", servings=2)
    assert halved["totals"][0]["value"] == "6"  # 5.5, half away from zero
    assert create(client, (third, "33"), name="Thirds", servings=3)["totals"][0]["value"] == "4"


def test_a_solve_uses_the_amounts_per_portion(client, catalog):
    # 120 g of a value of 1 kcal per g serves 4: one portion is 30 kcal.
    energy = catalog.attribute()
    food = catalog.ingredient("Food", "g", "1", values={energy: "1"})
    fixed_portion_recipe(catalog, "Soup", {food: "120"}, "1", servings=4)
    schedule(client, start_date="2026-10-26", days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    response = client.post("/api/plan/solve", json={"solve_id": "s1"})
    assert response.status_code == 200, response.text
    plan = response.json()["plan"]
    assert plan["day_totals"] == [["30"]]
    assert plan["meals"][0][0]["items"] == [{"ingredient": "Food", "unit": "g", "amount": "30"}]


def test_the_same_ingredient_on_several_lines_is_one_ingredient_to_the_planner(client, catalog):
    energy = catalog.attribute()
    vegan = catalog.tag()
    oats = catalog.ingredient(values={energy: "389"}, tag_ids=[vegan])
    sections = [{"name": "Base", "items": [line(oats, "40")]}, {"name": "Topping", "items": [line(oats, "20")]}]
    created = create(client, sections=sections)
    assert created["totals"][0]["value"] == "233"
    assert created["derived_tag_ids"] == [vegan]
    assert client.get(f"/api/ingredients/{oats}").json()["recipe_count"] == 1


def test_sections_keep_their_order_names_and_lines(client, oats, milk):
    sections = [
        {"name": "Zebra", "items": [line(milk, "1"), line(oats, "2")]},
        {"name": "Apple", "items": [line(oats, "3")]},
        {"name": "Zebra", "items": [line(milk, "4")]},
    ]
    created = create(client, sections=sections)
    assert created["sections"] == sections
    assert client.get(f"/api/recipes/{created['id']}").json()["sections"] == sections


def test_a_single_unnamed_section_is_accepted_and_so_is_a_single_named_one(client, oats):
    assert create(client, (oats, "60"))["sections"][0]["name"] == ""
    named = create(client, name="Named", sections=[{"name": " Base ", "items": [line(oats, "60")]}])
    assert named["sections"][0]["name"] == "Base"


def test_an_empty_section_is_accepted_beside_a_filled_one(client, oats):
    sections = [{"name": "Base", "items": [line(oats, "60")]}, {"name": "Topping", "items": []}]
    assert create(client, sections=sections)["sections"] == sections


def errors_of(response):
    assert response.status_code == 422, response.text
    return [(tuple(e["loc"]), e["type"]) for e in response.json()["detail"]]


def test_an_unnamed_section_among_several_needs_a_name(client, oats):
    sections = [{"name": "Base", "items": [line(oats, "60")]}, {"name": "  ", "items": []}]
    response = client.post("/api/recipes", json=fields(sections=sections))
    assert errors_of(response) == [(("body", "sections", 1, "name"), "name_required")]


def test_a_recipe_needs_a_line_somewhere(client):
    sections = [{"name": "A", "items": []}, {"name": "B", "items": []}]
    response = client.post("/api/recipes", json=fields(sections=sections))
    assert errors_of(response) == [(("body", "sections"), "no_items")]
    response = client.post("/api/recipes", json=fields(sections=[{"name": "", "items": []}]))
    assert errors_of(response) == [(("body", "sections"), "no_items")]


def test_no_sections_at_all_answers_422(client):
    assert client.post("/api/recipes", json=fields(sections=[])).status_code == 422


def test_more_than_50_sections_answer_422(client, oats):
    sections = [{"name": str(i), "items": [line(oats, "1")]} for i in range(51)]
    assert client.post("/api/recipes", json=fields(sections=sections)).status_code == 422
    assert client.post("/api/recipes", json=fields(sections=sections[:50])).status_code == 201


@pytest.mark.parametrize("url", ["javascript:alert(1)", "ftp://x", "example.com"])
def test_a_source_that_is_not_an_http_link_answers_422(client, oats, url):
    response = client.post("/api/recipes", json=fields((oats, "60"), source_url=url))
    assert errors_of(response) == [(("body", "source_url"), "invalid_url")]


@pytest.mark.parametrize("url", ["", "https://example.com/r?a=1", "http://example.com"])
def test_an_empty_or_http_source_is_accepted(client, oats, url):
    assert create(client, (oats, "60"), source_url=url)["source_url"] == url


def test_an_amount_and_an_ingredient_are_named_by_their_place(client, oats):
    sections = [
        {"name": "A", "items": [line(oats, "1")]},
        {"name": "B", "items": [line(oats, "0")]},
    ]
    response = client.post("/api/recipes", json=fields(sections=sections))
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "sections", 1, "items", 0, "amount"]


def test_instructions_and_source_keep_their_text(client, oats):
    text = "1. Boil.\n\n2. Stir  well.\n"
    created = create(client, (oats, "60"), instructions=text, source_url="  https://example.com/x  ")
    assert (created["instructions"], created["source_url"]) == (text, "https://example.com/x")
    assert client.get(f"/api/recipes/{created['id']}").json()["instructions"] == text


def test_original_text_round_trips(client, oats):
    created = create(client, name="Imported", sections=[{"name": "", "items": [line(oats, "60", "1 dl havregryn")]}])
    assert created["sections"][0]["items"][0]["original_text"] == "1 dl havregryn"


def rows(database_url, table):
    engine = create_engine(database_url)
    with engine.connect() as connection:
        count = connection.scalar(text(f"SELECT count(*) FROM {table}"))
    engine.dispose()
    return count


def test_a_save_rebuilds_the_lines_and_the_recipe_reads_back_the_same(client, database_url, oats, milk):
    sections = [{"name": "A", "items": [line(oats, "1"), line(milk, "2")]}, {"name": "B", "items": [line(oats, "3")]}]
    created = create(client, sections=sections)
    body = fields(sections=sections)
    for _ in range(2):
        response = client.put(f"/api/recipes/{created['id']}", json=body)
        assert response.json() == created
    assert (rows(database_url, "recipe_sections"), rows(database_url, "recipe_items")) == (2, 3)
    response = client.put(f"/api/recipes/{created['id']}", json=fields((milk, "5")))
    assert items(response.json()) == [milk]
    assert (rows(database_url, "recipe_sections"), rows(database_url, "recipe_items")) == (1, 1)


def test_deleting_a_recipe_removes_its_sections_and_lines(client, database_url, oats):
    sections = [{"name": "A", "items": [line(oats, "1")]}, {"name": "B", "items": [line(oats, "3")]}]
    created = create(client, sections=sections)
    assert client.delete(f"/api/recipes/{created['id']}").status_code == 204
    assert (rows(database_url, "recipe_sections"), rows(database_url, "recipe_items")) == (0, 0)


def test_an_ingredient_counts_recipes_not_lines(client, oats, milk):
    two_lines = [{"name": "A", "items": [line(oats, "1")]}, {"name": "B", "items": [line(oats, "2"), line(milk, "1")]}]
    create(client, sections=two_lines)
    create(client, (oats, "5"), name="Muesli")
    assert client.get(f"/api/ingredients/{oats}").json()["recipe_count"] == 2
    assert client.get(f"/api/ingredients/{milk}").json()["recipe_count"] == 1
    assert client.delete(f"/api/ingredients/{oats}").status_code == 409


# Line units (slice R3).
def with_units(catalog, client, **conversions):
    """Oats (g, 100 kcal per 100 g) with the given conversions {unit: factor}."""
    energy = catalog.attribute()
    oats = catalog.ingredient(values={energy: "100"})
    for unit, factor in conversions.items():
        catalog.conversion(oats, unit, factor)
    return oats


def saved_units(client, recipe):
    return [i["unit"] for section in recipe["sections"] for i in section["items"]]


def test_a_line_in_another_unit_is_saved_and_read_back_canonical(client, catalog):
    oats = with_units(catalog, client, dl="40", msk="10")
    created = create(client, (oats, "1", "gram"), (oats, "2", "tbsp"), (oats, "3", "DL"), (oats, "4", "oz"), (oats, "5", " kg "))
    assert saved_units(client, created) == ["", "msk", "dl", "oz", "kg"]
    assert saved_units(client, client.get(f"/api/recipes/{created['id']}").json()) == ["", "msk", "dl", "oz", "kg"]


def test_totals_convert_lines_to_the_ingredients_unit(client, catalog):
    oats = with_units(catalog, client, dl="40")
    # 60 g and 1 dl of 40 g per dl: as 100 g of 100 kcal per 100 g.
    assert create(client, (oats, "60", ""), (oats, "1", "dl"))["totals"][0]["value"] == "100"
    halved = create(client, (oats, "60", ""), (oats, "1", "dl"), name="Half", servings=2)
    assert halved["totals"][0]["value"] == "50"
    assert create(client, (oats, "1", "kg"), name="Kilo")["totals"][0]["value"] == "1000"


def test_a_solve_uses_the_converted_amounts(client, catalog):
    energy = catalog.attribute()
    milk = catalog.ingredient("Milk", "g", "100", values={energy: "64"})
    catalog.conversion(milk, "dl", "100")
    fixed_portion_recipe(catalog, "Latte", [(milk, "2", "dl")], "1")
    schedule(client, start_date="2026-10-26", days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    response = client.post("/api/plan/solve", json={"solve_id": "s1"})
    assert response.status_code == 200, response.text
    plan = response.json()["plan"]
    assert plan["meals"][0][0]["items"] == [{"ingredient": "Milk", "unit": "g", "amount": "200"}]
    assert plan["day_totals"] == [["128"]]


def test_a_line_that_does_not_convert_answers_422_at_its_place(client, catalog, oats):
    response = client.post("/api/recipes", json=fields((oats, "60"), (oats, "2", "dl")))
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "sections", 0, "items", 1, "unit"], "unit_not_convertible")
    assert error["msg"] == "2 dl of Oats doesn't convert to g: add a conversion for dl"
    assert client.get("/api/recipes").json() == []


def test_an_energy_unit_answers_422(client, oats):
    response = client.post("/api/recipes", json=fields((oats, "1", "kcal")))
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [
        (["body", "sections", 0, "items", 0, "unit"], "unit_not_for_ingredient")
    ]


def test_a_unit_over_20_characters_answers_422(client, oats):
    response = client.post("/api/recipes", json=fields((oats, "1", "x" * 21)))
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "sections", 0, "items", 0, "unit"]


def test_unit_errors_come_with_the_other_reference_errors_in_one_422(client, oats):
    body = fields((oats, "1", "dl"), (999, "1"), (oats, "1", "kcal"), extra_tag_ids=[999])
    response = client.post("/api/recipes", json=body)
    assert response.status_code == 422
    assert {(tuple(e["loc"][4:]), e["type"]) for e in response.json()["detail"] if len(e["loc"]) > 4} == {
        ((0, "unit"), "unit_not_convertible"),
        ((1, "ingredient_id"), "unknown_ingredient"),
        ((2, "unit"), "unit_not_for_ingredient"),
    }
    assert client.get("/api/recipes").json() == []


def test_a_recipe_without_units_in_the_body_still_saves(client, oats):
    body = fields((oats, "60"))
    for item in body["sections"][0]["items"]:
        del item["unit"]
    response = client.post("/api/recipes", json=body)
    assert response.status_code == 201
    assert response.json()["sections"][0]["items"][0]["unit"] == ""


def test_the_same_line_unit_survives_a_second_save(client, catalog):
    oats = with_units(catalog, client, dl="40")
    created = create(client, (oats, "1", "tbsp"), (oats, "1", "DL"))
    again = client.put(f"/api/recipes/{created['id']}", json={**created, "sections": created["sections"]})
    assert again.status_code == 200, again.text
    assert saved_units(client, again.json()) == saved_units(client, created) == ["msk", "dl"]


# A line that no longer converts (a catalogue change in a deploy, a restored or
# hand-edited database) degrades instead of failing everything.
def stale_line(client, database_url, catalog):
    """Two recipes of Oats; the first has a line stored in a unit that does not
    convert, forced through the database. Answers the two recipe ids."""
    energy = catalog.attribute()
    oats = catalog.ingredient(values={energy: "100"})
    bad = create(client, (oats, "60"), (oats, "1", "oz"), name="Bad")["id"]
    good = create(client, (oats, "60"), name="Good")["id"]
    engine = create_engine(database_url)
    with engine.begin() as c:
        c.execute(text("UPDATE recipe_items SET unit = 'dl' WHERE unit = 'oz'"))
    engine.dispose()
    return bad, good


def test_a_stale_line_is_flagged_and_counts_0_while_the_list_answers_200(client, database_url, catalog):
    bad, good = stale_line(client, database_url, catalog)
    listed = {r["id"]: r for r in client.get("/api/recipes").json()}
    assert (listed[bad]["unconvertible"], listed[good]["unconvertible"]) == (True, False)
    assert listed[bad]["totals"][0]["value"] == "60"
    assert [i["unit"] for i in listed[bad]["sections"][0]["items"]] == ["", "dl"]
    assert client.get(f"/api/recipes/{bad}").json()["unconvertible"] is True


def test_a_stale_recipe_can_be_fixed_and_saved(client, database_url, catalog):
    bad, _ = stale_line(client, database_url, catalog)
    body = client.get(f"/api/recipes/{bad}").json()
    body["sections"][0]["items"][1]["unit"] = "oz"
    fixed = client.put(f"/api/recipes/{bad}", json=body)
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["unconvertible"] is False


def test_a_stale_recipe_is_left_out_of_the_plan_and_the_count(client, database_url, catalog):
    stale_line(client, database_url, catalog)
    schedule(client, start_date="2026-10-26", days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    counted = client.post("/api/plan/recipe-count", json={"tag_filters": []})
    assert counted.status_code == 200 and counted.json() == {"usable": 1, "total": 2}
    response = client.post("/api/plan/solve", json={"solve_id": "s1"})
    assert response.status_code == 200, response.text
    items = response.json()["plan"]["meals"][0][0]["items"]
    assert [i["ingredient"] for i in items] == ["Oats"]


def test_with_only_stale_recipes_there_is_nothing_to_plan_with_and_no_500(client, database_url, catalog):
    bad, good = stale_line(client, database_url, catalog)
    assert client.delete(f"/api/recipes/{good}").status_code == 204
    schedule(client, start_date="2026-10-26", days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    response = client.post("/api/plan/solve", json={"solve_id": "s2"})
    assert response.status_code == 200, response.text
    assert response.json()["failure"] == "no_usable_recipes"
