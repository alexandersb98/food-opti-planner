"""Adding an ingredient from a source food, unlinking it, and the unit rule
for a linked ingredient."""

from decimal import Decimal

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from server import models

from .conftest import Catalog
from .data_source_files import test_source, write

FROM_SOURCE = "/api/ingredients/from-source"
FOODS = "/api/data-sources/testsource/foods"


def food_id(client, name="TEST Oats"):
    foods = client.get(FOODS).json()["foods"]
    return {f["name"]: f["id"] for f in foods}[name]


def map_columns(client, mapping=None):
    """Attributes made for the fixture's columns and mapped; answers their ids by column key."""
    mapping = mapping or {"PROT": ("Protein", "g"), "ENERC:kcal": ("Energy", "kJ"), "VITD": ("Vitamin D", "mg")}
    catalog = Catalog(client)
    columns = {c["key"]: c["id"] for c in client.get("/api/data-sources/testsource").json()["columns"]}
    made = {}
    for key, (name, unit) in mapping.items():
        made[key] = catalog.attribute(name, unit)
        response = client.put(f"/api/data-sources/testsource/columns/{columns[key]}", json={"attribute_id": made[key]})
        assert response.status_code == 200, response.text
    return made


def add(client, name="Source oats", food="TEST Oats", tag_ids=(), **changes):
    body = {"food_id": food_id(client, food), "name": name, "tag_ids": list(tag_ids), **changes}
    return client.post(FROM_SOURCE, json=body)


def source_values(client, ingredient_id):
    with Session(client.app.state.engine) as db:
        rows = db.scalars(
            select(models.IngredientValue)
            .where(models.IngredientValue.ingredient_id == ingredient_id)
            .order_by(models.IngredientValue.attribute_id)
        )
        return {row.attribute_id: row.source_value for row in rows}


def food_tags(client):
    return {t["name"]: t["id"] for t in client.get("/api/tags").json()}


def error_of(response):
    [error] = response.json()["detail"]
    return error["loc"], error["type"]


def test_the_routes_need_a_session(anonymous_client):
    assert anonymous_client.post(FROM_SOURCE, json={}).status_code == 401
    assert anonymous_client.post("/api/ingredients/1/unlink").status_code == 401


def test_add_copies_the_converted_values_and_remembers_the_source(data_client):
    made = map_columns(data_client)
    grains = food_tags(data_client)["TEST Grains"]
    response = add(data_client, tag_ids=[grains])
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["name"], body["unit"], body["basis"]) == ("Source oats", "g", "100")
    expected = {made["PROT"]: "13.5", made["ENERC:kcal"]: "1627.576", made["VITD"]: "0"}
    assert {v["attribute_id"]: v["value"] for v in body["values"]} == expected
    assert body["tag_ids"] == [grains]
    assert body["source"] == {
        "key": "testsource", "name": "TEST Source", "colour": body["source"]["colour"],
        "food_id": food_id(data_client), "food_name": "TEST Oats", "withdrawn": False,
    }
    assert body["source"]["colour"].startswith("#")
    assert source_values(data_client, body["id"]) == {int(k): Decimal(v) for k, v in expected.items()}


def test_unchosen_tags_are_not_linked_and_none_is_fine(data_client):
    assert add(data_client).json()["tag_ids"] == []


def test_the_basis_is_in_the_preferred_mass_unit(data_client):
    data_client.put("/api/preferences", json={"unit.mass": "kg"})
    body = add(data_client).json()
    assert (body["unit"], body["basis"]) == ("kg", "0.1")


def test_unmapped_columns_copy_nothing(data_client):
    map_columns(data_client, {"PROT": ("Protein", "g")})
    body = add(data_client).json()
    assert len(body["values"]) == 1
    nothing = add(data_client, "Another", "TEST Milk")
    assert nothing.status_code == 201


def test_no_mapping_at_all_gives_an_ingredient_with_no_values(data_client):
    body = add(data_client).json()
    assert body["values"] == [] and body["source"]["food_name"] == "TEST Oats"


def test_a_missing_source_value_is_no_row(data_client):
    made = map_columns(data_client)
    body = add(data_client, "Milk", "TEST Milk").json()
    assert made["VITD"] not in {v["attribute_id"] for v in body["values"]}


