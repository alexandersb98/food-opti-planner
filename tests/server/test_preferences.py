import pytest

from .conftest import logged_in_client

DEFAULTS = {"unit.mass": "g", "unit.volume": "dl", "unit.energy": "kcal", "last_data_source": None}


def put(client, body):
    return client.put("/api/preferences", json=body)


def test_routes_need_a_session(anonymous_client):
    assert anonymous_client.get("/api/preferences").status_code == 401
    assert anonymous_client.put("/api/preferences", json={}).status_code == 401


def test_a_fresh_database_answers_the_defaults(client):
    assert client.get("/api/preferences").json() == DEFAULTS


def test_put_one_key_answers_all_and_a_get_agrees(client):
    response = put(client, {"unit.mass": "kg"})
    assert response.status_code == 200
    assert response.json() == {**DEFAULTS, "unit.mass": "kg"}
    assert client.get("/api/preferences").json() == response.json()


def test_put_two_keys(client):
    answer = put(client, {"unit.volume": "msk", "unit.energy": "kJ"}).json()
    assert answer == {**DEFAULTS, "unit.volume": "msk", "unit.energy": "kJ"}


def test_empty_put_changes_nothing(client):
    put(client, {"unit.mass": "oz"})
    assert put(client, {}).json() == {**DEFAULTS, "unit.mass": "oz"}


def test_an_alias_is_saved_as_the_catalogue_spelling(client):
    assert put(client, {"unit.mass": "gram"}).json()["unit.mass"] == "g"
    assert put(client, {"unit.volume": "matsked"}).json()["unit.volume"] == "msk"
    assert client.get("/api/preferences").json()["unit.volume"] == "msk"


@pytest.mark.parametrize(
    ("key", "value"),
    [("unit.mass", "dl"), ("unit.volume", "g"), ("unit.energy", "g"), ("unit.mass", "st"),
     ("unit.mass", "cup"), ("unit.mass", "cg"), ("unit.mass", ""), ("unit.mass", None)],
)
def test_a_unit_that_is_not_offered_for_the_key_is_refused(client, key, value):
    response = put(client, {key: value})
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", key], "invalid_unit")
    assert client.get("/api/preferences").json() == DEFAULTS


def test_a_refusal_saves_nothing_even_for_a_valid_key(client):
    response = put(client, {"unit.volume": "msk", "unit.mass": "dl"})
    assert response.status_code == 422
    assert client.get("/api/preferences").json() == DEFAULTS


def test_an_unknown_key_is_refused(client):
    response = put(client, {"unit.length": "m"})
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "unit.length"], "extra_forbidden")


def test_a_python_style_field_name_is_refused(client):
    response = put(client, {"unit_mass": "kg"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "extra_forbidden"
    assert client.get("/api/preferences").json() == DEFAULTS


def test_a_number_is_refused(client):
    assert put(client, {"unit.mass": 5}).status_code == 422


def test_preferences_survive_a_restart(client, database_url, web_dist):
    put(client, {"unit.energy": "kJ"})
    with logged_in_client(database_url, web_dist) as again:
        assert again.get("/api/preferences").json()["unit.energy"] == "kJ"


def test_last_data_source_is_saved_read_back_and_survives_a_unit_change(data_client):
    assert data_client.get("/api/preferences").json()["last_data_source"] is None
    answer = put(data_client, {"last_data_source": "testsource"})
    assert answer.status_code == 200
    assert answer.json() == {**DEFAULTS, "last_data_source": "testsource"}
    assert put(data_client, {"unit.mass": "kg"}).json()["last_data_source"] == "testsource"
    assert data_client.get("/api/preferences").json() == {
        **DEFAULTS, "unit.mass": "kg", "last_data_source": "testsource"
    }


@pytest.mark.parametrize("value", ["nope", None])
def test_a_last_data_source_that_names_no_source_is_refused(data_client, value):
    response = put(data_client, {"last_data_source": value})
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "last_data_source"], "invalid_data_source")
    assert data_client.get("/api/preferences").json() == DEFAULTS


def test_a_number_is_not_a_last_data_source(data_client):
    assert put(data_client, {"last_data_source": 5}).status_code == 422
    assert data_client.get("/api/preferences").json() == DEFAULTS


def test_a_refused_source_saves_nothing_with_a_valid_unit(data_client):
    assert put(data_client, {"unit.mass": "kg", "last_data_source": "nope"}).status_code == 422
    assert data_client.get("/api/preferences").json() == DEFAULTS
