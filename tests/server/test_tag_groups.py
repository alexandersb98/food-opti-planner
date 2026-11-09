"""Tag groups through the API: what a change to a tag's equivalent tags does,
and the questions it raises (409 with `questions`)."""

from .conftest import Catalog


def tags(client) -> dict[str, dict]:
    """The tags by name, after checking the invariant: the members of a group
    share one rule and every group has two tags or more."""
    result = {t["name"]: t for t in client.get("/api/tags").json()}
    by_id = {t["id"]: t for t in result.values()}
    for tag in result.values():
        if tag["group"]:
            assert len(tag["group"]) >= 2 and tag["id"] in tag["group"]
            assert {by_id[i]["derive"] for i in tag["group"]} == {tag["derive"]}
            assert all(by_id[i]["group"] == tag["group"] for i in tag["group"])
    return result


def put(client, called, **fields):
    """PUT the tag called `called` (as listed) with `fields` over its own."""
    current = tags(client)[called]
    body = {"name": called, "derive": current["derive"], **fields}
    return client.put(f"/api/tags/{current['id']}", json=body)


def make(catalog, *names, derive="any") -> list[int]:
    return [catalog.tag(name, derive) for name in names]


def test_adding_a_free_tag_makes_a_group_of_two(client, catalog):
    fish, seafood = make(catalog, "Fish", "Seafood")
    response = put(client, "Fish", equivalent_tag_ids=[seafood])
    assert response.status_code == 200
    assert response.json()["group"] == [fish, seafood]
    assert tags(client)["Seafood"]["group"] == [fish, seafood]


def test_adding_a_second_free_tag_makes_three(client, catalog):
    fish, seafood, fisk = make(catalog, "Fish", "Seafood", "Fisk")
    catalog.group(fish, seafood)
    assert put(client, "Fish", equivalent_tag_ids=[seafood, fisk]).status_code == 200
    assert {t["name"]: t["group"] for t in tags(client).values()} == {n: [fish, seafood, fisk] for n in ("Fish", "Seafood", "Fisk")}


def test_a_tag_in_another_group_moves_after_a_question(client, catalog):
    fish, seafood, fisk, meat, beef = make(catalog, "Fish", "Seafood", "Fisk", "Meat", "Beef")
    catalog.group(seafood, fisk, meat)
    catalog.group(fish, beef)
    before = tags(client)

    response = put(client, "Fish", equivalent_tag_ids=[beef, seafood])

    assert response.status_code == 409
    assert response.json() == {"questions": [{"type": "move_tag", "tag_id": seafood, "from_tag_ids": [fisk, meat]}]}
    assert tags(client) == before

    response = put(client, "Fish", equivalent_tag_ids=[beef, seafood], confirm=True)
    assert response.status_code == 200
    after = tags(client)
    assert after["Fish"]["group"] == [fish, seafood, beef]
    assert after["Fisk"]["group"] == [fisk, meat]


def test_moving_a_tag_out_of_a_group_of_two_dissolves_it(client, catalog):
    fish, seafood, beef = make(catalog, "Fish", "Seafood", "Beef")
    catalog.group(seafood, beef)
    put(client, "Fish", equivalent_tag_ids=[seafood], confirm=True)
    after = tags(client)
    assert after["Beef"]["group"] == []
    assert after["Fish"]["group"] == [fish, seafood]


def test_adding_a_tag_with_another_rule_asks_to_switch_it(client, catalog):
    fish = catalog.tag("Fish", "all")
    seafood = catalog.tag("Seafood", "any")
    response = put(client, "Fish", equivalent_tag_ids=[seafood])
    assert response.status_code == 409
    assert response.json() == {
        "questions": [{"type": "switch_rule", "tag_id": seafood, "tag_rule": "any", "group_rule": "all"}]
    }
    assert tags(client)["Seafood"]["group"] == []
    put(client, "Fish", equivalent_tag_ids=[seafood], confirm=True)
    after = tags(client)
    assert (after["Seafood"]["derive"], after["Fish"]["derive"]) == ("all", "all")
    assert after["Fish"]["group"] == [fish, seafood]


def test_the_final_rule_is_the_bodys(client, catalog):
    fish = catalog.tag("Fish", "all")
    seafood = catalog.tag("Seafood", "any")
    response = put(client, "Fish", derive="any", equivalent_tag_ids=[seafood])
    assert response.status_code == 200
    after = tags(client)
    assert (after["Fish"]["derive"], after["Seafood"]["derive"]) == ("any", "any")
    assert after["Fish"]["group"] == [fish, seafood]


