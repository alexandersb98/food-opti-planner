import pytest

from .conftest import RECIPE


@pytest.fixture
def oats(catalog):
    return catalog.ingredient()


@pytest.fixture
def milk(catalog):
    return catalog.ingredient("Milk", unit="ml")


def fields(*items, **changes):
    """A porridge recipe of (ingredient id, amount) pairs."""
    return {
        **RECIPE,
        "name": "Porridge",
        "items": [{"ingredient_id": i, "amount": a} for i, a in items],
        "extra_tag_ids": [],
        **changes,
    }


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
        "items": [{"ingredient_id": oats, "amount": "60"}, {"ingredient_id": water, "amount": "200"}],
        "extra_tag_ids": [quick],
        "min_multiplier": "0.5",
        "max_multiplier": "2",
        "step": None,
        "hard_max_multiplier": None,
        "serving_cap_weight": "1",
        "derived_tag_ids": [vegan],
        "totals": [{"attribute_id": energy, "value": "233"}, {"attribute_id": protein, "value": "10.1"}],
    }
    assert client.get("/api/recipes").json() == [created]
    assert client.get(f"/api/recipes/{created['id']}").json() == created


def test_items_keep_their_order(client, oats, milk):
    created = create(client, (milk, "200"), (oats, "60"))
    assert [item["ingredient_id"] for item in created["items"]] == [milk, oats]


def test_amounts_read_back_exactly_as_typed(client, oats):
    created = create(client, (oats, "0.000001"))
    assert created["items"][0]["amount"] == "0.000001"
    created = client.put(f"/api/recipes/{created['id']}", json=fields((oats, 60.50))).json()
    assert created["items"][0]["amount"] == "60.5"


def test_totals_are_rounded_half_away_from_zero_to_the_attributes_decimals(client, catalog):
    energy, salt = catalog.attribute(), catalog.attribute("Salt", "g", decimals=2)
    cost = catalog.attribute("Cost", "kr", decimals=1)
    a = catalog.ingredient("A", basis="1", values={energy: "0.5", salt: "-0.005", cost: "-0.05"})
    created = create(client, (a, "1"))
    assert [t["value"] for t in created["totals"]] == ["1", "-0.01", "-0.1"]


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
        {"items": []},
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
    assert response.json()["detail"][0]["loc"][:3] == ["body", "items", 0]


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


def test_unknown_ingredients_and_tags_and_an_ingredient_twice_answer_422(client, oats):
    response = client.post(
        "/api/recipes", json=fields((oats, "60"), (999, "1"), (oats, "2"), extra_tag_ids=[999])
    )
    assert response.status_code == 422
    errors = {tuple(e["loc"]): e["type"] for e in response.json()["detail"]}
    assert errors == {
        ("body", "items", 1, "ingredient_id"): "unknown_ingredient",
        ("body", "items", 2, "ingredient_id"): "duplicate",
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
        "items": [{"ingredient_id": milk, "amount": "200"}, {"ingredient_id": oats, "amount": "50"}],
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
    assert response.json()["items"] == [{"ingredient_id": milk, "amount": "250"}]
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
