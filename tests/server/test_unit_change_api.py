"""Changing a unit converts what is stored in it: the preview endpoints and
what `PUT` does (units spec, "Changing a unit")."""

from decimal import Decimal

import pytest

from .conftest import schedule
from .test_plan import goal
from .test_solve import solve

D = Decimal


def attribute_body(**changes) -> dict:
    return {"name": "Iron", "unit": "mg", "decimals": 4, **changes}


def put_attribute(client, attribute_id, **changes):
    return client.put(f"/api/attributes/{attribute_id}", json=attribute_body(**changes))


def preview_attribute(client, attribute_id, unit, **body) -> dict:
    response = client.post(f"/api/attributes/{attribute_id}/unit-change", json={"unit": unit, **body})
    assert response.status_code == 200, response.text
    return response.json()


def ingredient_body(**changes) -> dict:
    return {"name": "Oats", "unit": "g", "basis": "100", "values": [], "tag_ids": [], **changes}


def preview_ingredient(client, ingredient_id, unit, **body) -> dict:
    response = client.post(f"/api/ingredients/{ingredient_id}/unit-change", json={"unit": unit, **body})
    assert response.status_code == 200, response.text
    return response.json()


def iron_world(client, catalog):
    """Iron in mg (4 decimals) valued 12 for Oats and 0.5 for Seeds; Zinc
    beside it; goals: Iron min 0.5 max 2, Iron with a zero reference, Zinc."""
    iron = catalog.attribute("Iron", "mg", 4)
    zinc = catalog.attribute("Zinc", "mg", 2)
    oats = catalog.ingredient("Oats", "g", "100", values={iron: "12", zinc: "7"})
    seeds = catalog.ingredient("Seeds", "g", "100", values={iron: "0.5"})
    schedule(client, goals=[
        goal(iron, min="0.5", max="2"),
        goal(iron, min="0", applies_to="plan_total", zero_reference="1.5"),
        goal(zinc, min="3"),
    ])
    return iron, zinc, oats, seeds


def iron_numbers(client, iron, zinc):
    ingredients = {i["name"]: {v["attribute_id"]: v["value"] for v in i["values"]}
                   for i in client.get("/api/ingredients").json()}
    goals = [(g["min"], g["max"], g["zero_reference"]) for g in client.get("/api/plan").json()["goals"]]
    return ingredients, goals


def test_the_attribute_unit_converts_values_and_goals(client, catalog):
    iron, zinc, oats, seeds = iron_world(client, catalog)
    response = put_attribute(client, iron, unit="µg", decimals=2)
    assert response.status_code == 200, response.text
    assert response.json()["unit"] == "µg" and response.json()["decimals"] == 2
    ingredients, goals = iron_numbers(client, iron, zinc)
    assert ingredients == {"Oats": {iron: "12000", zinc: "7"}, "Seeds": {iron: "500"}}
    assert goals == [("500", "2000", None), ("0", None, "1500"), ("3", None, None)]


def test_the_preview_says_what_put_does(client, catalog):
    iron, zinc, *_ = iron_world(client, catalog)
    before = iron_numbers(client, iron, zinc)
    assert preview_attribute(client, iron, "µg") == {
        "kind": "convert", "factor": "1000", "counts": {"ingredient_values": 2, "goals": 2},
        "rounded": 0, "refusal": None,
    }
    assert iron_numbers(client, iron, zinc) == before
    assert client.get("/api/attributes").json()[0]["unit"] == "mg"


@pytest.mark.parametrize(("to", "decimals"), [("g", 4), ("g", 6), ("kg", 6), ("oz", 6), ("dl", 4), ("mg", 4), ("µg", 4)])
def test_preview_and_put_agree(client, catalog, to, decimals):
    iron, zinc, *_ = iron_world(client, catalog)
    before = iron_numbers(client, iron, zinc)
    preview = preview_attribute(client, iron, to, decimals=decimals)
    response = put_attribute(client, iron, unit=to, decimals=decimals)
    if preview["refusal"]:
        assert response.status_code == 422
        [error] = response.json()["detail"]
        assert (error["loc"], error["type"], error["msg"]) == (
            ["body", "unit"], preview["refusal"]["type"], preview["refusal"]["msg"])
        assert iron_numbers(client, iron, zinc) == before
        assert client.get("/api/attributes").json()[0]["unit"] == "mg"
    else:
        assert response.status_code == 200
        if preview["kind"] != "convert":
            assert iron_numbers(client, iron, zinc) == before


