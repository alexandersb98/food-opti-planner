import pytest
from sqlalchemy import update
from sqlalchemy.orm import Session

from server import models

from .conftest import Catalog, logged_in_client
from .data_source_files import test_source, write

ROUTES = [("get", "/api/data-sources"), ("get", "/api/data-sources/testsource"),
          ("patch", "/api/data-sources/testsource")]  # fmt: skip


@pytest.mark.parametrize(("method", "url"), ROUTES)
def test_the_routes_need_a_session(anonymous_client, method, url):
    response = getattr(anonymous_client, method)(url, **({"json": {"colour": "#ff0000"}} if method == "patch" else {}))
    assert response.status_code == 401


def test_the_list_is_empty_without_a_data_file(client):
    response = client.get("/api/data-sources")
    assert response.status_code == 200
    assert response.json() == []


def test_the_list_has_a_row_per_source(data_client):
    rows = data_client.get("/api/data-sources").json()

    assert len(rows) == 1
    row = rows[0]
    assert (row["key"], row["name"], row["version"]) == ("testsource", "TEST Source", "2026-01-01")
    assert (row["food_count"], row["column_count"]) == (3, 3)
    assert len(row["colour"]) == 7 and row["colour"].startswith("#")
    assert row["imported_at"].endswith(("Z", "+00:00"))  # UTC, so the app can show local time
    assert row["mapped_count"] == 0
    assert set(row) == {
        "key", "name", "colour", "version", "imported_at", "food_count", "column_count", "mapped_count",
    }


def test_the_detail_has_the_attribution_and_the_columns_by_name(data_client):
    source = data_client.get("/api/data-sources/testsource").json()

    assert source["attribution"] == "TEST data, not real: for tests only."
    assert [(c["key"], c["name"], c["unit"], c["withdrawn"]) for c in source["columns"]] == [
        ("ENERC:kcal", "TEST Energy", "kcal", False),
        ("PROT", "TEST Protein", "g", False),
        ("VITD", "TEST Vitamin D", "µg", False),
    ]
    assert isinstance(source["columns"][0]["id"], int)
    assert [c["attribute_id"] for c in source["columns"]] == [None, None, None]


def withdraw(app, model, key):
    with Session(app.state.engine) as db:
        db.execute(update(model).where(model.key == key).values(withdrawn=True))
        db.commit()


def test_withdrawn_columns_come_last_and_are_not_counted(data_client):
    withdraw(data_client.app, models.SourceColumn, "ENERC:kcal")
    withdraw(data_client.app, models.SourceFood, "10")

    source = data_client.get("/api/data-sources/testsource").json()

    assert [(c["key"], c["withdrawn"]) for c in source["columns"]] == [
        ("PROT", False),
        ("VITD", False),
        ("ENERC:kcal", True),
    ]
    assert (source["column_count"], source["food_count"]) == (2, 2)
    row = data_client.get("/api/data-sources").json()[0]
    assert (row["column_count"], row["food_count"]) == (2, 2)


@pytest.mark.parametrize("method", ["get", "patch"])
def test_an_unknown_source_is_404(data_client, method):
    kwargs = {"json": {"colour": "#ff0000"}} if method == "patch" else {}

    response = getattr(data_client, method)("/api/data-sources/nope", **kwargs)

    assert response.status_code == 404
    assert response.json() == {"detail": "No such data source"}


def test_the_colour_is_saved_in_lower_case(data_client):
    before = data_client.get("/api/data-sources/testsource").json()

    response = data_client.patch("/api/data-sources/testsource", json={"colour": "#FF8800"})

    assert response.status_code == 200
    assert response.json() == {**before, "colour": "#ff8800"}
    assert data_client.get("/api/data-sources/testsource").json()["colour"] == "#ff8800"
    assert data_client.get("/api/data-sources").json()[0]["colour"] == "#ff8800"


