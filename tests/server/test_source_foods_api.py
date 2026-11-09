"""Searching a data source's foods and previewing the ingredient one would become."""

from decimal import Decimal

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from server import models

from .conftest import Catalog, logged_in_client
from .data_source_files import test_source, write

SEARCH = "/api/data-sources/testsource/foods"


def ids_of(client, name="testsource"):
    foods = client.get(f"/api/data-sources/{name}/foods").json()["foods"]
    return {f["name"]: f["id"] for f in foods}


def names(client, **params):
    return [f["name"] for f in client.get(SEARCH, params=params).json()["foods"]]


def source_client(database_url, web_dist, tmp_path, **changes):
    directory = tmp_path / "files"
    write(directory, test_source(**changes))
    return logged_in_client(database_url, web_dist, data_sources_dir=directory)


@pytest.mark.parametrize("path", ["/foods", "/foods/1"])
def test_the_routes_need_a_session(anonymous_client, path):
    assert anonymous_client.get(f"/api/data-sources/testsource{path}").status_code == 401


def test_an_unknown_source_is_404(data_client):
    assert data_client.get("/api/data-sources/nope/foods").status_code == 404
    assert data_client.get("/api/data-sources/nope/foods/1").status_code == 404


def test_search_ignores_case(data_client):
    assert names(data_client, search="oat") == ["TEST Oats"]
    assert names(data_client, search="OAT") == ["TEST Oats"]


def test_search_folds_case_beyond_ascii(database_url, web_dist, tmp_path):
    foods = [{"key": "1", "name": "TEST Älg", "groups": ["TEST Meat"], "values": {}}]
    with source_client(database_url, web_dist, tmp_path, foods=foods) as client:
        assert names(client, search="älg") == ["TEST Älg"]
        assert names(client, search="ÄLG") == ["TEST Älg"]


def test_percent_and_underscore_match_literally(data_client):
    assert names(data_client, search="%") == []
    assert names(data_client, search="_") == []


def test_an_empty_search_lists_everything_alphabetically(data_client):
    page = data_client.get(SEARCH).json()
    assert [f["name"] for f in page["foods"]] == ["TEST Cheese", "TEST Milk", "TEST Oats"]
    assert (page["total"], page["offset"], page["limit"]) == (3, 0, 20)


def test_names_starting_with_the_search_come_first(database_url, web_dist, tmp_path):
    foods = [
        {"key": "1", "name": "TEST Cheese-milk", "groups": [], "values": {}},
        {"key": "2", "name": "Milk", "groups": [], "values": {}},
        {"key": "3", "name": "Almond milk", "groups": [], "values": {}},
    ]
    with source_client(database_url, web_dist, tmp_path, foods=foods) as client:
        assert names(client, search="milk") == ["Milk", "Almond milk", "TEST Cheese-milk"]


def test_every_result_carries_its_group_names(database_url, web_dist, tmp_path):
    foods = [{"key": "1", "name": "TEST Mix", "groups": ["TEST Zed", "TEST Alpha"], "values": {}}]
    with source_client(database_url, web_dist, tmp_path, foods=foods) as client:
        assert client.get(SEARCH).json()["foods"][0]["groups"] == ["TEST Alpha", "TEST Zed"]


def test_a_withdrawn_food_is_not_listed_or_counted(data_client):
    with Session(data_client.app.state.engine) as db:
        db.execute(update(models.SourceFood).where(models.SourceFood.name == "TEST Milk").values(withdrawn=True))
        db.commit()
    page = data_client.get(SEARCH).json()
    assert [f["name"] for f in page["foods"]] == ["TEST Cheese", "TEST Oats"]
    assert page["total"] == 2


def test_paging_by_twenty(database_url, web_dist, tmp_path):
    foods = [{"key": str(i), "name": f"TEST Food {i:02}", "groups": [], "values": {}} for i in range(45)]
    with source_client(database_url, web_dist, tmp_path, foods=foods) as client:
        pages = [client.get(SEARCH, params={"offset": o}).json() for o in (0, 20, 40)]
        assert [len(p["foods"]) for p in pages] == [20, 20, 5]
        assert {p["total"] for p in pages} == {45}
        assert [p["offset"] for p in pages] == [0, 20, 40]
        everything = [f["name"] for p in pages for f in p["foods"]]
        assert everything == sorted(everything) and len(set(everything)) == 45


def test_a_negative_offset_is_422(data_client):
    assert data_client.get(SEARCH, params={"offset": -1}).status_code == 422