def test_the_ingredient_unit_converts_basis_and_recipe_amounts(client, catalog):
    iron = catalog.attribute("Iron", "mg", 4)
    oats = catalog.ingredient("Oats", "g", "100", values={iron: "12"})
    catalog.recipe("Porridge", {oats: "60"})
    catalog.recipe("Muesli", {oats: "150"})
    totals = [r["totals"] for r in client.get("/api/recipes").json()]
    assert preview_ingredient(client, oats, "kg") == {
        "kind": "convert", "factor": "0.001", "counts": {"basis": 1, "recipe_amounts": 2},
        "rounded": 0, "refusal": None,
    }
    body = ingredient_body(unit="kg", values=[{"attribute_id": iron, "value": "12"}])
    assert client.put(f"/api/ingredients/{oats}", json=body).status_code == 200
    stored = client.get(f"/api/ingredients/{oats}").json()
    assert (stored["unit"], stored["basis"], stored["values"]) == ("kg", "0.1", [{"attribute_id": iron, "value": "12"}])
    recipes = client.get("/api/recipes").json()
    assert [[i["amount"] for i in r["items"]] for r in recipes] == [["0.06"], ["0.15"]]
    assert [r["totals"] for r in recipes] == totals


def test_a_basis_edited_in_the_same_save_converts_too(client, catalog):
    oats = catalog.ingredient("Oats", "g", "100")
    assert preview_ingredient(client, oats, "kg", basis="50")["counts"] == {"basis": 1, "recipe_amounts": 0}
    assert client.put(f"/api/ingredients/{oats}", json=ingredient_body(unit="kg", basis="50")).status_code == 200
    assert client.get(f"/api/ingredients/{oats}").json()["basis"] == "0.05"


def test_saved_results_keep_their_numbers_and_the_plan_setup_converts(client, catalog):
    iron, zinc, *_ = iron_world(client, catalog)
    schedule(client, days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[])
    catalog.recipe("Porridge", {catalog.ingredient("Flakes", "g", "100", values={iron: "1"}): "100"})
    plan_id = solve(client)["plan"]["id"]
    assert client.post(f"/api/plan-results/{plan_id}/save").status_code == 200
    saved = client.get(f"/api/plan-results/{plan_id}").json()
    assert put_attribute(client, iron, unit="µg", decimals=4).status_code == 200
    assert client.get(f"/api/plan-results/{plan_id}").json() == saved
    goals = client.get("/api/plan").json()["goals"]
    assert [(g["attribute_id"], g["min"]) for g in goals] == [(iron, "500"), (iron, "0"), (zinc, "3")]


@pytest.mark.parametrize(
    ("to", "kind"),
    [("dl", "no_convert"), ("IU", "no_convert"), ("mg.", "same"), ("MG", "no_convert"), ("kcal", "no_convert")],
)
def test_another_category_or_free_text_converts_nothing(client, catalog, to, kind):
    iron, zinc, *_ = iron_world(client, catalog)
    before = iron_numbers(client, iron, zinc)
    assert preview_attribute(client, iron, to) == {
        "kind": kind, "factor": None, "counts": {"ingredient_values": 2, "goals": 2},
        "rounded": 0, "refusal": None,
    }
    assert put_attribute(client, iron, unit=to).status_code == 200
    assert client.get("/api/attributes").json()[0]["unit"] == to
    assert iron_numbers(client, iron, zinc) == before


@pytest.mark.parametrize(("start", "to", "kind"), [("IU", "mg", "no_convert"), ("IU", "IE", "no_convert"), ("st", "pcs", "same"), ("g", "gram", "same")])
def test_from_free_text_and_spellings(client, catalog, start, to, kind):
    iron, zinc, *_ = iron_world(client, catalog)
    assert put_attribute(client, iron, unit=start).status_code == 200
    before = iron_numbers(client, iron, zinc)
    assert preview_attribute(client, iron, to)["kind"] == kind
    assert put_attribute(client, iron, unit=to).status_code == 200
    assert iron_numbers(client, iron, zinc) == before


def test_digits_lost_from_ingredient_numbers_are_rounded_and_counted(client, catalog):
    oats = catalog.ingredient("Oats", "g", "100")
    catalog.recipe("Porridge", {oats: "1.234567"})
    assert preview_ingredient(client, oats, "kg")["rounded"] == 1
    assert client.put(f"/api/ingredients/{oats}", json=ingredient_body(unit="kg")).status_code == 200
    assert client.get("/api/recipes").json()[0]["items"][0]["amount"] == "0.001235"
    iron = catalog.attribute("Iron", "mg", 0)
    other = catalog.ingredient("Seeds", "g", "100", values={iron: "0.000123"})
    assert preview_attribute(client, iron, "g")["rounded"] == 1
    assert put_attribute(client, iron, unit="g", decimals=0).status_code == 200
    assert client.get(f"/api/ingredients/{other}").json()["values"][0]["value"] == "0"
    assert preview_attribute(client, iron, "mg")["rounded"] == 0


