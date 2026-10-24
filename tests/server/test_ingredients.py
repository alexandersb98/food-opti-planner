import pytest


def attribute(client, name="Energy", unit="kcal"):
    response = client.post("/api/attributes", json={"name": name, "unit": unit, "decimals": 0})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def tag(client, name="vegan"):
    response = client.post("/api/tags", json={"name": name, "derive": "all"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


OATS = {"name": "Oats", "unit": "g", "basis": "100", "values": [], "tag_ids": []}


def create(client, **fields):
    response = client.post("/api/ingredients", json={**OATS, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_list_starts_empty(client):
    response = client.get("/api/ingredients")
    assert response.status_code == 200
    assert response.json() == []


def test_a_created_ingredient_is_listed_with_its_values_tags_and_recipe_count(client):
    energy, protein = attribute(client), attribute(client, "Protein", "g")
    vegan = tag(client)
    created = create(
        client,
        values=[{"attribute_id": energy, "value": "389"}, {"attribute_id": protein, "value": "16.9"}],
        tag_ids=[vegan],
    )
    assert created == {
        "id": created["id"],
        "name": "Oats",
        "unit": "g",
        "basis": "100",
        "values": [{"attribute_id": energy, "value": "389"}, {"attribute_id": protein, "value": "16.9"}],
        "tag_ids": [vegan],
        "recipe_count": 0,
    }
    assert client.get("/api/ingredients").json() == [created]
    assert client.get(f"/api/ingredients/{created['id']}").json() == created


@pytest.mark.parametrize(
    ("typed", "answered"),
    [
        ("0.1", "0.1"),
        ("16.9", "16.9"),
        ("100", "100"),
        ("0.000001", "0.000001"),
        ("999999999.999999", "999999999.999999"),
        ("-2.5", "-2.5"),
        ("0", "0"),
        ("1.50", "1.5"),
        ("-0", "0"),
    ],
)
def test_values_read_back_exactly_as_typed(client, typed, answered):
    energy = attribute(client)
    created = create(client, values=[{"attribute_id": energy, "value": typed}])
    stored = client.get(f"/api/ingredients/{created['id']}").json()
    assert stored["values"][0]["value"] == answered


@pytest.mark.parametrize("typed", ["0.000001", "1", "2.5", "100", "999999999.999999"])
def test_the_basis_reads_back_exactly_as_typed(client, typed):
    created = create(client, basis=typed)
    assert client.get(f"/api/ingredients/{created['id']}").json()["basis"] == typed


def test_numbers_may_be_sent_as_json_numbers(client):
    energy = attribute(client)
    created = create(client, basis=100, values=[{"attribute_id": energy, "value": 0.1}])
    assert (created["basis"], created["values"][0]["value"]) == ("100", "0.1")


def test_values_and_tags_are_answered_in_attribute_and_tag_order(client):
    a, b = attribute(client), attribute(client, "Protein")
    x, y = tag(client), tag(client, "quick")
    created = create(
        client,
        values=[{"attribute_id": b, "value": "2"}, {"attribute_id": a, "value": "1"}],
        tag_ids=[y, x, y],
    )
    assert [v["attribute_id"] for v in created["values"]] == [a, b]
    assert created["tag_ids"] == [x, y]


def test_the_list_is_in_the_order_ingredients_were_added(client):
    for name in ("Oats", "Apple", "Milk"):
        create(client, name=name)
    assert [i["name"] for i in client.get("/api/ingredients").json()] == ["Oats", "Apple", "Milk"]


def test_the_name_and_unit_are_trimmed(client):
    created = create(client, name="  Rolled oats ", unit=" g ")
    assert (created["name"], created["unit"]) == ("Rolled oats", "g")


@pytest.mark.parametrize(
    "fields",
    [
        {"name": ""},
        {"name": "x" * 101},
        {"unit": ""},
        {"unit": "  "},
        {"unit": "x" * 21},
        {"basis": "0"},
        {"basis": "-100"},
        {"basis": "abc"},
        {"basis": "NaN"},
        {"basis": "Infinity"},
        {"basis": "0.0000001"},
        {"basis": "1000000000"},
        {"basis": None},
        {"values": [{"attribute_id": 1, "value": "1.0000001"}]},
        {"values": [{"attribute_id": 1, "value": ""}]},
        {"values": [{"attribute_id": 1, "value": None}]},
    ],
)
def test_invalid_fields_answer_422(client, fields):
    attribute(client)
    response = client.post("/api/ingredients", json={**OATS, **fields})
    assert response.status_code == 422
    assert client.get("/api/ingredients").json() == []


def test_an_unknown_attribute_or_tag_answers_422_on_its_field(client):
    energy = attribute(client)
    response = client.post(
        "/api/ingredients",
        json={
            **OATS,
            "values": [{"attribute_id": energy, "value": "1"}, {"attribute_id": 999, "value": "2"}],
            "tag_ids": [999],
        },
    )
    assert response.status_code == 422
    errors = {tuple(e["loc"]): e["type"] for e in response.json()["detail"]}
    assert errors == {
        ("body", "values", 1, "attribute_id"): "unknown_attribute",
        ("body", "tag_ids", 0): "unknown_tag",
    }
    assert client.get("/api/ingredients").json() == []


def test_two_values_for_one_attribute_answer_422(client):
    energy = attribute(client)
    response = client.post(
        "/api/ingredients",
        json={
            **OATS,
            "values": [{"attribute_id": energy, "value": "1"}, {"attribute_id": energy, "value": "2"}],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "values", 1, "attribute_id"]


def test_creating_a_name_in_use_answers_409_with_a_field_error(client):
    create(client)
    response = client.post("/api/ingredients", json={**OATS, "unit": "pcs"})
    assert response.status_code == 409
    assert response.json() == {
        "detail": [
            {
                "loc": ["body", "name"],
                "type": "name_in_use",
                "msg": "An ingredient with this name already exists",
            }
        ]
    }
    assert len(client.get("/api/ingredients").json()) == 1


def test_update_changes_every_field(client):
    energy, protein, fat = attribute(client), attribute(client, "Protein"), attribute(client, "Fat")
    vegan, quick = tag(client), tag(client, "quick")
    oats = create(
        client,
        values=[{"attribute_id": energy, "value": "389"}, {"attribute_id": protein, "value": "16.9"}],
        tag_ids=[vegan],
    )
    changes = {
        "name": "Egg",
        "unit": "pcs",
        "basis": "1",
        "values": [{"attribute_id": protein, "value": "6.3"}, {"attribute_id": fat, "value": "4.8"}],
        "tag_ids": [quick],
    }
    response = client.put(f"/api/ingredients/{oats['id']}", json=changes)
    assert response.status_code == 200, response.text
    assert response.json() == {**oats, **changes}
    assert client.get("/api/ingredients").json() == [response.json()]


def test_update_can_clear_values_and_tags(client):
    energy, vegan = attribute(client), tag(client)
    oats = create(client, values=[{"attribute_id": energy, "value": "389"}], tag_ids=[vegan])
    response = client.put(f"/api/ingredients/{oats['id']}", json=OATS)
    assert (response.json()["values"], response.json()["tag_ids"]) == ([], [])


def test_renaming_to_a_name_in_use_answers_409_and_changes_nothing(client):
    create(client)
    milk = create(client, name="Milk", unit="ml")
    response = client.put(f"/api/ingredients/{milk['id']}", json={**OATS, "unit": "ml"})
    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "name"]
    assert client.get("/api/ingredients").json()[1] == milk


def test_update_checks_attributes_like_create(client):
    oats = create(client)
    response = client.put(f"/api/ingredients/{oats['id']}", json={**OATS, "tag_ids": [999]})
    assert response.status_code == 422
    assert client.get(f"/api/ingredients/{oats['id']}").json() == oats


def test_delete_removes_the_ingredient_and_its_values_and_tags(client):
    energy, vegan = attribute(client), tag(client)
    oats = create(client, values=[{"attribute_id": energy, "value": "389"}], tag_ids=[vegan])
    milk = create(client, name="Milk")
    assert client.delete(f"/api/ingredients/{oats['id']}").status_code == 204
    assert client.get("/api/ingredients").json() == [milk]
    assert client.get("/api/attributes").json()[0]["ingredient_count"] == 0
    assert client.get("/api/tags").json()[0]["ingredient_count"] == 0


def test_a_deleted_name_can_be_used_again(client):
    oats = create(client)
    client.delete(f"/api/ingredients/{oats['id']}")
    create(client)


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_an_unknown_ingredient_answers_404(client, method):
    response = client.request(method, "/api/ingredients/12345", json=OATS)
    assert response.status_code == 404


def test_counts_for_the_menu(client):
    assert client.get("/api/counts").json()["ingredients"] == 0
    create(client)
    create(client, name="Milk")
    assert client.get("/api/counts").json() == {"ingredients": 2, "attributes": 0, "tags": 0}


# Deleting an attribute or a tag cascades to ingredients, after a warning.


def test_an_attribute_counts_the_ingredients_with_a_value_for_it(client):
    energy, protein = attribute(client), attribute(client, "Protein")
    create(
        client, values=[{"attribute_id": energy, "value": "389"}, {"attribute_id": protein, "value": "0"}]
    )
    create(client, name="Milk", values=[{"attribute_id": energy, "value": "64"}])
    create(client, name="Salt")
    counts = {a["name"]: a["ingredient_count"] for a in client.get("/api/attributes").json()}
    assert counts == {"Energy": 2, "Protein": 1}
    renamed = client.put(f"/api/attributes/{energy}", json={"name": "Kcal", "unit": "kcal", "decimals": 0})
    assert renamed.json()["ingredient_count"] == 2


def test_deleting_an_attribute_removes_its_ingredient_values(client):
    energy, protein = attribute(client), attribute(client, "Protein")
    oats = create(
        client, values=[{"attribute_id": energy, "value": "389"}, {"attribute_id": protein, "value": "16.9"}]
    )
    assert client.delete(f"/api/attributes/{energy}").status_code == 204
    stored = client.get(f"/api/ingredients/{oats['id']}").json()
    assert stored["values"] == [{"attribute_id": protein, "value": "16.9"}]


def test_a_tag_counts_the_ingredients_that_have_it(client):
    vegan, quick = tag(client), tag(client, "quick")
    tag(client, "organic")
    create(client, tag_ids=[vegan, quick])
    create(client, name="Milk", tag_ids=[quick])
    counts = {t["name"]: t["ingredient_count"] for t in client.get("/api/tags").json()}
    assert counts == {"vegan": 1, "quick": 2, "organic": 0}
    renamed = client.put(f"/api/tags/{quick}", json={"name": "fast", "derive": "any"})
    assert renamed.json()["ingredient_count"] == 2


def test_deleting_a_tag_removes_it_from_ingredients(client):
    vegan, quick = tag(client), tag(client, "quick")
    oats = create(client, tag_ids=[vegan, quick])
    assert client.delete(f"/api/tags/{vegan}").status_code == 204
    assert client.get(f"/api/ingredients/{oats['id']}").json()["tag_ids"] == [quick]
