import pytest

from meal_planner.domain import MAX_PRECISION, MIN_PRECISION

PROTEIN = {"name": "Protein", "unit": "g", "decimals": 1}


def create(client, **fields):
    response = client.post("/api/attributes", json={**PROTEIN, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_list_starts_empty(client):
    response = client.get("/api/attributes")
    assert response.status_code == 200
    assert response.json() == []


def test_a_created_attribute_is_listed_with_what_deleting_it_removes(client):
    created = create(client)
    assert created == {
        "id": created["id"],
        "name": "Protein",
        "unit": "g",
        "decimals": 1,
        "ingredient_count": 0,
        "goal_count": 0,
    }
    assert client.get("/api/attributes").json() == [created]


def test_the_list_is_in_the_order_attributes_were_added(client):
    for name in ("Energy", "Cost", "Carbs"):
        create(client, name=name)
    assert [a["name"] for a in client.get("/api/attributes").json()] == ["Energy", "Cost", "Carbs"]


def test_name_and_unit_are_trimmed_and_the_unit_may_be_empty(client):
    created = create(client, name="  Fibre ", unit="  ")
    assert (created["name"], created["unit"]) == ("Fibre", "")


@pytest.mark.parametrize(
    "fields",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 101},
        {"unit": "x" * 21},
        {"decimals": MIN_PRECISION - 1},
        {"decimals": MAX_PRECISION + 1},
        {"decimals": 1.5},
    ],
)
def test_invalid_fields_answer_422(client, fields):
    response = client.post("/api/attributes", json={**PROTEIN, **fields})
    assert response.status_code == 422
    assert client.get("/api/attributes").json() == []


def test_decimals_cover_the_library_range(client):
    assert create(client, name="a", decimals=MIN_PRECISION)["decimals"] == MIN_PRECISION
    assert create(client, name="b", decimals=MAX_PRECISION)["decimals"] == MAX_PRECISION


def test_creating_a_name_in_use_answers_409_with_a_field_error(client):
    create(client)
    response = client.post("/api/attributes", json={**PROTEIN, "unit": "mg"})
    assert response.status_code == 409
    assert response.json() == {
        "detail": [
            {
                "loc": ["body", "name"],
                "type": "name_in_use",
                "msg": "An attribute with this name already exists",
            }
        ]
    }
    assert len(client.get("/api/attributes").json()) == 1


def test_names_differing_only_in_case_are_different_names(client):
    """As in the library, which compares names exactly."""
    create(client)
    create(client, name="protein")


def test_update_changes_every_field(client):
    attribute = create(client)
    response = client.put(
        f"/api/attributes/{attribute['id']}", json={"name": "Energy", "unit": "kcal", "decimals": 0}
    )
    assert response.status_code == 200
    assert response.json() == {**attribute, "name": "Energy", "unit": "kcal", "decimals": 0}
    assert client.get("/api/attributes").json() == [response.json()]


def test_update_may_keep_the_name(client):
    attribute = create(client)
    response = client.put(f"/api/attributes/{attribute['id']}", json={**PROTEIN, "decimals": 2})
    assert response.status_code == 200
    assert response.json()["decimals"] == 2


def test_renaming_to_a_name_in_use_answers_409_and_changes_nothing(client):
    create(client)
    fat = create(client, name="Fat")
    response = client.put(f"/api/attributes/{fat['id']}", json={**PROTEIN, "decimals": 3})
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert [a["name"] for a in client.get("/api/attributes").json()] == ["Protein", "Fat"]
    assert client.get("/api/attributes").json()[1] == fat


def test_update_validates_like_create(client):
    attribute = create(client)
    response = client.put(f"/api/attributes/{attribute['id']}", json={**PROTEIN, "name": ""})
    assert response.status_code == 422


def test_delete_removes_the_attribute(client):
    protein = create(client)
    fat = create(client, name="Fat")
    assert client.delete(f"/api/attributes/{protein['id']}").status_code == 204
    assert client.get("/api/attributes").json() == [fat]


def test_a_deleted_name_can_be_used_again(client):
    attribute = create(client)
    client.delete(f"/api/attributes/{attribute['id']}")
    create(client)


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_an_unknown_attribute_answers_404(client, method):
    response = client.request(method, "/api/attributes/12345", json=PROTEIN)
    assert response.status_code == 404


def test_counts_for_the_menu(client):
    assert client.get("/api/counts").json()["attributes"] == 0
    create(client)
    create(client, name="Fat")
    assert client.get("/api/counts").json()["attributes"] == 2
