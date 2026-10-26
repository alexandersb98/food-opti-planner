"""POST /api/plan/solve: a plan becomes the unsaved plan; no plan answers
why. POST /api/plan/solve/cancel stops it."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime

import pytest

import meal_planner
from meal_planner import ConflictReport, ModelTooLargeError, Plan, PlanRequestError, SolveStatus
from server.api import plan as plan_api

from .conftest import fixed_portion_recipe, schedule


def solve(client, solve_id: str = "s1") -> dict:
    response = client.post("/api/plan/solve", json={"solve_id": solve_id})
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
        plan_api, "solve_plan", lambda request, stop: replace(meal_planner.plan(request, stop), solve_status=SolveStatus.FEASIBLE)
    )
    assert solve(client)["plan"]["status"] == "time_ran_out"


def test_the_planner_gets_the_setup_and_the_whole_catalog(client, porridge, catalog, monkeypatch):
    requests = []

    def recorded(request, stop):
        requests.append(request)
        return meal_planner.plan(request, stop)

    monkeypatch.setattr(plan_api, "solve_plan", recorded)
    catalog.tag()
    solve(client)
    [request] = requests
    assert [a.name for a in request.attributes] == ["Energy", "Protein"]
    assert [t.name for t in request.tags] == ["vegan"]
    assert [r.name for r in request.recipes] == ["Porridge"]
    assert [[s.kind for s in day.slots] for day in request.days] == [["generated", "absent"], ["generated", "generated"]]
    assert request.solve_time_limit == 10


def test_no_connection_is_held_while_solving(client, porridge, monkeypatch):
    # A solve may take minutes; Neon drops a connection idle for 5.
    pool = client.app.state.engine.pool
    checked_out = []

    def counted(request, stop):
        checked_out.append(pool.checkedout())
        return meal_planner.plan(request, stop)

    monkeypatch.setattr(plan_api, "solve_plan", counted)
    assert solve(client)["plan"] is not None
    assert checked_out == [0]


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
    monkeypatch.setattr(plan_api, "solve_plan", lambda request, stop: answer)
    assert solve(client) == {"plan": None, "failure": failure}
    assert unsaved(client) == summary(kept)


def test_a_model_too_large_for_the_solver_answers_why(client, porridge, monkeypatch):
    """Until goals (slice 8) put totals into the model, no catalog is too
    large, so the library's error is stood in for."""
    kept = solve(client)["plan"]

    def too_large(request, stop):
        raise ModelTooLargeError("scaled model reaches 10**21")

    monkeypatch.setattr(plan_api, "solve_plan", too_large)
    assert solve(client) == {"plan": None, "failure": "too_large"}
    assert unsaved(client) == summary(kept)


def test_any_other_request_error_is_a_bug(client, porridge, monkeypatch):
    def refused(request, stop):
        raise PlanRequestError(["something the server should have caught"])

    monkeypatch.setattr(plan_api, "solve_plan", refused)
    with pytest.raises(PlanRequestError):
        client.post("/api/plan/solve", json={"solve_id": "s2"})


def test_a_plan_left_out_by_the_planner_is_skipped(client, porridge, monkeypatch):
    """A day whose minimum lets the planner leave a meal out shows it as
    not planned, like a skipped cell."""
    def without_day_1_lunch(request, stop):
        answer = meal_planner.plan(request, stop)
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


class UntilCancelled:
    """Stands in for a long solve: runs until cancelled, then answers as the
    library does when stopped, with `found` (a plan, or none)."""

    def __init__(self, found: bool = True):
        self.found = found
        self.started = threading.Event()

    def __call__(self, request, stop):
        self.started.set()
        deadline = time.monotonic() + 10
        while not stop.stopped and time.monotonic() < deadline:
            time.sleep(0.01)
        assert stop.stopped
        if not self.found:
            return Plan(SolveStatus.TIMEOUT_NO_SOLUTION)
        return replace(meal_planner.plan(request), solve_status=SolveStatus.FEASIBLE)


def solving(client, monkeypatch, long_solve: UntilCancelled, solve_id: str = "s1"):
    """Start a solve in another thread; answer its future once it solves."""
    monkeypatch.setattr(plan_api, "solve_plan", long_solve)
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(client.post, "/api/plan/solve", json={"solve_id": solve_id})
    pool.shutdown(wait=False)
    assert long_solve.started.wait(10)
    return future


def cancel(client, solve_id: str) -> None:
    assert client.post("/api/plan/solve/cancel", json={"solve_id": solve_id}).status_code == 204


def test_cancel_stops_the_solve_which_keeps_the_plan_found(client, porridge, monkeypatch):
    answer = solving(client, monkeypatch, UntilCancelled())
    cancel(client, "s1")
    response = answer.result(10)
    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["status"] == "stopped"
    assert unsaved(client) == summary(plan)


def test_cancel_before_any_plan_answers_stopped_and_keeps_the_unsaved_plan(client, porridge, monkeypatch):
    kept = solve(client)["plan"]
    answer = solving(client, monkeypatch, UntilCancelled(found=False))
    cancel(client, "s1")
    assert answer.result(10).json() == {"plan": None, "failure": "stopped"}
    assert unsaved(client) == summary(kept)


