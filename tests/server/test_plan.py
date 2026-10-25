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
        "solve_time_limit": 30,
    }
    assert len(set(meal_ids)) == 3
    assert read(client) == plan


def test_saving_before_the_first_read_creates_the_plan(client):
    response = client.put("/api/plan", json={
        "start_date": "2026-11-02", "days": 2, "meals": [{"name": "Lunch"}],
        "skips": [], "minimums": [], "solve_time_limit": 10,
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