def test_a_value_too_large_to_store_is_left_out_and_the_add_succeeds(data_client):
    made = map_columns(data_client, {"PROT": ("Protein", "µg"), "ENERC:kcal": ("Energy", "kcal")})
    cheese = food_id(data_client, "TEST Cheese")
    with Session(data_client.app.state.engine) as db:
        protein = select(models.SourceColumn.id).where(models.SourceColumn.key == "PROT").scalar_subquery()
        db.execute(
            update(models.SourceFoodValue)
            .where(models.SourceFoodValue.food_id == cheese, models.SourceFoodValue.column_id == protein)
            .values(value=Decimal("1000"))
        )
        db.commit()
    response = add(data_client, "Cheese", "TEST Cheese")
    assert response.status_code == 201
    assert [v["attribute_id"] for v in response.json()["values"]] == [made["ENERC:kcal"]]


def test_an_unknown_food_is_422(data_client):
    response = data_client.post(FROM_SOURCE, json={"food_id": 99999, "name": "X", "tag_ids": []})
    assert response.status_code == 422
    assert error_of(response) == (["body", "food_id"], "unknown_food")


def test_a_withdrawn_food_is_refused_and_nothing_is_made(data_client):
    oats = food_id(data_client)
    with Session(data_client.app.state.engine) as db:
        db.execute(update(models.SourceFood).where(models.SourceFood.id == oats).values(withdrawn=True))
        db.commit()
    response = data_client.post(FROM_SOURCE, json={"food_id": oats, "name": "X", "tag_ids": []})
    assert response.status_code == 422
    assert error_of(response) == (["body", "food_id"], "withdrawn")
    assert data_client.get("/api/ingredients").json() == []


def test_a_tag_of_another_food_is_refused(data_client):
    dairy = food_tags(data_client)["TEST Dairy"]
    response = add(data_client, tag_ids=[dairy])
    assert response.status_code == 422
    assert error_of(response) == (["body", "tag_ids", 0], "not_a_food_tag")


def test_an_ordinary_tag_is_not_a_food_tag_and_an_unknown_one_is_unknown(data_client):
    vegan = Catalog(data_client).tag()
    assert error_of(add(data_client, tag_ids=[vegan])) == (["body", "tag_ids", 0], "not_a_food_tag")
    assert error_of(add(data_client, tag_ids=[99999])) == (["body", "tag_ids", 0], "unknown_tag")


def test_a_taken_name_is_409_and_creates_nothing(data_client):
    Catalog(data_client).ingredient("Source oats")
    response = add(data_client)
    assert response.status_code == 409
    assert error_of(response) == (["body", "name"], "name_in_use")
    assert len(data_client.get("/api/ingredients").json()) == 1


def test_the_same_food_twice_under_two_names_is_fine_and_both_show_in_the_preview(data_client):
    assert add(data_client, "First").status_code == 201
    assert add(data_client, "Second").status_code == 201
    existing = data_client.get(f"{FOODS}/{food_id(data_client)}").json()["existing"]
    assert [e["name"] for e in existing] == ["First", "Second"]


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_a_bad_name_is_422(data_client, name):
    assert add(data_client, name).status_code == 422


def test_ingredients_carry_their_source_and_the_list_fills_it_in(data_client):
    plain = Catalog(data_client).ingredient("Plain")
    first = add(data_client, "A").json()["id"]
    second = add(data_client, "B", "TEST Milk").json()["id"]
    by_id = {i["id"]: i for i in data_client.get("/api/ingredients").json()}
    assert by_id[plain]["source"] is None
    assert by_id[first]["source"]["food_name"] == "TEST Oats"
    assert by_id[second]["source"]["food_name"] == "TEST Milk"
    assert data_client.get(f"/api/ingredients/{plain}").json()["source"] is None
    assert data_client.get(f"/api/ingredients/{first}").json() == by_id[first]


def test_a_withdrawn_food_shows_on_the_ingredient_which_keeps_its_values(data_client):
    map_columns(data_client)
    made = add(data_client).json()
    with Session(data_client.app.state.engine) as db:
        db.execute(update(models.SourceFood).where(models.SourceFood.id == food_id(data_client)).values(withdrawn=True))
        db.commit()
    body = data_client.get(f"/api/ingredients/{made['id']}").json()
    assert body["source"]["withdrawn"] is True
    assert body["values"] == made["values"]