def test_a_cancelled_infeasible_solve_is_still_infeasible(client, porridge, monkeypatch):
    def infeasible(request, stop):
        stop.stop()
        return Plan(SolveStatus.INFEASIBLE, conflicts=ConflictReport(()))

    monkeypatch.setattr(plan_api, "solve_plan", infeasible)
    assert solve(client) == {"plan": None, "failure": "infeasible"}


def test_a_second_solve_while_one_runs_is_refused(client, porridge, monkeypatch):
    answer = solving(client, monkeypatch, UntilCancelled())
    response = client.post("/api/plan/solve", json={"solve_id": "s2"})
    assert response.status_code == 409
    assert response.json() == {"detail": "A plan is already being made"}
    cancel(client, "s1")
    assert answer.result(10).json()["plan"]["status"] == "stopped"


def test_cancel_of_a_solve_that_is_over_does_not_touch_the_next_one(client, porridge):
    """A Cancel may cross the answer, or be left over from a solve that has
    ended; the solve after it is not the one it named."""
    cancel(client, "gone")
    assert solve(client, "s2")["plan"]["status"] == "optimal"


def test_cancel_of_another_solve_leaves_the_running_one_alone(client, porridge, monkeypatch):
    long_solve = UntilCancelled()
    answer = solving(client, monkeypatch, long_solve, solve_id="s1")
    cancel(client, "s2")
    with pytest.raises(TimeoutError):
        answer.result(0.5)
    cancel(client, "s1")
    assert answer.result(10).json()["plan"]["status"] == "stopped"


def test_a_cancel_that_arrives_before_its_solve_stops_it_as_it_starts(client, porridge):
    """Cancel can beat Make plan to the server, as the card's Cancel is
    there from the click. The solve is stopped as soon as it starts."""
    cancel(client, "s1")
    assert solve(client, "s1") == {"plan": None, "failure": "stopped"}
    # Only that one solve: the next one is not stopped by the same Cancel.
    assert solve(client, "s2")["plan"]["status"] == "optimal"


def test_after_a_solve_another_may_start(client, porridge, monkeypatch):
    monkeypatch.setattr(plan_api, "solve_plan", lambda request, stop: Plan(SolveStatus.INFEASIBLE))
    assert solve(client)["failure"] == "infeasible"

    def refused(request, stop):
        raise PlanRequestError(["a bug"])

    monkeypatch.setattr(plan_api, "solve_plan", refused)
    with pytest.raises(PlanRequestError):
        client.post("/api/plan/solve", json={"solve_id": "s2"})
    monkeypatch.undo()
    assert solve(client)["plan"] is not None


def test_a_real_solve_can_be_cancelled(client, porridge, monkeypatch):
    """The library's own stop, through the route: the solve sees the
    request's handle, stopped before it starts."""
    stops = []

    def stopped_first(request, stop):
        stops.append(stop)
        client.post("/api/plan/solve/cancel", json={"solve_id": "s1"})
        return meal_planner.plan(request, stop)

    monkeypatch.setattr(plan_api, "solve_plan", stopped_first)
    assert solve(client) == {"plan": None, "failure": "stopped"}
    assert stops[0].stopped


def one_meal_two_recipes(client, catalog):
    """A day of one meal that either recipe can make: Light (100 kcal) or
    Heavy (300 kcal), each always eaten as one portion. Answers Energy."""
    energy = catalog.attribute()
    food = catalog.ingredient("Food", "g", "1", values={energy: "100"})
    fixed_portion_recipe(catalog, "Light", {food: "1"}, "1")
    fixed_portion_recipe(catalog, "Heavy", {food: "3"}, "1")
    schedule(client, start_date="2026-10-26", days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    return energy


def goal(attribute_id, **changes) -> dict:
    return {
        "attribute_id": attribute_id, "min": None, "max": None, "applies_to": "day",
        "must": False, "importance": 3, "zero_reference": None, **changes,
    }


def chosen(client) -> str:
    return solve(client)["plan"]["meals"][0][0]["recipe"]


def test_a_prefer_goal_decides_between_recipes_that_are_otherwise_equal(client, catalog):
    energy = one_meal_two_recipes(client, catalog)
    schedule(client, goals=[goal(energy, max="150")])
    assert chosen(client) == "Light"
    schedule(client, goals=[goal(energy, min="250")])
    assert chosen(client) == "Heavy"


def test_a_must_goal_the_catalog_cannot_meet_is_infeasible(client, catalog):
    energy = one_meal_two_recipes(client, catalog)
    schedule(client, goals=[goal(energy, min="1000", must=True)])
    assert solve(client) == {"plan": None, "failure": "infeasible"}


def test_a_must_goal_the_catalog_can_meet_is_kept(client, catalog):
    energy = one_meal_two_recipes(client, catalog)
    schedule(client, goals=[goal(energy, min="250", must=True, applies_to="plan_total")])
    assert chosen(client) == "Heavy"
