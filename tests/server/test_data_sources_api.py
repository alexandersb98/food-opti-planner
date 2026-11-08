import pytest
from sqlalchemy import update
from sqlalchemy.orm import Session

from server import models

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
    assert "T" in row["imported_at"]
    assert set(row) == {"key", "name", "colour", "version", "imported_at", "food_count", "column_count"}


def test_the_detail_has_the_attribution_and_the_columns_by_name(data_client):
    source = data_client.get("/api/data-sources/testsource").json()

    assert source["attribution"] == "TEST data, not real: for tests only."
    assert [(c["key"], c["name"], c["unit"], c["withdrawn"]) for c in source["columns"]] == [
        ("ENERC:kcal", "TEST Energy", "kcal", False),
        ("PROT", "TEST Protein", "g", False),
        ("VITD", "TEST Vitamin D", "µg", False),
    ]
    assert isinstance(source["columns"][0]["id"], int)


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