def test_unlink_cuts_the_link_and_the_source_values_but_keeps_the_rest(data_client):
    map_columns(data_client)
    grains = food_tags(data_client)["TEST Grains"]
    made = add(data_client, tag_ids=[grains]).json()
    response = data_client.post(f"/api/ingredients/{made['id']}/unlink")
    assert response.status_code == 200
    assert response.json() == {**made, "source": None}
    assert set(source_values(data_client, made["id"]).values()) == {None}
    assert data_client.post(f"/api/ingredients/{made['id']}/unlink").json() == {**made, "source": None}


def test_unlink_of_an_unknown_ingredient_is_404(data_client):
    assert data_client.post("/api/ingredients/99999/unlink").status_code == 404


def test_after_unlinking_the_ingredient_accepts_a_volume_unit(data_client):
    made = add(data_client).json()
    data_client.post(f"/api/ingredients/{made['id']}/unlink")
    fields = {k: made[k] for k in ("name", "unit", "basis", "values", "tag_ids")}
    assert data_client.put(f"/api/ingredients/{made['id']}", json={**fields, "unit": "dl"}).status_code == 200


def fields_of(made, **changes):
    return {**{k: made[k] for k in ("name", "unit", "basis", "values", "tag_ids")}, **changes}


def put(client, made, **changes):
    return client.put(f"/api/ingredients/{made['id']}", json=fields_of(made, **changes))


def preview(client, made, unit):
    response = client.post(f"/api/ingredients/{made['id']}/unit-change", json={"unit": unit})
    assert response.status_code == 200
    return response.json()


def test_a_linked_ingredient_may_change_to_another_mass_unit(data_client):
    map_columns(data_client)
    made = add(data_client).json()
    answer = preview(data_client, made, "kg")
    assert (answer["kind"], answer["refusal"]) == ("convert", None)
    response = put(data_client, made, unit="kg")
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["unit"], body["basis"]) == ("kg", "0.1")
    assert body["source"]["food_name"] == "TEST Oats"
    assert set(source_values(data_client, made["id"]).values()) != {None}


@pytest.mark.parametrize("unit", ["dl", "st", "portion"])
def test_a_linked_ingredient_refuses_a_unit_that_is_not_mass(data_client, unit):
    made = add(data_client).json()
    response = put(data_client, made, unit=unit)
    assert response.status_code == 422
    assert error_of(response) == (["body", "unit"], "unit_not_for_source")
    assert data_client.get(f"/api/ingredients/{made['id']}").json() == made
    assert preview(data_client, made, unit)["refusal"]["type"] == "unit_not_for_source"


def test_an_energy_unit_is_still_not_for_an_ingredient(data_client):
    made = add(data_client).json()
    assert error_of(put(data_client, made, unit="kcal")) == (["body", "unit"], "unit_not_for_ingredient")
    assert preview(data_client, made, "kcal")["refusal"]["type"] == "unit_not_for_ingredient"


def test_an_ordinary_ingredient_may_still_change_to_dl(client, catalog):
    oats = catalog.ingredient()
    body = client.get(f"/api/ingredients/{oats}").json()
    assert put(client, body, unit="dl").status_code == 200
    assert preview(client, body, "dl")["refusal"] is None


def test_editing_a_value_keeps_the_other_source_values_and_emptying_one_removes_its_row(data_client):
    made_attributes = map_columns(data_client)
    made = add(data_client).json()
    energy, protein, vitamin = (made_attributes[k] for k in ("ENERC:kcal", "PROT", "VITD"))
    values = [{"attribute_id": energy, "value": "1"}, {"attribute_id": protein, "value": "13.5"}]
    assert put(data_client, made, values=values).status_code == 200
    stored = source_values(data_client, made["id"])
    assert stored == {energy: Decimal("1627.576"), protein: Decimal("13.5")}  # vitamin D's row went with its value
    assert vitamin not in stored


def test_creating_an_ordinary_ingredient_has_no_link(client):
    body = client.post("/api/ingredients", json={"name": "Oats", "unit": "dl", "basis": "100", "values": [], "tag_ids": []})
    assert body.json()["source"] is None
