"""Updated source values on ingredients, and Accept / Keep mine (slice D5)."""

from decimal import Decimal

from sqlalchemy import event, select, update
from sqlalchemy.orm import Session

from server import models
from server.source_loader import load_file, read_file

from .conftest import Catalog
from .data_source_files import test_source, write
from .test_ingredients_from_source import add, food_id, map_columns, source_values

ANSWER = "/api/ingredients/{}/source-values"


def linked(client, name="Linked", **mapping):
    """Protein (g) and Energy (kcal) mapped, TEST Oats added: answers the ingredient and the attribute ids."""
    made = map_columns(client, mapping or {"PROT": ("Protein", "g"), "ENERC:kcal": ("Energy", "kcal")})
    response = add(client, name)
    assert response.status_code == 201, response.text
    return response.json(), made


def change_source(client, key="PROT", value="13.8", food="TEST Oats"):
    engine = client.app.state.engine
    with Session(engine) as db:
        food_row = db.scalars(select(models.SourceFood).where(models.SourceFood.name == food)).one()
        column = db.scalars(select(models.SourceColumn).where(models.SourceColumn.key == key)).one()
        db.get(models.SourceFoodValue, (food_row.id, column.id)).value = Decimal(value)
        db.commit()


def read(client, ingredient_id):
    return client.get(f"/api/ingredients/{ingredient_id}").json()


def values_of(body):
    return {v["attribute_id"]: v["value"] for v in body["values"]}


def answer(client, ingredient_id, what):
    return client.post(ANSWER.format(ingredient_id), json={"answer": what})


def test_a_fresh_add_has_no_updates_and_an_ordinary_ingredient_neither(data_client):
    ingredient, _ = linked(data_client)
    assert ingredient["updated_values"] == []
    plain = Catalog(data_client).ingredient("Plain")
    assert read(data_client, plain)["updated_values"] == []


def test_a_changed_source_value_shows_on_the_ingredient_and_in_the_list(data_client):
    ingredient, made = linked(data_client)
    change_source(data_client)
    expected = [{"attribute_id": made["PROT"], "value": "13.5", "new_value": "13.8"}]
    assert read(data_client, ingredient["id"])["updated_values"] == expected
    [listed] = data_client.get("/api/ingredients").json()
    assert listed["updated_values"] == expected


def test_a_new_file_version_brings_the_update_and_the_same_file_again_changes_nothing(data_client, tmp_path):
    ingredient, made = linked(data_client)
    foods = test_source()["foods"]
    foods[0]["values"]["PROT"] = "13.8"
    path = write(tmp_path / "new", test_source(version="2026-02-01", foods=foods))
    for expected_loaded in (True, False):
        with Session(data_client.app.state.engine) as db:
            assert load_file(db, read_file(path)) is expected_loaded
        assert read(data_client, ingredient["id"])["updated_values"] == [
            {"attribute_id": made["PROT"], "value": "13.5", "new_value": "13.8"}
        ]


def test_accept_copies_the_new_values_and_remembers_the_source_number(data_client):
    ingredient, made = linked(data_client)
    tag = Catalog(data_client).tag("mine")
    body = {**ingredient, "tag_ids": [tag]}
    assert data_client.put(f"/api/ingredients/{ingredient['id']}", json=body).status_code == 200
    change_source(data_client)
    response = answer(data_client, ingredient["id"], "accept")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated_values"] == []
    assert values_of(body) == {made["PROT"]: "13.8", made["ENERC:kcal"]: "389"}
    assert body["tag_ids"] == [tag]
    assert source_values(data_client, ingredient["id"])[made["PROT"]] == Decimal("13.8")
    assert read(data_client, ingredient["id"])["updated_values"] == []


def test_accept_leaves_a_value_whose_column_is_no_longer_mapped(data_client):
    ingredient, made = linked(data_client)
    change_source(data_client)
    change_source(data_client, "ENERC:kcal", "400")
    columns = {c["key"]: c["id"] for c in data_client.get("/api/data-sources/testsource").json()["columns"]}
    data_client.put(f"/api/data-sources/testsource/columns/{columns['ENERC:kcal']}", json={"attribute_id": None})
    body = answer(data_client, ingredient["id"], "accept").json()
    assert values_of(body) == {made["PROT"]: "13.8", made["ENERC:kcal"]: "389"}
    assert source_values(data_client, ingredient["id"])[made["ENERC:kcal"]] == Decimal("389")