@pytest.mark.parametrize(
    "body",
    [
        {"colour": "red"},
        {"colour": "#fff"},
        {"colour": "ff8800"},
        {"colour": "#gg0000"},
        {"colour": 16744448},
        {},
        {"colour": "#ff8800", "name": "x"},
    ],
)
def test_a_bad_colour_is_refused_and_changes_nothing(data_client, body):
    before = data_client.get("/api/data-sources/testsource").json()

    response = data_client.patch("/api/data-sources/testsource", json=body)

    assert response.status_code == 422
    assert data_client.get("/api/data-sources/testsource").json() == before


# --- mapping a column to an attribute ---------------------------------------


def columns_of(client, source="testsource") -> dict:
    """The source's columns by key."""
    rows = client.get(f"/api/data-sources/{source}").json()["columns"]
    return {c["key"]: c for c in rows}


def put_mapping(client, source, column_id, body):
    return client.put(f"/api/data-sources/{source}/columns/{column_id}", json=body)


def map_to(client, key, attribute_id, source="testsource"):
    return put_mapping(client, source, columns_of(client, source)[key]["id"], {"attribute_id": attribute_id})


def mapping_error(response, error_type):
    assert response.status_code == 422, response.text
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "attribute_id"], error_type)
    return error["msg"]


def stored(client, key="PROT", source="testsource"):
    return columns_of(client, source)[key]["attribute_id"]


def test_the_mapping_route_needs_a_session(anonymous_client):
    response = anonymous_client.put("/api/data-sources/testsource/columns/1", json={"attribute_id": None})
    assert response.status_code == 401


def test_an_unknown_source_or_column_is_404(two_sources_client):
    client = two_sources_client
    other_column = columns_of(client, "other")["PROT"]["id"]
    for source, column in (("nope", 1), ("testsource", 99999), ("testsource", other_column)):
        response = put_mapping(client, source, column, {"attribute_id": None})
        assert response.status_code == 404, (source, column)
    assert put_mapping(client, "nope", 1, {"attribute_id": None}).json()["detail"] == "No such data source"
    assert put_mapping(client, "testsource", 99999, {"attribute_id": None}).json()["detail"] == "No such column"


def test_a_column_maps_to_an_attribute_that_converts(data_client):
    catalog = Catalog(data_client)
    grams, milligrams = catalog.attribute("Protein", "g", 1), catalog.attribute("Iron", "mg", 1)
    kcal, kilojoules = catalog.attribute("Energy", "kcal"), catalog.attribute("Joules", "kJ")

    response = map_to(data_client, "PROT", grams)
    assert response.status_code == 200
    assert response.json()["attribute_id"] == grams
    assert response.json()["key"] == "PROT"
    assert stored(data_client) == grams
    assert data_client.get("/api/data-sources").json()[0]["mapped_count"] == 1

    assert map_to(data_client, "PROT", milligrams).status_code == 200  # same category
    assert map_to(data_client, "ENERC:kcal", kcal).status_code == 200
    assert map_to(data_client, "ENERC:kcal", kilojoules).status_code == 200
    assert (stored(data_client), stored(data_client, "ENERC:kcal")) == (milligrams, kilojoules)
    assert data_client.get("/api/data-sources").json()[0]["mapped_count"] == 2


def test_a_column_does_not_map_to_a_unit_it_does_not_convert_with(data_client):
    catalog = Catalog(data_client)
    energy, grams = catalog.attribute("Energy", "kcal"), catalog.attribute("Protein", "g", 1)
    message = mapping_error(map_to(data_client, "PROT", energy), "unit_mismatch")
    assert message == "TEST Protein is in g, and Energy in kcal: they don't convert."
    mapping_error(map_to(data_client, "ENERC:kcal", grams), "unit_mismatch")
    assert (stored(data_client), stored(data_client, "ENERC:kcal")) == (None, None)