def test_a_goal_bound_needing_more_decimals_is_refused_until_they_are_raised(client, catalog):
    iron, zinc, *_ = iron_world(client, catalog)
    preview = preview_attribute(client, iron, "g", decimals=3)
    assert preview["refusal"] == {
        "type": "conversion_needs_decimals", "msg": preview["refusal"]["msg"], "kind": "goal",
        "name": "Iron per day", "field": "min", "number": "0.5", "converted": "0.0005", "decimals_needed": 4,
        "source": None, "unit": None,
    }
    response = put_attribute(client, iron, unit="g", decimals=3)
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "conversion_needs_decimals"
    assert response.json()["detail"][0]["loc"] == ["body", "unit"]
    assert client.get("/api/attributes").json()[0]["unit"] == "mg"
    assert preview_attribute(client, iron, "g", decimals=4)["refusal"] is None
    assert put_attribute(client, iron, unit="g", decimals=4).status_code == 200


def test_the_preview_uses_the_stored_decimals_when_none_are_sent(client, catalog):
    iron = catalog.attribute("Iron", "mg", 3)
    schedule(client, goals=[goal(iron, min="0.5")])
    assert preview_attribute(client, iron, "g")["refusal"]["decimals_needed"] == 4


def test_a_zero_reference_is_refused_like_a_bound(client, catalog):
    iron = catalog.attribute("Iron", "mg", 3)
    schedule(client, goals=[goal(iron, min="0", zero_reference="0.5")])
    refusal = preview_attribute(client, iron, "g")["refusal"]
    assert (refusal["kind"], refusal["field"]) == ("goal", "zero_reference")
    assert put_attribute(client, iron, unit="g", decimals=3).status_code == 422


def test_a_value_reaching_a_billion_is_refused(client, catalog):
    iron = catalog.attribute("Iron", "mg", 4)
    catalog.ingredient("Oats", "g", "100", values={iron: "999999999"})
    refusal = preview_attribute(client, iron, "µg")["refusal"]
    assert (refusal["type"], refusal["kind"], refusal["name"]) == ("conversion_too_large", "ingredient_value", "Oats")
    response = put_attribute(client, iron, unit="µg")
    assert response.status_code == 422 and response.json()["detail"][0]["type"] == "conversion_too_large"


def test_a_recipe_amount_that_would_round_to_zero_is_refused(client, catalog):
    oats = catalog.ingredient("Oats", "g", "100")
    catalog.recipe("Porridge", {oats: "0.0004"})
    refusal = preview_ingredient(client, oats, "kg")["refusal"]
    assert (refusal["type"], refusal["kind"], refusal["name"]) == (
        "conversion_rounds_to_zero", "recipe_amount", "Porridge")
    response = client.put(f"/api/ingredients/{oats}", json=ingredient_body(unit="kg"))
    assert response.status_code == 422 and response.json()["detail"][0]["type"] == "conversion_rounds_to_zero"
    assert client.get(f"/api/ingredients/{oats}").json()["unit"] == "g"


def test_a_ratio_without_a_decimal_refuses_goals_and_rounds_values(client, catalog):
    iron = catalog.attribute("Iron", "tsk", 6)
    catalog.ingredient("Oats", "g", "100", values={iron: "2"})
    preview = preview_attribute(client, iron, "US cup")
    assert (preview["kind"], preview["rounded"], preview["refusal"]) == ("convert", 1, None)
    assert put_attribute(client, iron, unit="US cup", decimals=6).status_code == 200
    zinc = catalog.attribute("Zinc", "tsk", 6)
    schedule(client, goals=[goal(zinc, min="1")])
    refusal = preview_attribute(client, zinc, "US cup")["refusal"]
    assert (refusal["type"], refusal["decimals_needed"]) == ("conversion_needs_decimals", None)
    assert put_attribute(client, zinc, name="Zinc", unit="US cup", decimals=6).status_code == 422


def test_the_ingredient_preview_refuses_an_energy_unit_and_put_keeps_its_422(client, catalog):
    oats = catalog.ingredient("Oats", "g", "100")
    refusal = preview_ingredient(client, oats, "kcal")["refusal"]
    assert refusal["type"] == "unit_not_for_ingredient"
    response = client.put(f"/api/ingredients/{oats}", json=ingredient_body(unit="kcal"))
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "unit_not_for_ingredient"