def test_keep_leaves_the_values_and_the_banner_returns_only_on_the_next_change(data_client):
    ingredient, made = linked(data_client)
    change_source(data_client)
    body = answer(data_client, ingredient["id"], "keep").json()
    assert body["updated_values"] == []
    assert values_of(body)[made["PROT"]] == "13.5"
    assert source_values(data_client, ingredient["id"])[made["PROT"]] == Decimal("13.8")
    assert read(data_client, ingredient["id"])["updated_values"] == []
    change_source(data_client, value="14")
    assert [u["new_value"] for u in read(data_client, ingredient["id"])["updated_values"]] == ["14"]


def test_keep_makes_a_zero_row_where_there_was_none_and_a_put_without_it_brings_the_banner_back(data_client):
    made = map_columns(data_client, {"PROT": ("Protein", "g")})
    ingredient = add(data_client).json()
    columns = {c["key"]: c["id"] for c in data_client.get("/api/data-sources/testsource").json()["columns"]}
    energy = Catalog(data_client).attribute("Energy", "kcal")
    data_client.put(f"/api/data-sources/testsource/columns/{columns['ENERC:kcal']}", json={"attribute_id": energy})
    assert read(data_client, ingredient["id"])["updated_values"] == [
        {"attribute_id": energy, "value": None, "new_value": "389"}
    ]
    body = answer(data_client, ingredient["id"], "keep").json()
    assert values_of(body) == {made["PROT"]: "13.5", energy: "0"}
    assert body["updated_values"] == []
    kept = {**body, "values": [dict(v) for v in body["values"]]}
    assert data_client.put(f"/api/ingredients/{ingredient['id']}", json=kept).json()["updated_values"] == []
    without = {**kept, "values": [v for v in kept["values"] if v["attribute_id"] != energy]}
    assert [u["attribute_id"] for u in data_client.put(f"/api/ingredients/{ingredient['id']}", json=without).json()["updated_values"]] == [energy]


def test_a_column_mapped_later_is_offered_and_accept_makes_the_row(data_client):
    ingredient = add_before_mapping(data_client)
    protein = Catalog(data_client).attribute("Protein", "g")
    map_protein(data_client, protein)
    assert read(data_client, ingredient["id"])["updated_values"] == [
        {"attribute_id": protein, "value": None, "new_value": "13.5"}
    ]
    body = answer(data_client, ingredient["id"], "accept").json()
    assert values_of(body) == {protein: "13.5"}
    assert body["updated_values"] == []


def add_before_mapping(client):
    response = add(client)
    assert response.status_code == 201
    return response.json()


def map_protein(client, attribute_id):
    columns = {c["key"]: c["id"] for c in client.get("/api/data-sources/testsource").json()["columns"]}
    assert client.put(f"/api/data-sources/testsource/columns/{columns['PROT']}", json={"attribute_id": attribute_id}).status_code == 200


def test_a_later_mapping_of_a_zero_value_offers_nothing(data_client):
    ingredient = add_before_mapping(data_client)
    columns = {c["key"]: c["id"] for c in data_client.get("/api/data-sources/testsource").json()["columns"]}
    vitamin = Catalog(data_client).attribute("Vitamin D", "µg")
    data_client.put(f"/api/data-sources/testsource/columns/{columns['VITD']}", json={"attribute_id": vitamin})
    assert read(data_client, ingredient["id"])["updated_values"] == []


def test_unmapping_hides_the_update_and_mapping_again_resumes_from_the_old_source_number(data_client):
    ingredient, made = linked(data_client)
    change_source(data_client)
    columns = {c["key"]: c["id"] for c in data_client.get("/api/data-sources/testsource").json()["columns"]}
    data_client.put(f"/api/data-sources/testsource/columns/{columns['PROT']}", json={"attribute_id": None})
    assert read(data_client, ingredient["id"])["updated_values"] == []
    assert source_values(data_client, ingredient["id"])[made["PROT"]] == Decimal("13.5")
    map_protein(data_client, made["PROT"])
    assert [u["new_value"] for u in read(data_client, ingredient["id"])["updated_values"]] == ["13.8"]