def map_columns(client, mapping):
    """Attributes made through the API, and the columns mapped to them."""
    catalog = Catalog(client)
    columns = {c["key"]: c["id"] for c in client.get("/api/data-sources/testsource").json()["columns"]}
    for key, (name, unit) in mapping.items():
        attribute = catalog.attribute(name, unit)
        response = client.put(f"/api/data-sources/testsource/columns/{columns[key]}", json={"attribute_id": attribute})
        assert response.status_code == 200, response.text


def preview(client, name="TEST Oats"):
    response = client.get(f"{SEARCH}/{ids_of(client)[name]}")
    assert response.status_code == 200, response.text
    return response.json()


def test_the_preview_of_an_unmapped_food(data_client):
    body = preview(data_client)
    assert body["name"] == body["suggested_name"] == "TEST Oats"
    assert (body["unit"], body["basis"], body["withdrawn"]) == ("g", "100", False)
    assert body["values"] == [] and body["skipped"] == [] and body["existing"] == []
    assert body["source"]["key"] == "testsource" and body["source"]["name"] == "TEST Source"
    assert body["source"]["colour"].startswith("#")


def test_the_preview_has_the_converted_values(data_client):
    map_columns(data_client, {"PROT": ("Protein", "g"), "ENERC:kcal": ("Energy", "kJ"), "VITD": ("Vitamin D", "mg")})
    values = {v["attribute_name"]: v for v in preview(data_client)["values"]}
    assert {k: v["value"] for k, v in values.items()} == {"Protein": "13.5", "Energy": "1627.576", "Vitamin D": "0"}
    assert values["Energy"]["attribute_unit"] == "kJ" and values["Energy"]["column_name"] == "TEST Energy"
    assert [v["attribute_name"] for v in preview(data_client, "TEST Milk")["values"]] == ["Protein", "Energy"]


def test_the_preview_groups_match_the_tags(data_client):
    tags = {t["name"]: t["id"] for t in data_client.get("/api/tags").json()}
    assert preview(data_client)["groups"] == [{"tag_id": tags["TEST Grains"], "name": "TEST Grains"}]


def test_the_preview_cuts_a_long_name_to_100_characters(database_url, web_dist, tmp_path):
    foods = [{"key": "1", "name": "x" * 150, "groups": [], "values": {}}]
    with source_client(database_url, web_dist, tmp_path, foods=foods) as client:
        body = client.get(f"{SEARCH}/{ids_of(client)['x' * 150]}").json()
        assert body["suggested_name"] == "x" * 100


def test_a_withdrawn_food_still_previews(data_client):
    food_id = ids_of(data_client)["TEST Oats"]
    with Session(data_client.app.state.engine) as db:
        db.execute(update(models.SourceFood).where(models.SourceFood.id == food_id).values(withdrawn=True))
        db.commit()
    body = data_client.get(f"{SEARCH}/{food_id}").json()
    assert body["withdrawn"] is True


def test_the_preview_follows_the_preferred_mass_unit(data_client):
    assert data_client.put("/api/preferences", json={"unit.mass": "kg"}).status_code == 200
    body = preview(data_client)
    assert (body["unit"], body["basis"]) == ("kg", "0.1")


def test_the_preview_lists_ingredients_already_from_the_food(data_client):
    food_id = ids_of(data_client)["TEST Oats"]
    with Session(data_client.app.state.engine) as db:
        for name in ("Zed oats", "Aaa oats"):
            db.add(models.Ingredient(name=name, unit="g", basis=Decimal(100), source_food_id=food_id))
        db.add(models.Ingredient(name="Plain", unit="g", basis=Decimal(100)))
        db.commit()
    assert [e["name"] for e in preview(data_client)["existing"]] == ["Aaa oats", "Zed oats"]
    assert preview(data_client, "TEST Milk")["existing"] == []


def test_a_food_of_another_source_is_404(two_sources_client):
    foods = two_sources_client.get(SEARCH).json()["foods"]
    other = "/api/data-sources/other/foods"
    assert two_sources_client.get(f"{other}/{foods[0]['id']}").status_code == 404
    assert two_sources_client.get(f"{SEARCH}/999999").status_code == 404


def test_a_too_large_value_is_skipped_by_name(data_client):
    map_columns(data_client, {"PROT": ("Protein", "µg")})
    food_id = ids_of(data_client)["TEST Cheese"]
    with Session(data_client.app.state.engine) as db:
        protein = select(models.SourceColumn.id).where(models.SourceColumn.key == "PROT")
        db.execute(
            update(models.SourceFoodValue)
            .where(models.SourceFoodValue.food_id == food_id, models.SourceFoodValue.column_id == protein.scalar_subquery())
            .values(value=Decimal("1000"))  # 1000 g is 10^9 µg
        )
        db.commit()
    body = data_client.get(f"{SEARCH}/{food_id}").json()
    assert body["skipped"] == ["Protein"] and body["values"] == []
