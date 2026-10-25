"""POST /api/plan/solve: a plan becomes the unsaved plan; no plan answers why."""

from dataclasses import replace
from datetime import datetime

import pytest

import meal_planner
from meal_planner import ConflictReport, ModelTooLargeError, Plan, PlanRequestError, SolveStatus
from server.api import plan as plan_api

from .conftest import schedule


def solve(client) -> dict:
    response = client.post("/api/plan/solve")
    assert response.status_code == 200, response.text
    return response.json()


def unsaved(client) -> dict | None:
    return client.get("/api/plan-results").json()["unsaved"]


def porridge_meal(energy: str, protein: str, name: str = "Breakfast") -> dict:
    return {
        "name": name,
        "planned": True,
        "recipe": "Porridge",
        "portion": "1.5",
        "totals": [energy, protein],
        "items": [
            {"ingredient": "Oats", "unit": "g", "amount": "90"},
            # 0.333333 x 1.5 = 0.4999995, rounded to 6 decimals.
            {"ingredient": "Milk", "unit": "l", "amount": "0.5"},
        ],
    }


def test_a_plan_is_stored_as_the_unsaved_plan_and_answered_in_full(client, porridge):
    outcome = solve(client)
    assert outcome["failure"] is None
    plan = outcome["plan"]
    assert set(plan) == {
        "id", "saved", "status", "start_date", "days", "created_at", "saved_at",
        "attributes", "totals", "averages", "day_totals", "meals",
    }
    assert plan["created_at"].endswith("Z")
    assert {k: plan[k] for k in ("saved", "status", "start_date", "days", "saved_at")} == {
        "saved": False, "status": "optimal", "start_date": "2026-10-26", "days": 2, "saved_at": None,
    }
    assert plan["attributes"] == [
        {"name": "Energy", "unit": "kcal", "decimals": 0},
        {"name": "Protein", "unit": "g", "decimals": 1},
    ]
    # The library counts a portion as 447 kcal and 10.1 g (the recipe's
    # totals at 1x, rounded), so 1.5 portions are 670.5 kcal and 15.15 g.
    # Each total is the library's, rounded half away from zero.
    skipped = {"name": "Lunch", "planned": False, "recipe": None, "portion": None, "totals": [], "items": []}
    assert plan["meals"] == [
        [porridge_meal("671", "15.2"), skipped],
        [porridge_meal("671", "15.2"), porridge_meal("671", "15.2", "Lunch")],
    ]
    # 1341 kcal, not the rounded meals added up (1342).
    assert plan["day_totals"] == [["671", "15.2"], ["1341", "30.3"]]
    # 2011.5 kcal and 45.45 g.
    assert plan["totals"] == ["2012", "45.5"]
    # 2012 / 2 and 45.5 / 2 = 22.75, rounded half away from zero.
    assert plan["averages"] == ["1006", "22.8"]
    assert client.get(f"/api/plan-results/{plan['id']}").json() == plan
    assert unsaved(client)["id"] == plan["id"]


def test_a_second_solve_replaces_the_unsaved_plan(client, porridge):
    first = solve(client)["plan"]
    second = solve(client)["plan"]
    # SQLite may give the new plan the old one's id.
    assert datetime.fromisoformat(second["created_at"]) > datetime.fromisoformat(first["created_at"])
    assert client.get("/api/plan-results").json() == {"unsaved": summary(second), "saved": []}


def summary(plan: dict) -> dict:
    keys = ("id", "saved", "status", "start_date", "days", "created_at", "saved_at")
    return {key: plan[key] for key in keys}


def test_a_feasible_plan_is_one_where_time_ran_out(client, porridge, monkeypatch):
    monkeypatch.setattr(
        plan_api, "solve_plan", lambda request: replace(meal_planner.plan(request), solve_status=SolveStatus.FEASIBLE)
    )
    assert solve(client)["plan"]["status"] == "time_ran_out"


def test_the_planner_gets_the_setup_and_the_whole_catalog(client, porridge, catalog, monkeypatch):
    requests = []

    def recorded(request):
        requests.append(request)
        return meal_planner.plan(request)

    monkeypatch.setattr(plan_api, "solve_plan", recorded)
    catalog.tag()
    solve(client)
    [request] = requests
    assert [a.name for a in request.attributes] == ["Energy", "Protein"]
    assert [t.name for t in request.tags] == ["vegan"]
    assert [r.name for r in request.recipes] == ["Porridge"]
    assert [[s.kind for s in day.slots] for day in request.days] == [["generated", "absent"], ["generated", "generated"]]
    assert request.solve_time_limit == 10


def test_without_recipes_there_is_no_plan(client, catalog):
    catalog.attribute()
    assert solve(client) == {"plan": None, "failure": "no_recipes"}
    assert unsaved(client) is None


@pytest.mark.parametrize(
    ("answer", "failure"),
    [
        (Plan(SolveStatus.INFEASIBLE, conflicts=ConflictReport(())), "infeasible"),
        (Plan(SolveStatus.TIMEOUT_NO_SOLUTION), "no_plan_in_time"),
    ],
)
def test_no_plan_answers_why_and_keeps_the_unsaved_plan(client, porridge, monkeypatch, answer, failure):
    kept = solve(client)["plan"]
    monkeypatch.setattr(plan_api, "solve_plan", lambda request: answer)
    assert solve(client) == {"plan": None, "failure": failure}
    assert unsaved(client) == summary(kept)


def test_a_model_too_large_for_the_solver_answers_why(client, porridge, monkeypatch):
    """Until goals (slice 8) put totals into the model, no catalog is too
    large, so the library's error is stood in for."""
    kept = solve(client)["plan"]

    def too_large(request):
        raise ModelTooLargeError("scaled model reaches 10**21")

    monkeypatch.setattr(plan_api, "solve_plan", too_large)
    assert solve(client) == {"plan": None, "failure": "too_large"}
    assert unsaved(client) == summary(kept)


def test_any_other_request_error_is_a_bug(client, porridge, monkeypatch):
    def refused(request):
        raise PlanRequestError(["something the server should have caught"])

    monkeypatch.setattr(plan_api, "solve_plan", refused)
    with pytest.raises(PlanRequestError):
        client.post("/api/plan/solve")


def test_a_plan_left_out_by_the_planner_is_skipped(client, porridge, monkeypatch):
    """A day whose minimum lets the planner leave a meal out shows it as
    not planned, like a skipped cell."""
    def without_day_1_lunch(request):
        answer = meal_planner.plan(request)
        slots = tuple(
            replace(s, recipe=None, multiplier=None) if (s.day, s.slot) == (1, 1) else s for s in answer.slots
        )
        return replace(answer, slots=slots)

    monkeypatch.setattr(plan_api, "solve_plan", without_day_1_lunch)
    lunch = solve(client)["plan"]["meals"][1][1]
    assert lunch == {"name": "Lunch", "planned": False, "recipe": None, "portion": None, "totals": [], "items": []}


def test_meals_follow_the_schedule_order_and_names(client, porridge):
    setup = client.get("/api/plan").json()
    breakfast, lunch = setup["meals"]
    schedule(client, meals=[{**lunch, "name": "Supper"}, breakfast], skips=[{"day": 0, "meal": 0}])
    meals = solve(client)["plan"]["meals"]
    assert [[(m["name"], m["planned"]) for m in day] for day in meals] == [
        [("Supper", False), ("Breakfast", True)],
        [("Supper", True), ("Breakfast", True)],
    ]