def test_free_text_units_map_when_they_are_the_same_text(two_sources_client):
    client = two_sources_client
    catalog = Catalog(client)
    dose, grams = catalog.attribute("Dose", "Dose"), catalog.attribute("Protein", "g", 1)
    mapping_error(map_to(client, "DOSE", grams, "other"), "unit_mismatch")
    assert map_to(client, "DOSE", dose, "other").status_code == 200
    assert stored(client, "DOSE", "other") == dose


def test_a_column_without_a_unit_maps_to_nothing(database_url, web_dist, tmp_path):
    columns = [{"key": "X", "name": "No unit", "unit": ""}]
    directory = tmp_path / "bare"
    write(directory, test_source(columns=columns, foods=[]))
    with logged_in_client(database_url, web_dist, data_sources_dir=directory) as client:
        catalog = Catalog(client)
        for unit in ("g", ""):
            attribute = catalog.attribute(f"A{unit}", unit)
            mapping_error(map_to(client, "X", attribute), "unit_mismatch")
        assert stored(client, "X") is None


def test_an_attribute_feeds_one_column_of_a_source(data_client):
    protein = Catalog(data_client).attribute("Protein", "g", 1)
    assert map_to(data_client, "PROT", protein).status_code == 200

    message = mapping_error(map_to(data_client, "VITD", protein), "attribute_taken")  # µg converts with g
    assert message == "Protein is already mapped from TEST Protein."
    assert stored(data_client, "VITD") is None
    assert map_to(data_client, "PROT", protein).status_code == 200  # again: no change

    assert map_to(data_client, "PROT", None).status_code == 200
    assert stored(data_client) is None
    assert map_to(data_client, "VITD", protein).status_code == 200


def test_a_withdrawn_column_still_holds_its_attribute_and_can_be_changed(data_client):
    catalog = Catalog(data_client)
    protein, fat = catalog.attribute("Protein", "g", 1), catalog.attribute("Fat", "g", 1)
    assert map_to(data_client, "PROT", protein).status_code == 200
    withdraw(data_client.app, models.SourceColumn, "PROT")

    mapping_error(map_to(data_client, "VITD", protein), "attribute_taken")
    assert data_client.get("/api/data-sources").json()[0]["mapped_count"] == 0  # not counted
    assert map_to(data_client, "PROT", fat).status_code == 200  # re-map
    assert map_to(data_client, "VITD", protein).status_code == 200  # now free
    assert map_to(data_client, "PROT", None).status_code == 200  # unmap


def test_two_sources_may_map_the_same_attribute(two_sources_client):
    protein = Catalog(two_sources_client).attribute("Protein", "g", 1)
    assert map_to(two_sources_client, "PROT", protein).status_code == 200
    assert map_to(two_sources_client, "PROT", protein, "other").status_code == 200


def test_a_bad_mapping_request_is_refused_and_changes_nothing(data_client):
    protein = Catalog(data_client).attribute("Protein", "g", 1)
    assert map_to(data_client, "PROT", protein).status_code == 200
    column = columns_of(data_client)["PROT"]["id"]

    for body in ({}, {"attribute_id": protein, "extra": 1}, {"attribute_id": "x"}):
        assert put_mapping(data_client, "testsource", column, body).status_code == 422
    assert mapping_error(map_to(data_client, "PROT", 99999), "unknown_attribute") == "No such attribute"
    assert stored(data_client) == protein


def test_the_unique_constraint_answers_a_racing_double_mapping(data_client, monkeypatch):
    from server.api import data_sources

    protein = Catalog(data_client).attribute("Protein", "g", 1)
    assert map_to(data_client, "PROT", protein).status_code == 200
    # The holder is not seen by the check, as when two requests race; the
    # constraint is what refuses the commit.
    real = data_sources._taken
    calls = []

    def blind_first(db, column, attribute):
        calls.append(1)
        return None if len(calls) == 1 else real(db, column, attribute)

    monkeypatch.setattr(data_sources, "_taken", blind_first)
    message = mapping_error(map_to(data_client, "VITD", protein), "attribute_taken")
    assert message == "Protein is already mapped from TEST Protein."
    assert stored(data_client, "VITD") is None