def test_changing_the_rule_of_a_grouped_tag_asks_to_change_the_group(client, catalog):
    fish, seafood, fisk = make(catalog, "Fish", "Seafood", "Fisk")
    catalog.group(fish, seafood, fisk)
    response = put(client, "Seafood", derive="all")
    assert response.status_code == 409
    assert response.json() == {"questions": [{"type": "change_rule", "tag_ids": [fish, seafood, fisk], "rule": "all"}]}
    assert {t["derive"] for t in tags(client).values()} == {"any"}
    assert put(client, "Seafood", derive="all", confirm=True).status_code == 200
    assert {t["derive"] for t in tags(client).values()} == {"all"}


def test_changing_the_rule_asks_nothing_when_every_other_member_leaves(client, catalog):
    fish, seafood, fisk = make(catalog, "Fish", "Seafood", "Fisk")
    catalog.group(fish, seafood, fisk)
    response = put(client, "Fish", derive="all", equivalent_tag_ids=[])
    assert response.status_code == 200
    after = tags(client)
    assert after["Fish"]["derive"] == "all" and after["Fish"]["group"] == []
    assert after["Seafood"]["derive"] == "any" and after["Seafood"]["group"] == []


def test_a_request_lists_every_question_in_the_order_move_switch_change(client, catalog):
    fish, seafood, fisk, meat, beef = make(catalog, "Fish", "Seafood", "Fisk", "Meat", "Beef")
    catalog.group(fish, seafood)
    catalog.group(meat, beef)
    all_tag = catalog.tag("Salt", "all")
    response = put(client, "Fish", derive="all", equivalent_tag_ids=[seafood, meat, all_tag])
    assert response.status_code == 409
    assert response.json()["questions"] == [
        {"type": "move_tag", "tag_id": meat, "from_tag_ids": [beef]},
        {"type": "switch_rule", "tag_id": meat, "tag_rule": "any", "group_rule": "all"},
        {"type": "change_rule", "tag_ids": [fish, seafood], "rule": "all"},
    ]


def test_removing_a_chip_takes_out_only_that_tag(client, catalog):
    fish, seafood, fisk = make(catalog, "Fish", "Seafood", "Fisk")
    catalog.group(fish, seafood, fisk)
    assert put(client, "Fish", equivalent_tag_ids=[seafood]).status_code == 200
    after = tags(client)
    assert after["Fisk"]["group"] == []
    assert after["Fish"]["group"] == [fish, seafood]


def test_removing_the_last_other_member_dissolves_the_group(client, catalog):
    fish, seafood = make(catalog, "Fish", "Seafood")
    catalog.group(fish, seafood)
    assert put(client, "Fish", equivalent_tag_ids=[]).status_code == 200
    assert [t["group"] for t in tags(client).values()] == [[], []]


def test_an_added_tag_is_compared_with_the_new_rule(client, catalog):
    fish = catalog.tag("Fish", "any")
    seafood = catalog.tag("Seafood", "all")
    response = put(client, "Fish", derive="all", equivalent_tag_ids=[seafood])
    assert response.status_code == 200
    assert tags(client)["Fish"]["group"] == [fish, seafood]


def test_a_source_tag_can_be_grouped_and_its_rule_changes_after_a_question(data_client):
    catalog = Catalog(data_client)
    grains = tags(data_client)["TEST Grains"]["id"]
    bread = catalog.tag("Bread", "any")
    assert put(data_client, "Bread", equivalent_tag_ids=[grains]).status_code == 200
    response = put(data_client, "TEST Grains", derive="all")
    assert response.status_code == 409
    assert response.json()["questions"][0]["type"] == "change_rule"
    assert put(data_client, "TEST Grains", derive="all", confirm=True).status_code == 200
    assert tags(data_client)["Bread"]["derive"] == "all"
    rename = put(data_client, "TEST Grains", name="Cereal", derive="all", equivalent_tag_ids=[bread])
    assert rename.status_code == 422
    assert rename.json()["detail"][0]["type"] == "source_tag"


def test_a_name_clash_changes_no_group(client, catalog):
    fish, seafood = make(catalog, "Fish", "Seafood")
    before = tags(client)
    response = put(client, "Fish", name="Seafood", equivalent_tag_ids=[seafood])
    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "name_in_use"
    assert tags(client) == before


def test_deleting_a_tag_takes_it_out_of_its_group_first(client, catalog):
    fish, seafood, fisk = make(catalog, "Fish", "Seafood", "Fisk")
    catalog.group(fish, seafood, fisk)
    assert client.delete(f"/api/tags/{fisk}").status_code == 204
    assert tags(client)["Fish"]["group"] == [fish, seafood]
    assert client.delete(f"/api/tags/{seafood}").status_code == 204
    assert tags(client)["Fish"]["group"] == []
