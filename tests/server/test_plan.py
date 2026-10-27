"""/api/plan: the plan setup (A1, A2), one plan made on first read."""

from datetime import date

import pytest


def read(client) -> dict:
    response = client.get("/api/plan")
    assert response.status_code == 200, response.text
    return response.json()


def put(client, **changes) -> dict:
    """Save the stored setup with `changes`, answering the saved setup."""
    response = client.put("/api/plan", json={**read(client), **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_the_first_read_creates_the_defaults(client):
    plan = read(client)
    meal_ids = [meal["id"] for meal in plan["meals"]]
    assert plan == {
        "start_date": date.today().isoformat(),
        "days": 7,
        "meals": [
            {"id": meal_ids[0], "name": "Breakfast"},
            {"id": meal_ids[1], "name": "Lunch"},
            {"id": meal_ids[2], "name": "Dinner"},
        ],
        "skips": [],
        "minimums": [],
        "goals": [],
        "tag_filters": [],
        "solve_time_limit": 30,
    }
    assert len(set(meal_ids)) == 3
    assert read(client) == plan


def test_saving_before_the_first_read_creates_the_plan(client):
    response = client.put("/api/plan", json={
        "start_date": "2026-11-02", "days": 2, "meals": [{"name": "Lunch"}],
        "skips": [], "minimums": [], "goals": [], "tag_filters": [], "solve_time_limit": 10,
    })
    assert response.status_code == 200, response.text
    assert read(client) == response.json()


def test_every_field_round_trips(client):
    breakfast, lunch, dinner = read(client)["meals"]
    saved = put(
        client,
        start_date="2026-11-02",
        days=3,
        meals=[breakfast, {"name": "Snack"}, dinner],
        skips=[{"day": 2, "meal": 1}, {"day": 0, "meal": 2}, {"day": 0, "meal": 0}],
        minimums=[{"day": 2, "at_least": 1}, {"day": 0, "at_least": 0}],
        solve_time_limit=120,
    )
    snack = saved["meals"][1]
    assert isinstance(snack["id"], int) and snack["id"] not in (breakfast["id"], lunch["id"], dinner["id"])
    assert saved == {
        "start_date": "2026-11-02",
        "days": 3,
        "meals": [breakfast, {"id": snack["id"], "name": "Snack"}, dinner],
        # By day, then meal.
        "skips": [{"day": 0, "meal": 0}, {"day": 0, "meal": 2}, {"day": 2, "meal": 1}],
        "minimums": [{"day": 0, "at_least": 0}, {"day": 2, "at_least": 1}],
        "goals": [],
        "tag_filters": [],
        "solve_time_limit": 120,
    }
    assert read(client) == saved


def test_meal_names_are_trimmed(client):
    saved = put(client, meals=[{"name": "  Brunch "}])
    assert saved["meals"][0]["name"] == "Brunch"


def test_reordering_and_renaming_meals_keeps_their_skipped_cells(client):
    breakfast, lunch, dinner = read(client)["meals"]
    put(client, skips=[{"day": 1, "meal": 0}, {"day": 3, "meal": 2}])
    # The editor sends each cell by its meal's new position.
    saved = put(
        client,
        meals=[{**dinner, "name": "Supper"}, lunch, breakfast],
        skips=[{"day": 1, "meal": 2}, {"day": 3, "meal": 0}],
    )
    assert saved["meals"] == [{"id": dinner["id"], "name": "Supper"}, lunch, breakfast]
    assert saved["skips"] == [{"day": 1, "meal": 2}, {"day": 3, "meal": 0}]
    assert read(client) == saved


def test_two_meals_can_swap_names(client):
    breakfast, lunch, dinner = read(client)["meals"]
    saved = put(client, meals=[{**breakfast, "name": "Lunch"}, {**lunch, "name": "Breakfast"}, dinner])
    assert [meal["name"] for meal in saved["meals"]] == ["Lunch", "Breakfast", "Dinner"]
    assert [meal["id"] for meal in saved["meals"]] == [breakfast["id"], lunch["id"], dinner["id"]]


def test_removing_a_meal_removes_its_cells(client):
    breakfast, lunch, dinner = read(client)["meals"]
    put(client, skips=[{"day": 0, "meal": 1}, {"day": 4, "meal": 2}])
    saved = put(client, meals=[breakfast, dinner], skips=[{"day": 4, "meal": 1}])
    assert saved["meals"] == [breakfast, dinner]
    assert saved["skips"] == [{"day": 4, "meal": 1}]
    # A new meal is a new row, without the removed one's cells.
    saved = put(client, meals=[breakfast, dinner, {"name": "Lunch"}], skips=saved["skips"])
    assert saved["meals"][2]["id"] != lunch["id"]
    assert saved["skips"] == [{"day": 4, "meal": 1}]


def test_cells_and_minimums_beyond_the_days_are_dropped(client):
    saved = put(
        client,
        days=3,
        skips=[{"day": 2, "meal": 0}, {"day": 3, "meal": 0}, {"day": 30, "meal": 1}],
        minimums=[{"day": 2, "at_least": 1}, {"day": 5, "at_least": 3}],
    )
    assert saved["skips"] == [{"day": 2, "meal": 0}]
    assert saved["minimums"] == [{"day": 2, "at_least": 1}]


def test_cells_and_minimums_beyond_the_days_are_not_checked(client):
    saved = put(
        client,
        days=3,
        skips=[{"day": 4, "meal": 7}, {"day": 4, "meal": 7}],
        minimums=[{"day": 5, "at_least": 8}, {"day": 5, "at_least": 1}],
    )
    assert (saved["skips"], saved["minimums"]) == ([], [])


def test_a_meal_given_twice_answers_422(client):
    breakfast = read(client)["meals"][0]
    response = client.put("/api/plan", json={**read(client), "meals": [breakfast, {**breakfast, "name": "Brunch"}]})
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(["body", "meals", 1, "id"], "duplicate")]


def test_the_limits_themselves_are_accepted(client):
    meals = [{"name": f"Meal {n}"} for n in range(8)]
    saved = put(client, days=31, meals=meals, solve_time_limit=300, minimums=[{"day": 30, "at_least": 8}])
    assert (saved["days"], len(saved["meals"]), saved["solve_time_limit"]) == (31, 8, 300)
    saved = put(
        client,
        days=1,
        meals=[{"name": "x" * 40}],
        solve_time_limit=1,
        skips=[{"day": 0, "meal": 0}],
        minimums=[{"day": 0, "at_least": 0}],
    )
    assert (saved["days"], saved["meals"][0]["name"], saved["solve_time_limit"]) == (1, "x" * 40, 1)


@pytest.mark.parametrize(
    ("changes", "loc"),
    [
        ({"days": 0}, ["days"]),
        ({"days": 32}, ["days"]),
        ({"meals": []}, ["meals"]),
        ({"meals": [{"name": f"Meal {n}"} for n in range(9)]}, ["meals"]),
        ({"meals": [{"name": ""}]}, ["meals", 0, "name"]),
        ({"meals": [{"name": "   "}]}, ["meals", 0, "name"]),
        ({"meals": [{"name": "x" * 41}]}, ["meals", 0, "name"]),
        ({"meals": [{"name": "Lunch"}, {"name": "Lunch"}]}, ["meals", 1, "name"]),
        ({"meals": [{"id": 12345, "name": "Lunch"}]}, ["meals", 0, "id"]),
        ({"minimums": [{"day": 0, "at_least": -1}]}, ["minimums", 0, "at_least"]),
        ({"minimums": [{"day": 0, "at_least": 4}]}, ["minimums", 0, "at_least"]),
        (
            {"skips": [{"day": 1, "meal": 0}, {"day": 1, "meal": 2}], "minimums": [{"day": 1, "at_least": 2}]},
            ["minimums", 0, "at_least"],
        ),
        ({"minimums": [{"day": -1, "at_least": 1}]}, ["minimums", 0, "day"]),
        ({"minimums": [{"day": 0, "at_least": 1}, {"day": 0, "at_least": 2}]}, ["minimums", 1, "day"]),
        ({"solve_time_limit": 0}, ["solve_time_limit"]),
        ({"solve_time_limit": 301}, ["solve_time_limit"]),
        ({"solve_time_limit": 1.5}, ["solve_time_limit"]),
        ({"skips": [{"day": -1, "meal": 0}]}, ["skips", 0, "day"]),
        ({"skips": [{"day": 31, "meal": 0}]}, ["skips", 0, "day"]),
        ({"skips": [{"day": 0, "meal": 3}]}, ["skips", 0, "meal"]),
        ({"skips": [{"day": 0, "meal": -1}]}, ["skips", 0, "meal"]),
        ({"skips": [{"day": 0, "meal": 1}, {"day": 0, "meal": 1}]}, ["skips", 1]),
        ({"start_date": "2026-02-30"}, ["start_date"]),
    ],
)
def test_invalid_fields_answer_422_on_their_field_and_change_nothing(client, changes, loc):
    before = read(client)
    response = client.put("/api/plan", json={**before, **changes})
    assert response.status_code == 422
    assert [e["loc"] for e in response.json()["detail"]] == [["body", *loc]]
    assert read(client) == before


def test_a_minimum_counts_the_planned_meals_after_cells_are_skipped(client):
    saved = put(client, skips=[{"day": 1, "meal": 0}], minimums=[{"day": 1, "at_least": 2}])
    assert saved["minimums"] == [{"day": 1, "at_least": 2}]


def goal(attribute_id, **changes) -> dict:
    """A goal as the editor sends it: Prefer 3, each day, at least 100."""
    return {
        "attribute_id": attribute_id, "min": "100", "max": None, "applies_to": "day",
        "must": False, "importance": 3, "zero_reference": None, **changes,
    }


def test_every_field_of_a_goal_round_trips(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein", "g", 1)
    saved = put(client, goals=[
        goal(energy, min=1800, max="2200", applies_to="daily_average", must=True, importance=5,
             custom_name="  Fuel ", day_guard_rail=True, guard_rail_importance=4),
        goal(protein, min="0", max="30.5", applies_to="plan_total", importance=1, zero_reference="25",
             importance_below=5, importance_above=2),
    ])
    first, second = saved["goals"]
    assert isinstance(first["id"], int) and first["id"] != second["id"]
    assert first == {
        "id": first["id"], "name": "Fuel", "custom_name": "Fuel", "attribute_id": energy, "min": "1800",
        "max": "2200", "applies_to": "daily_average", "must": True, "importance": 5, "zero_reference": None,
        "importance_below": None, "importance_above": None, "day_guard_rail": True, "guard_rail_importance": 4,
    }
    assert second == {
        "id": second["id"], "name": "Protein, plan total", "custom_name": None, "attribute_id": protein, "min": "0",
        "max": "30.5", "applies_to": "plan_total", "must": False, "importance": 1, "zero_reference": "25",
        "importance_below": 5, "importance_above": 2, "day_guard_rail": True, "guard_rail_importance": None,
    }
    assert read(client) == saved


def test_a_goal_without_advanced_fields_has_no_advanced_settings(client, catalog):
    energy = catalog.attribute()
    [saved] = put(client, goals=[goal(energy, applies_to="daily_average")])["goals"]
    assert (saved["custom_name"], saved["importance_below"], saved["importance_above"],
            saved["day_guard_rail"], saved["guard_rail_importance"]) == (None, None, None, True, None)


def test_the_guard_rail_can_be_turned_off_for_a_daily_average(client, catalog):
    energy = catalog.attribute()
    [saved] = put(client, goals=[goal(energy, applies_to="daily_average", day_guard_rail=False)])["goals"]
    assert (saved["day_guard_rail"], saved["guard_rail_importance"]) == (False, None)


@pytest.mark.parametrize(
    "fields",
    [
        # Must, or a single bound: no sides to weigh apart.
        {"must": True, "min": "100", "max": "200"},
        {"min": "100", "max": None},
        {"min": None, "max": "200"},
    ],
)
def test_the_importance_below_and_above_are_dropped_unless_prefer_with_both_bounds(client, catalog, fields):
    energy = catalog.attribute()
    [saved] = put(client, goals=[goal(energy, importance_below=5, importance_above=1, **fields)])["goals"]
    assert (saved["importance_below"], saved["importance_above"]) == (None, None)


def test_the_guard_rail_settings_are_dropped_unless_they_apply(client, catalog):
    energy = catalog.attribute()
    saved = put(client, goals=[
        # Only a daily average has a day guard-rail.
        goal(energy, day_guard_rail=False, guard_rail_importance=4),
        goal(energy, applies_to="plan_total", day_guard_rail=False, guard_rail_importance=4),
        # With the guard-rail off, its importance has nothing to weigh.
        goal(energy, applies_to="daily_average", day_guard_rail=False, guard_rail_importance=4),
    ])["goals"]
    assert [(g["day_guard_rail"], g["guard_rail_importance"]) for g in saved] == [
        (True, None), (True, None), (False, None),
    ]


def test_a_typed_name_is_kept_and_the_generated_ones_numbered_around_it(client, catalog):
    energy = catalog.attribute()
    saved = put(client, goals=[goal(energy), goal(energy, custom_name="Energy per day (2)"), goal(energy)])
    assert [g["name"] for g in saved["goals"]] == ["Energy per day", "Energy per day (2)", "Energy per day (3)"]
    assert [g["custom_name"] for g in saved["goals"]] == [None, "Energy per day (2)", None]


def test_typed_names_equal_after_trimming_answer_422_on_each_goal_with_the_name(client, catalog):
    # Both are marked, so the editor finds it whichever of them was edited.
    energy = catalog.attribute()
    before = put(client, goals=[goal(energy, custom_name="Fuel"), goal(energy)])
    body = {**read(client), "goals": [*before["goals"], goal(energy, custom_name=" Fuel  ")]}
    response = client.put("/api/plan", json=body)
    assert response.status_code == 422
    assert [(e["loc"], e["type"], e["msg"]) for e in response.json()["detail"]] == [
        (["body", "goals", 0, "custom_name"], "duplicate", "Another goal has this name"),
        (["body", "goals", 2, "custom_name"], "duplicate", "Another goal has this name"),
    ]
    assert read(client) == before


def test_the_goals_are_kept_in_the_order_sent(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    first, second = put(client, goals=[goal(energy), goal(protein)])["goals"]
    swapped = put(client, goals=[second, first])
    assert [g["id"] for g in swapped["goals"]] == [second["id"], first["id"]]


def test_a_goal_with_an_id_is_changed_and_keeps_its_id(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    [stored] = put(client, goals=[goal(energy)])["goals"]
    [changed] = put(client, goals=[{**stored, "attribute_id": protein, "min": "50", "importance": 4}])["goals"]
    assert changed["id"] == stored["id"]
    assert (changed["attribute_id"], changed["min"], changed["importance"]) == (protein, "50", 4)


def test_a_goal_left_out_is_removed(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    first, second = put(client, goals=[goal(energy), goal(protein)])["goals"]
    assert [g["id"] for g in put(client, goals=[second])["goals"]] == [second["id"]]
    assert put(client, goals=[])["goals"] == []


def test_goals_with_the_same_generated_name_are_numbered(client, catalog):
    energy = catalog.attribute()
    saved = put(client, goals=[goal(energy), goal(energy, min="1"), goal(energy, applies_to="plan_total")])
    assert [g["name"] for g in saved["goals"]] == ["Energy per day", "Energy per day (2)", "Energy, plan total"]


def test_a_reference_that_is_not_needed_is_not_stored(client, catalog):
    energy = catalog.attribute()
    saved = put(client, goals=[
        goal(energy, must=True, applies_to="day", min="0", zero_reference="25"),
        goal(energy, min="5", zero_reference="25"),
    ])
    assert [g["zero_reference"] for g in saved["goals"]] == [None, None]


def test_a_goal_with_no_zero_bound_and_a_zero_bound_needing_it(client, catalog):
    energy = catalog.attribute()
    for fields in (
        {"min": "0"}, {"min": None, "max": "0"}, {"must": True, "applies_to": "daily_average", "min": "0"},
        {"min": "-5"}, {"min": None, "max": "-5"}, {"must": True, "applies_to": "daily_average", "min": None, "max": "-5"},
    ):
        response = client.put("/api/plan", json={**read(client), "goals": [goal(energy, **fields)]})
        assert response.status_code == 422, fields
        assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [
            (["body", "goals", 0, "zero_reference"], "needs_reference")
        ]
    saved = put(client, goals=[goal(energy, min="0", zero_reference="10")])
    assert saved["goals"][0]["zero_reference"] == "10"


def test_a_must_daily_average_without_its_guard_rail_needs_no_zero_reference(client, catalog):
    energy = catalog.attribute()
    [saved] = put(client, goals=[
        goal(energy, must=True, applies_to="daily_average", day_guard_rail=False, min="0", zero_reference="25"),
    ])["goals"]
    assert (saved["min"], saved["zero_reference"]) == ("0", None)


def test_a_bound_may_be_negative(client, catalog):
    energy = catalog.attribute()
    saved = put(client, goals=[goal(energy, must=True, min="-50", max="-10")])
    assert (saved["goals"][0]["min"], saved["goals"][0]["max"]) == ("-50", "-10")


def test_a_stored_goal_is_not_held_to_a_later_cut_in_its_attributes_decimals(client, catalog):
    protein = catalog.attribute("Protein", "g", 1)
    [stored] = put(client, goals=[goal(protein, min=None, max="10.5")])["goals"]
    response = client.put(f"/api/attributes/{protein}", json={"name": "Protein", "unit": "g", "decimals": 0})
    assert response.status_code == 200, response.text
    # The schedule and the unchanged goal save; a changed bound is checked again.
    assert put(client, days=5, goals=[stored])["days"] == 5
    response = client.put("/api/plan", json={**read(client), "goals": [{**stored, "max": "10.6"}]})
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(["body", "goals", 0, "max"], "too_many_decimals")]
    # Equal as numbers is unchanged; a bound of its own attribute's precision is fine.
    assert put(client, goals=[{**stored, "max": "10.50"}])["goals"][0]["max"] == "10.5"


def test_a_goal_moved_to_another_attribute_is_checked_again(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein", "g", 1)
    [stored] = put(client, goals=[goal(protein, min=None, max="10.5")])["goals"]
    response = client.put("/api/plan", json={**read(client), "goals": [{**stored, "attribute_id": energy}]})
    assert response.status_code == 422
    assert [e["type"] for e in response.json()["detail"]] == ["too_many_decimals"]


def test_a_bound_may_have_trailing_zeros_beyond_the_attributes_decimals(client, catalog):
    energy = catalog.attribute()
    assert put(client, goals=[goal(energy, min="100.000")])["goals"][0]["min"] == "100"


@pytest.mark.parametrize(
    ("fields", "loc", "error_type"),
    [
        ({"attribute_id": 999}, ["attribute_id"], "unknown_attribute"),
        ({"min": None, "max": None}, ["min"], "no_bound"),
        ({"min": "10", "max": "9"}, ["min"], "min_above_max"),
        ({"min": "100.5"}, ["min"], "too_many_decimals"),
        ({"min": None, "max": "9.01"}, ["max"], "too_many_decimals"),
        ({"id": 999}, ["id"], "unknown_goal"),
        ({"importance": 0}, ["importance"], "greater_than_equal"),
        ({"importance": 6}, ["importance"], "less_than_equal"),
        ({"zero_reference": "0"}, ["zero_reference"], "greater_than"),
        ({"zero_reference": "-1"}, ["zero_reference"], "greater_than"),
        ({"applies_to": "week"}, ["applies_to"], "literal_error"),
        ({"custom_name": ""}, ["custom_name"], "string_too_short"),
        ({"custom_name": "   "}, ["custom_name"], "string_too_short"),
        ({"custom_name": "x" * 101}, ["custom_name"], "string_too_long"),
        ({"importance_below": 0}, ["importance_below"], "greater_than_equal"),
        ({"importance_above": 6}, ["importance_above"], "less_than_equal"),
        ({"guard_rail_importance": 0}, ["guard_rail_importance"], "greater_than_equal"),
        ({"guard_rail_importance": 6}, ["guard_rail_importance"], "less_than_equal"),
    ],
)
def test_an_invalid_goal_answers_422_on_its_field_and_changes_nothing(client, catalog, fields, loc, error_type):
    energy = catalog.attribute()
    before = put(client, goals=[goal(energy)])
    body = {**read(client), "goals": [*before["goals"], {**goal(energy), **fields}]}
    response = client.put("/api/plan", json=body)
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(["body", "goals", 1, *loc], error_type)]
    assert read(client) == before


def test_a_goal_given_twice_or_of_a_deleted_attribute_answers_422(client, catalog):
    energy = catalog.attribute()
    [stored] = put(client, goals=[goal(energy)])["goals"]
    response = client.put("/api/plan", json={**read(client), "goals": [stored, stored]})
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(["body", "goals", 1, "id"], "duplicate")]
    client.delete(f"/api/attributes/{energy}")
    assert read(client)["goals"] == []


def test_at_most_50_goals(client, catalog):
    energy = catalog.attribute()
    assert len(put(client, goals=[goal(energy)] * 50)["goals"]) == 50
    response = client.put("/api/plan", json={**read(client), "goals": [goal(energy)] * 51})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "goals"]


def test_tag_filters_round_trip_in_tag_id_order(client, catalog):
    vegan, nuts, quick = catalog.tag(), catalog.tag("contains-nuts"), catalog.tag("quick")
    saved = put(client, tag_filters=[
        {"tag_id": quick, "mode": "only"}, {"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"},
    ])
    assert saved["tag_filters"] == [
        {"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"}, {"tag_id": quick, "mode": "only"},
    ]
    assert read(client) == saved


def test_a_filter_left_out_goes_and_a_changed_one_changes(client, catalog):
    vegan, nuts = catalog.tag(), catalog.tag("contains-nuts")
    put(client, tag_filters=[{"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"}])
    saved = put(client, tag_filters=[{"tag_id": vegan, "mode": "never"}])
    assert saved["tag_filters"] == [{"tag_id": vegan, "mode": "never"}]
    assert put(client, tag_filters=[])["tag_filters"] == []


def test_a_filter_on_an_unknown_tag_or_given_twice_answers_422_and_changes_nothing(client, catalog):
    vegan = catalog.tag()
    before = put(client, tag_filters=[{"tag_id": vegan, "mode": "only"}])
    filters = [{"tag_id": vegan, "mode": "only"}, {"tag_id": 999, "mode": "never"}, {"tag_id": vegan, "mode": "never"}]
    response = client.put("/api/plan", json={**before, "tag_filters": filters})
    assert response.status_code == 422
    assert [(e["loc"], e["type"], e["msg"]) for e in response.json()["detail"]] == [
        (["body", "tag_filters", 1, "tag_id"], "unknown_tag", "No such tag"),
        (["body", "tag_filters", 2, "tag_id"], "duplicate", "This tag is given twice"),
    ]
    assert read(client) == before


@pytest.mark.parametrize(
    ("changes", "loc"),
    [
        ({"mode": "any"}, ["tag_filters", 0, "mode"]),
        ({"tag_id": "vegan"}, ["tag_filters", 0, "tag_id"]),
    ],
)
def test_an_invalid_filter_answers_422_on_its_field(client, catalog, changes, loc):
    vegan = catalog.tag()
    response = client.put("/api/plan", json={**read(client), "tag_filters": [{"tag_id": vegan, "mode": "only", **changes}]})
    assert response.status_code == 422
    assert [e["loc"] for e in response.json()["detail"]] == [["body", *loc]]


def test_a_body_without_tag_filters_answers_422_rather_than_removing_them(client, catalog):
    vegan = catalog.tag()
    before = put(client, tag_filters=[{"tag_id": vegan, "mode": "only"}])
    body = {field: value for field, value in before.items() if field != "tag_filters"}
    response = client.put("/api/plan", json=body)
    assert response.status_code == 422
    assert [e["loc"] for e in response.json()["detail"]] == [["body", "tag_filters"]]
    assert read(client) == before


def count(client, *filters) -> dict:
    response = client.post("/api/plan/recipe-count", json={"tag_filters": list(filters)})
    assert response.status_code == 200, response.text
    return response.json()


def vegan_and_nut_recipes(catalog) -> tuple[int, int]:
    """Oat porridge (vegan by its ingredient), Nut porridge (vegan, with
    nuts added by hand) and Milk porridge (not vegan). Answers the tags."""
    vegan, nuts = catalog.tag(), catalog.tag("contains-nuts", "any")
    oats = catalog.ingredient(tag_ids=[vegan])
    milk = catalog.ingredient("Milk", "ml")
    catalog.recipe("Oat porridge", {oats: "60"})
    catalog.recipe("Nut porridge", {oats: "60"}, extra_tag_ids=[nuts])
    catalog.recipe("Milk porridge", {oats: "60", milk: "200"})
    return vegan, nuts


def test_without_filters_every_recipe_can_be_used(client, catalog):
    vegan_and_nut_recipes(catalog)
    assert count(client) == {"usable": 3, "total": 3}


def test_only_counts_the_recipes_with_the_tag_and_never_those_without(client, catalog):
    vegan, nuts = vegan_and_nut_recipes(catalog)
    assert count(client, {"tag_id": vegan, "mode": "only"}) == {"usable": 2, "total": 3}
    assert count(client, {"tag_id": nuts, "mode": "never"}) == {"usable": 2, "total": 3}
    both = count(client, {"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"})
    assert both == {"usable": 1, "total": 3}


def test_the_count_is_of_the_filters_sent_not_the_saved_ones(client, catalog):
    vegan, _ = vegan_and_nut_recipes(catalog)
    put(client, tag_filters=[{"tag_id": vegan, "mode": "never"}])
    assert count(client) == {"usable": 3, "total": 3}


def test_without_recipes_the_count_is_0_of_0(client, catalog):
    vegan = catalog.tag()
    assert count(client, {"tag_id": vegan, "mode": "only"}) == {"usable": 0, "total": 0}


def test_a_count_with_a_filter_on_an_unknown_tag_or_given_twice_answers_422(client, catalog):
    vegan = catalog.tag()
    filters = [{"tag_id": vegan, "mode": "only"}, {"tag_id": 999, "mode": "never"}, {"tag_id": vegan, "mode": "never"}]
    response = client.post("/api/plan/recipe-count", json={"tag_filters": filters})
    assert response.status_code == 422
    assert [(e["loc"], e["type"], e["msg"]) for e in response.json()["detail"]] == [
        (["body", "tag_filters", 1, "tag_id"], "unknown_tag", "No such tag"),
        (["body", "tag_filters", 2, "tag_id"], "duplicate", "This tag is given twice"),
    ]
