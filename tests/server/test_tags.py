from typing import get_args

import pytest

from meal_planner.domain import DERIVE_RULES
from server.api.tags import DeriveRule

VEGAN = {"name": "vegan", "derive": "all"}


def create(client, **fields):
    response = client.post("/api/tags", json={**VEGAN, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_derive_rules_are_the_library_rules():
    assert get_args(DeriveRule) == DERIVE_RULES


def test_the_list_starts_empty(client):
    response = client.get("/api/tags")
    assert response.status_code == 200
    assert response.json() == []


def test_a_created_tag_is_listed_with_what_deleting_it_removes(client):
    created = create(client)
    assert created == {
        "id": created["id"],
        "name": "vegan",
        "derive": "all",
        "ingredient_count": 0,
        "recipe_count": 0,
        "filter_count": 0,
    }
    assert client.get("/api/tags").json() == [created]


@pytest.mark.parametrize("derive", DERIVE_RULES)
def test_the_derive_rule_round_trips(client, derive):
    created = create(client, derive=derive)
    assert created["derive"] == derive
    assert client.get("/api/tags").json()[0]["derive"] == derive


def test_the_list_is_in_the_order_tags_were_added(client):
    for name in ("vegan", "contains-nuts", "quick"):
        create(client, name=name)
    assert [t["name"] for t in client.get("/api/tags").json()] == ["vegan", "contains-nuts", "quick"]


def test_the_name_is_trimmed(client):
    assert create(client, name="  organic ")["name"] == "organic"


@pytest.mark.parametrize(
    "fields",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 101},
        {"derive": "some"},
        {"derive": "ALL"},
        {"derive": None},
    ],
)
def test_invalid_fields_answer_422(client, fields):
    response = client.post("/api/tags", json={**VEGAN, **fields})
    assert response.status_code == 422
    assert client.get("/api/tags").json() == []


def test_creating_a_name_in_use_answers_409_with_a_field_error(client):
    create(client)
    response = client.post("/api/tags", json={**VEGAN, "derive": "any"})
    assert response.status_code == 409
    assert response.json() == {
        "detail": [
            {
                "loc": ["body", "name"],
                "type": "name_in_use",
                "msg": "A tag with this name already exists",
            }
        ]
    }
    assert len(client.get("/api/tags").json()) == 1


def test_names_differing_only_in_case_are_different_names(client):
    """As in the library, which compares names exactly."""
    create(client)
    create(client, name="Vegan")


def test_a_tag_and_an_attribute_may_share_a_name(client):
    create(client, name="organic")
    response = client.post("/api/attributes", json={"name": "organic", "unit": "", "decimals": 0})
    assert response.status_code == 201


def test_update_changes_every_field(client):
    tag = create(client)
    response = client.put(f"/api/tags/{tag['id']}", json={"name": "contains-nuts", "derive": "any"})
    assert response.status_code == 200
    assert response.json() == {**tag, "name": "contains-nuts", "derive": "any"}
    assert client.get("/api/tags").json() == [response.json()]


def test_update_may_keep_the_name(client):
    tag = create(client)
    response = client.put(f"/api/tags/{tag['id']}", json={**VEGAN, "derive": "any"})
    assert response.status_code == 200
    assert response.json()["derive"] == "any"


def test_renaming_to_a_name_in_use_answers_409_and_changes_nothing(client):
    create(client)
    nuts = create(client, name="contains-nuts", derive="any")
    response = client.put(f"/api/tags/{nuts['id']}", json=VEGAN)
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert client.get("/api/tags").json()[1] == nuts


def test_update_validates_like_create(client):
    tag = create(client)
    response = client.put(f"/api/tags/{tag['id']}", json={**VEGAN, "derive": "some"})
    assert response.status_code == 422


def test_delete_removes_the_tag(client):
    vegan = create(client)
    nuts = create(client, name="contains-nuts")
    assert client.delete(f"/api/tags/{vegan['id']}").status_code == 204
    assert client.get("/api/tags").json() == [nuts]


def test_a_deleted_name_can_be_used_again(client):
    tag = create(client)
    client.delete(f"/api/tags/{tag['id']}")
    create(client)


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_an_unknown_tag_answers_404(client, method):
    response = client.request(method, "/api/tags/12345", json=VEGAN)
    assert response.status_code == 404


def test_counts_for_the_menu(client):
    assert client.get("/api/counts").json() == {"attributes": 0, "tags": 0}
    create(client)
    create(client, name="quick")
    assert client.get("/api/counts").json() == {"attributes": 0, "tags": 2}
