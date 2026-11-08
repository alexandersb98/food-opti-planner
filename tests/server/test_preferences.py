import pytest

DEFAULTS = {"unit.mass": "g", "unit.volume": "dl", "unit.energy": "kcal"}


def put(client, body):
    return client.put("/api/preferences", json=body)


def test_unset_preferences_have_their_defaults(client):
    response = client.get("/api/preferences")
    assert response.status_code == 200
    assert response.json() == DEFAULTS


def test_a_put_changes_only_the_keys_it_sends(client):
    response = put(client, {"unit.volume": "ml"})
    assert response.status_code == 200
    assert response.json() == {**DEFAULTS, "unit.volume": "ml"}
    assert client.get("/api/preferences").json() == {**DEFAULTS, "unit.volume": "ml"}


def test_a_second_put_replaces_the_value(client):
    put(client, {"unit.mass": "kg"})
    put(client, {"unit.mass": "oz", "unit.energy": "kJ"})
    assert client.get("/api/preferences").json() == {"unit.mass": "oz", "unit.volume": "dl", "unit.energy": "kJ"}


def test_an_empty_put_changes_nothing(client):
    put(client, {"unit.mass": "kg"})
    assert put(client, {}).json() == {**DEFAULTS, "unit.mass": "kg"}


@pytest.mark.parametrize(("sent", "stored"), [("gram", "g"), (" KG ", "kg"), ("msk", "tbsp"), ("Cal", "kcal")])
def test_a_unit_is_stored_in_its_catalogue_spelling(client, sent, stored):
    key = {"g": "unit.mass", "kg": "unit.mass", "tbsp": "unit.volume", "kcal": "unit.energy"}[stored]
    assert put(client, {key: sent}).json()[key] == stored


@pytest.mark.parametrize(
    ("key", "unit"),
    [
        ("unit.mass", "dl"),  # another category
        ("unit.volume", "kcal"),
        ("unit.energy", "g"),
        ("unit.mass", "st"),  # a known free-text unit
        ("unit.mass", "piece"),
        ("unit.mass", "IU"),  # free text
        ("unit.mass", "cg"),  # understood but not offered
        ("unit.mass", ""),
    ],
)
def test_a_unit_not_offered_for_the_key_is_refused(client, key, unit):
    response = put(client, {key: unit})
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", key]
    assert error["type"] == "unit_not_offered"
    assert error["msg"].startswith("Must be one of: ")
    assert client.get("/api/preferences").json() == DEFAULTS


@pytest.mark.parametrize("value", [None, 5])
def test_a_key_sent_needs_a_unit(client, value):
    response = put(client, {"unit.mass": value})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "unit.mass"]


def test_an_unknown_key_is_refused(client):
    response = put(client, {"unit.length": "m", "unit.mass": "kg"})
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "unit.length"], "extra_forbidden")
    assert client.get("/api/preferences").json() == DEFAULTS


def test_the_python_field_name_is_not_a_key(client):
    response = put(client, {"unit_mass": "kg"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "extra_forbidden"


def test_a_refused_key_saves_none_of_the_others(client):
    assert put(client, {"unit.mass": "kg", "unit.volume": "g"}).status_code == 422
    assert client.get("/api/preferences").json() == DEFAULTS


def test_the_preferences_need_a_session(anonymous_client):
    assert anonymous_client.get("/api/preferences").status_code == 401
    assert anonymous_client.put("/api/preferences", json={}).status_code == 401