def test_a_name_clash_leaves_every_number_as_it_was(client, catalog):
    iron, zinc, *_ = iron_world(client, catalog)
    before = iron_numbers(client, iron, zinc)
    assert put_attribute(client, iron, name="Zinc", unit="µg").status_code == 409
    assert iron_numbers(client, iron, zinc) == before
    assert client.get("/api/attributes").json()[0]["unit"] == "mg"
    oats = catalog.ingredient("Porridge oats", "g", "100")
    catalog.recipe("Porridge", {oats: "60"})
    assert client.put(f"/api/ingredients/{oats}", json=ingredient_body(name="Oats", unit="kg")).status_code == 409
    assert client.get(f"/api/ingredients/{oats}").json()["basis"] == "100"
    assert client.get("/api/recipes").json()[0]["items"][0]["amount"] == "60"


def test_the_previews_404_and_write_nothing(client, catalog):
    assert client.post("/api/attributes/99/unit-change", json={"unit": "g"}).status_code == 404
    assert client.post("/api/ingredients/99/unit-change", json={"unit": "g"}).status_code == 404
    client.get("/api/attributes")
    assert client.get("/api/plan").status_code == 200


def test_the_preview_of_a_first_plan_does_not_create_it(client, catalog):
    iron = catalog.attribute("Iron", "mg", 4)
    assert preview_attribute(client, iron, "g")["counts"] == {"ingredient_values": 0, "goals": 0}


def test_the_previews_need_a_session(anonymous_client):
    for path in ("/api/attributes/1/unit-change", "/api/ingredients/1/unit-change"):
        assert anonymous_client.post(path, json={"unit": "g"}).status_code == 401


# --- a unit change must keep mapped source columns converting ----------------


@pytest.fixture
def mapped(data_client):
    """Attribute Protein in g with an ingredient value, mapped from the TEST
    Protein column (g) of the TEST source."""
    from .conftest import Catalog

    catalog = Catalog(data_client)
    protein = catalog.attribute("Protein", "g", 3)
    oats = catalog.ingredient("Oats", "g", "100", values={protein: "13.5"})
    columns = data_client.get("/api/data-sources/testsource").json()["columns"]
    column = {c["key"]: c["id"] for c in columns}["PROT"]
    response = data_client.put(
        f"/api/data-sources/testsource/columns/{column}", json={"attribute_id": protein}
    )
    assert response.status_code == 200
    return data_client, protein, oats, column


def protein_body(unit, **changes):
    return attribute_body(name="Protein", unit=unit, decimals=3, **changes)


@pytest.mark.parametrize("unit", ["kg", "mg", "µg", "gram"])
def test_a_unit_change_within_the_category_keeps_the_mapping(mapped, unit):
    client, protein, _, _ = mapped
    assert preview_attribute(client, protein, unit)["refusal"] is None
    response = client.put(f"/api/attributes/{protein}", json=protein_body(unit))
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("unit", ["kcal", "portion", "ml"])
def test_a_unit_change_that_breaks_a_mapping_is_refused(mapped, unit):
    client, protein, oats, column = mapped
    refusal = preview_attribute(client, protein, unit)["refusal"]
    assert refusal == {
        "type": "unit_mismatch", "msg": refusal["msg"], "kind": "source_column", "name": "TEST Protein",
        "source": "TEST Source", "unit": "g", "field": None, "number": None, "converted": None,
        "decimals_needed": None,
    }
    assert "Unmap the column" in refusal["msg"]

    response = client.put(f"/api/attributes/{protein}", json=protein_body(unit))
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "unit"], "unit_mismatch")
    stored = client.get("/api/attributes").json()[0]
    assert (stored["name"], stored["unit"], stored["mapping_count"]) == ("Protein", "g", 1)
    assert client.get(f"/api/ingredients/{oats}").json()["values"][0]["value"] == "13.5"


def test_the_same_change_is_allowed_once_the_column_is_unmapped(mapped):
    client, protein, _, column = mapped
    client.put(f"/api/data-sources/testsource/columns/{column}", json={"attribute_id": None})
    assert preview_attribute(client, protein, "kcal")["kind"] == "no_convert"
    assert preview_attribute(client, protein, "kcal")["refusal"] is None
    assert client.put(f"/api/attributes/{protein}", json=protein_body("kcal")).status_code == 200


def test_a_conversion_refusal_is_unchanged_by_a_mapping(mapped):
    # The two refusals can't both apply (a mapping breaks only where nothing
    # converts), so a conversion refusal inside the category is U3's own.
    client, protein, _, _ = mapped
    from .test_plan import goal

    schedule(client, goals=[goal(protein, min="0.5")])
    refusal = preview_attribute(client, protein, "kg", decimals=3)["refusal"]
    assert refusal["type"] == "conversion_needs_decimals"
    assert refusal["kind"] == "goal"


def test_a_spelling_change_is_not_refused(mapped):
    client, protein, _, _ = mapped
    preview = preview_attribute(client, protein, "gram")
    assert (preview["kind"], preview["refusal"]) == ("same", None)
