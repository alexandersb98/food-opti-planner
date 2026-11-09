"""An ingredient's conversions ("1 dl = 40 g"): add, edit and delete."""

import pytest
from sqlalchemy import create_engine, text

from .conftest import recipe_body


@pytest.fixture
def oats(catalog):
    return catalog.ingredient()


def url(ingredient, conversion=None):
    return f"/api/ingredients/{ingredient}/conversions" + ("" if conversion is None else f"/{conversion}")


def add(client, ingredient, unit="dl", factor="40"):
    return client.post(url(ingredient), json={"unit": unit, "factor": factor})


def save_recipe(client, ingredient, amount, unit, name="Porridge"):
    response = client.post("/api/recipes", json=recipe_body(name, [(ingredient, amount, unit)]))
    assert response.status_code == 201, response.text
    return response.json()


def ai_conversion(database_url, conversion_id):
    engine = create_engine(database_url)
    with engine.begin() as c:
        c.execute(text("UPDATE ingredient_conversions SET source = 'ai' WHERE id = :id"), {"id": conversion_id})
    engine.dispose()


def source_of(client, ingredient):
    return [c["source"] for c in client.get(f"/api/ingredients/{ingredient}").json()["conversions"]]


def test_a_conversion_is_created_and_listed_on_the_ingredient(client, oats):
    response = add(client, oats, "dl", "0.040")
    assert response.status_code == 201
    created = response.json()
    assert created == {"id": created["id"], "unit": "dl", "factor": "0.04", "source": "user", "recipe_count": 0}
    other = add(client, oats, "pinch", "0.3").json()
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"] == [created, other]
    listed = client.get("/api/ingredients").json()
    assert listed[0]["conversions"] == [created, other]


@pytest.mark.parametrize(("typed", "stored"), [("tbsp", "msk"), ("DL", "dl"), ("pinch", "pinch"), (" klyfta ", "klyfta")])
def test_the_unit_is_stored_in_the_catalogue_spelling_and_free_text_as_typed(client, oats, typed, stored):
    assert add(client, oats, typed).json()["unit"] == stored


def error_types(response):
    return {(tuple(e["loc"]), e["type"]) for e in response.json()["detail"]}


@pytest.mark.parametrize(
    ("unit", "factor", "expected"),
    [
        ("kcal", "1", {(("body", "unit"), "unit_not_for_ingredient")}),
        ("gram", "1", {(("body", "unit"), "unit_is_own_unit")}),
        ("", "1", {(("body", "unit"), "string_too_short")}),
        ("x" * 21, "1", {(("body", "unit"), "string_too_long")}),
        ("dl", "0", {(("body", "factor"), "greater_than")}),
        ("dl", "-1", {(("body", "factor"), "greater_than")}),
        ("dl", "abc", {(("body", "factor"), "decimal_parsing")}),
        ("dl", "0.0000001", {(("body", "factor"), "decimal_max_places")}),
        ("kcal", "0", {(("body", "factor"), "greater_than")}),
    ],
)
def test_invalid_conversions_answer_422_at_their_field(client, oats, unit, factor, expected):
    response = add(client, oats, unit, factor)
    assert response.status_code == 422
    assert error_types(response) >= expected
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"] == []


def test_a_missing_field_answers_422(client, oats):
    response = client.post(url(oats), json={"unit": "dl"})
    assert response.status_code == 422
    assert error_types(response) == {(("body", "factor"), "missing")}


def test_the_same_unit_twice_is_refused_in_any_spelling(client, oats):
    assert add(client, oats, "dl").status_code == 201
    assert add(client, oats, "DL").status_code == 422
    assert error_types(add(client, oats, "DL")) == {(("body", "unit"), "duplicate")}
    assert add(client, oats, "Pinch").status_code == 201
    assert error_types(add(client, oats, "pinch")) == {(("body", "unit"), "duplicate")}
    assert add(client, oats, "tbsp").status_code == 201
    assert add(client, oats, "msk").status_code == 422


def test_a_free_text_own_unit_is_refused_ignoring_case(catalog, client):
    portion = catalog.ingredient("Soup", unit="portion")
    assert error_types(add(client, portion, "Portion")) == {(("body", "unit"), "unit_is_own_unit")}


def test_a_conversion_for_one_ingredient_is_not_a_duplicate_for_another(client, catalog, oats):
    milk = catalog.ingredient("Milk", unit="ml")
    assert add(client, oats).status_code == 201
    assert add(client, milk, "dl", "100").status_code == 201


def test_unknown_ingredients_and_conversions_answer_404(client, catalog, oats):
    milk = catalog.ingredient("Milk")
    conversion = add(client, oats).json()["id"]
    body = {"unit": "dl", "factor": "1"}
    assert client.post(url(999), json=body).status_code == 404
    assert client.put(url(999, conversion), json=body).status_code == 404
    assert client.delete(url(999, conversion)).status_code == 404
    assert client.put(url(oats, 999), json=body).status_code == 404
    assert client.delete(url(oats, 999)).status_code == 404
    # A conversion of another ingredient.
    assert client.put(url(milk, conversion), json=body).status_code == 404
    assert client.delete(url(milk, conversion)).status_code == 404
    assert len(client.get(f"/api/ingredients/{oats}").json()["conversions"]) == 1


def test_every_route_needs_a_session(anonymous_client):
    body = {"unit": "dl", "factor": "1"}
    assert anonymous_client.post(url(1), json=body).status_code == 401
    assert anonymous_client.put(url(1, 1), json=body).status_code == 401
    assert anonymous_client.delete(url(1, 1)).status_code == 401


