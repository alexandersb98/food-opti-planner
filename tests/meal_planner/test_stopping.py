"""StopHandle: a stopped solve returns what it has, as on a timeout."""

import random
import threading
import time

from meal_planner import (
    AttributeDef, ConflictMember, Constraint, Day, Ingredient, IngredientAmount,
    Plan, PlanRequest, Recipe, Slot, SolveStatus, StopHandle, plan,
)
from meal_planner import planner
from meal_planner.backends import cpsat
from meal_planner.ir import LinExpr, Model

KCAL = AttributeDef("kcal", precision=0)
COST = AttributeDef("cost", precision=2)


def subset_sum(exact: bool) -> Model:
    """60 large random weights summing to half their total: CP-SAT finds
    some near miss at once but neither proves the best one nor settles an
    exact hit within seconds."""
    rng = random.Random(7)
    m = Model()
    weights = [(m.new_bool(f"x{i}"), rng.randint(10**8, 10**9)) for i in range(60)]
    target = sum(w for _, w in weights) // 2 + 1
    total = LinExpr()
    for x, w in weights:
        total.add(x, w)
    if exact:
        m.add(total, lb=target, ub=target)
    else:
        gap = m.new_var("gap", 0, 2 * target)
        m.add(total.copy().add(gap, -1), ub=target)
        m.add(total.copy().add(gap, 1), lb=target)
        m.objective.add(gap, 1)
    return m


def stopped_after(seconds: float, model: Model) -> tuple[cpsat.SolveOutcome, float]:
    stop = StopHandle()
    timer = threading.Timer(seconds, stop.stop)
    timer.start()
    start = time.perf_counter()
    outcome = cpsat.solve(model, time_limit=60, stop=stop)
    timer.cancel()
    return outcome, time.perf_counter() - start


def test_stopping_a_long_search_keeps_the_best_solution_so_far():
    outcome, elapsed = stopped_after(0.5, subset_sum(exact=False))
    assert outcome.status == "FEASIBLE"
    assert outcome.values and outcome.objective is not None
    assert elapsed < 10


def test_stopping_a_search_that_found_nothing_returns_nothing():
    outcome, elapsed = stopped_after(0.5, subset_sum(exact=True))
    assert outcome == cpsat.SolveOutcome("UNKNOWN")
    assert elapsed < 10


def test_a_stopped_handle_skips_the_solve():
    stop = StopHandle()
    stop.stop()
    start = time.perf_counter()
    assert cpsat.solve(subset_sum(exact=False), time_limit=60, stop=stop).status == "UNKNOWN"
    assert time.perf_counter() - start < 1


def test_a_stop_that_lands_before_the_search_starts_is_not_lost(monkeypatch):
    """CP-SAT ignores stop_search() just before its search starts. Stand in
    for a stop() landing then: the flag is set, the call to the solver lost."""
    attach = StopHandle._attach

    def attach_then_stop_unseen(self, search):
        attached = attach(self, search)
        self._stopped = True
        return attached

    monkeypatch.setattr(StopHandle, "_attach", attach_then_stop_unseen)
    start = time.perf_counter()
    assert cpsat.solve(subset_sum(exact=True), time_limit=60, stop=StopHandle()).status == "UNKNOWN"
    assert time.perf_counter() - start < 10


def test_stop_can_be_called_again_and_after_the_solve():
    stop = StopHandle()
    assert not stop.stopped
    assert cpsat.solve(subset_sum(exact=False), time_limit=0.2, stop=stop).status == "FEASIBLE"
    stop.stop()
    stop.stop()
    assert stop.stopped


oats = Ingredient("oats", "g", {"kcal": 5})
porridge = Recipe("porridge", [IngredientAmount(oats, 100)])


def test_a_plan_stopped_before_it_starts_has_no_plan():
    stop = StopHandle()
    stop.stop()
    request = PlanRequest([KCAL], [], [porridge], [Day([Slot()])], [])
    assert plan(request, stop) == Plan(SolveStatus.TIMEOUT_NO_SOLUTION)


def test_without_a_stop_the_plan_is_unchanged():
    request = PlanRequest([KCAL], [], [porridge], [Day([Slot()])],
                          [Constraint("energy", "kcal", min=1200)])
    assert plan(request, StopHandle()) == plan(request)


def test_stopping_during_the_clash_search_skips_its_solves(monkeypatch):
    """The extra solves that shrink a conflict are skipped once stopped;
    each skipped one keeps its member, so the report is still a conflict."""
    pasta_i = Ingredient("pasta", "g", {"kcal": 5, "cost": 0.05})
    pasta = Recipe("pasta", [IngredientAmount(pasta_i, 100)])
    constraints = [
        Constraint("energy", "kcal", min=2000, hard=True),
        Constraint("budget", "cost", max=10, hard=True),
        Constraint("sanity", "kcal", max=100000, hard=True),
    ]
    request = PlanRequest([KCAL, COST], [], [pasta], [Day([Slot()])], constraints)
    stop = StopHandle()
    solve = cpsat.solve
    outcomes = []

    def stopped_after_the_first(*args, **kwargs):
        outcome = solve(*args, **kwargs)
        outcomes.append(outcome.status)
        stop.stop()
        return outcome

    monkeypatch.setattr(planner.cpsat, "solve", stopped_after_the_first)
    p = plan(request, stop)
    assert p.solve_status is SolveStatus.INFEASIBLE
    first, *extra = outcomes
    assert first == "INFEASIBLE" and extra and set(extra) == {"UNKNOWN"}
    # Nothing was dropped: the members are the first solve's core.
    assert len(p.conflicts.members) == len(extra)
    assert {ConflictMember("energy", 0), ConflictMember("budget", 0)} <= set(p.conflicts.members)