def test_the_numbers_are_in_the_ingredients_basis(data_client):
    ingredient, made = linked(data_client)
    edited = {**ingredient, "basis": "50", "values": [
        {"attribute_id": made["PROT"], "value": "6.75"}, {"attribute_id": made["ENERC:kcal"], "value": "194.5"},
    ]}
    assert data_client.put(f"/api/ingredients/{ingredient['id']}", json=edited).status_code == 200
    change_source(data_client)
    assert read(data_client, ingredient["id"])["updated_values"] == [
        {"attribute_id": made["PROT"], "value": "6.75", "new_value": "6.9"}
    ]
    body = answer(data_client, ingredient["id"], "accept").json()
    assert values_of(body) == {made["PROT"]: "6.9", made["ENERC:kcal"]: "194.5"}
    assert source_values(data_client, ingredient["id"])[made["PROT"]] == Decimal("13.8")


def test_the_unit_of_an_attribute_may_change_after_adding_without_a_false_update(data_client):
    ingredient, made = linked(data_client)
    changed = data_client.put(f"/api/attributes/{made['PROT']}", json={"name": "Protein", "unit": "mg", "decimals": 0})
    assert changed.status_code == 200, changed.text
    assert read(data_client, ingredient["id"])["updated_values"] == []


def test_the_routes_refuse_what_cannot_be_answered(data_client, anonymous_client):
    assert anonymous_client.post(ANSWER.format(1), json={"answer": "accept"}).status_code == 401
    ingredient, _ = linked(data_client)
    assert answer(data_client, 9999, "accept").status_code == 404
    plain = Catalog(data_client).ingredient("Plain")
    for target in (plain, unlinked(data_client, ingredient["id"])):
        response = answer(data_client, target, "accept")
        assert response.status_code == 422
        [error] = response.json()["detail"]
        assert (error["loc"], error["type"]) == (["path", "ingredient_id"], "not_linked")
    url = ANSWER.format(ingredient["id"])
    assert data_client.post(url, json={"answer": "maybe"}).status_code == 422
    assert data_client.post(url, json={}).status_code == 422
    assert data_client.post(url).status_code == 422
    assert data_client.post(url, json={"answer": "keep", "extra": 1}).status_code == 422


def unlinked(client, ingredient_id):
    assert client.post(f"/api/ingredients/{ingredient_id}/unlink").status_code == 200
    return ingredient_id


def test_answering_with_nothing_to_answer_is_a_no_op(data_client):
    ingredient, _ = linked(data_client)
    for what in ("accept", "keep"):
        response = answer(data_client, ingredient["id"], what)
        assert response.status_code == 200
        assert response.json() == ingredient
    change_source(data_client)
    assert answer(data_client, ingredient["id"], "accept").status_code == 200
    again = answer(data_client, ingredient["id"], "accept")
    assert again.status_code == 200 and again.json()["updated_values"] == []


def test_the_list_does_not_query_more_for_more_updated_ingredients(data_client):
    map_columns(data_client, {"PROT": ("Protein", "g"), "ENERC:kcal": ("Energy", "kcal")})

    def statements():
        count = []
        engine = data_client.app.state.engine
        listener = lambda *args: count.append(1)  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        try:
            body = data_client.get("/api/ingredients").json()
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        return len(count), sum(bool(i["updated_values"]) for i in body)

    add(data_client, "One")
    change_source(data_client)
    few, updated = statements()
    assert updated == 1
    for i in range(2):
        add(data_client, f"More {i}", "TEST Milk")
        add(data_client, f"Again {i}")
    with Session(data_client.app.state.engine) as db:
        db.execute(
            update(models.IngredientValue).values(value=Decimal(1), source_value=Decimal(1))
        )
        db.commit()
    many, updated = statements()
    assert updated == 5
    assert many == few