def test_editing_the_factor_of_a_user_conversion_keeps_it_user(client, oats):
    conversion = add(client, oats).json()["id"]
    response = client.put(url(oats, conversion), json={"unit": "dl", "factor": "45"})
    assert response.status_code == 200
    assert response.json() == {"id": conversion, "unit": "dl", "factor": "45", "source": "user", "recipe_count": 0}


def test_editing_an_ai_conversion_makes_it_user_only_when_something_changes(client, database_url, oats):
    conversion = add(client, oats).json()["id"]
    ai_conversion(database_url, conversion)
    assert source_of(client, oats) == ["ai"]
    same = client.put(url(oats, conversion), json={"unit": "dl", "factor": "40.0"})
    assert same.json()["source"] == "ai"
    spelling = client.put(url(oats, conversion), json={"unit": "DL", "factor": "40"})
    assert (spelling.json()["unit"], spelling.json()["source"]) == ("dl", "ai")
    changed = client.put(url(oats, conversion), json={"unit": "dl", "factor": "41"})
    assert changed.json()["source"] == "user"


def test_editing_a_conversions_unit_makes_an_ai_one_user(client, database_url, oats):
    conversion = add(client, oats).json()["id"]
    ai_conversion(database_url, conversion)
    changed = client.put(url(oats, conversion), json={"unit": "msk", "factor": "40"})
    assert (changed.json()["unit"], changed.json()["source"]) == ("msk", "user")


def test_an_edit_checks_the_unit_without_counting_the_conversion_itself(client, oats):
    first = add(client, oats, "dl").json()["id"]
    second = add(client, oats, "msk").json()["id"]
    assert client.put(url(oats, first), json={"unit": "dl", "factor": "50"}).status_code == 200
    assert error_types(client.put(url(oats, second), json={"unit": "DL", "factor": "6"})) == {
        (("body", "unit"), "duplicate")
    }
    assert error_types(client.put(url(oats, first), json={"unit": "g", "factor": "1"})) == {
        (("body", "unit"), "unit_is_own_unit")
    }
    assert error_types(client.put(url(oats, first), json={"unit": "kcal", "factor": "1"})) == {
        (("body", "unit"), "unit_not_for_ingredient")
    }


def test_a_conversion_counts_the_recipes_that_use_it(client, oats):
    conversion = add(client, oats).json()["id"]
    save_recipe(client, oats, "1", "dl")
    ingredient = client.get(f"/api/ingredients/{oats}").json()
    assert ingredient["conversions"][0]["recipe_count"] == 1
    assert client.get("/api/ingredients").json()[0]["conversions"][0]["recipe_count"] == 1
    # Two lines of one recipe count once, a second recipe counts again.
    body = recipe_body("Twice", [(oats, "1", "dl"), (oats, "2", "dl")])
    assert client.post("/api/recipes", json=body).status_code == 201
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"][0]["recipe_count"] == 2
    assert client.put(url(oats, conversion), json={"unit": "dl", "factor": "40"}).json()["recipe_count"] == 2


def test_a_used_conversion_cannot_be_deleted(client, oats):
    conversion = add(client, oats).json()["id"]
    save_recipe(client, oats, "1", "dl")
    response = client.delete(url(oats, conversion))
    assert response.status_code == 409
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["path", "conversion_id"], "conversion_in_use")
    assert len(client.get(f"/api/ingredients/{oats}").json()["conversions"]) == 1


def test_a_used_conversions_factor_can_change_and_the_totals_follow(client, catalog):
    energy = catalog.attribute()
    oats = catalog.ingredient(values={energy: "100"})
    conversion = add(client, oats).json()["id"]
    recipe = save_recipe(client, oats, "1", "dl")
    assert recipe["totals"][0]["value"] == "40"
    assert client.put(url(oats, conversion), json={"unit": "dl", "factor": "50"}).status_code == 200
    assert client.get(f"/api/recipes/{recipe['id']}").json()["totals"][0]["value"] == "50"


def test_a_used_conversions_unit_cannot_change(client, oats):
    conversion = add(client, oats).json()["id"]
    save_recipe(client, oats, "1", "dl")
    response = client.put(url(oats, conversion), json={"unit": "msk", "factor": "6"})
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "unit"]
    assert response.json()["detail"][0]["type"] == "conversion_in_use"
    stored = client.get(f"/api/ingredients/{oats}").json()["conversions"][0]
    assert (stored["unit"], stored["factor"]) == ("dl", "40")
    # A spelling change is not a change of unit.
    assert client.put(url(oats, conversion), json={"unit": "DL", "factor": "40"}).status_code == 200


def test_a_line_that_goes_through_a_conversion_uses_it(client, oats):
    conversion = add(client, oats).json()["id"]
    save_recipe(client, oats, "1", "US cup")
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"][0]["recipe_count"] == 1
    assert client.delete(url(oats, conversion)).status_code == 409


def test_a_conversion_is_unused_by_a_line_with_a_catalogue_step_to_the_own_unit(client, oats):
    add(client, oats)
    save_recipe(client, oats, "1", "kg")
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"][0]["recipe_count"] == 0


def test_a_conversion_is_deleted_once_no_line_uses_it(client, oats, catalog):
    conversion = add(client, oats).json()["id"]
    recipe = save_recipe(client, oats, "1", "dl")
    body = {**recipe_body("Porridge", {oats: "60"})}
    assert client.put(f"/api/recipes/{recipe['id']}", json=body).status_code == 200
    assert client.delete(url(oats, conversion)).status_code == 204
    assert client.get(f"/api/ingredients/{oats}").json()["conversions"] == []
