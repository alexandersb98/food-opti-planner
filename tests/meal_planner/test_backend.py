from meal_planner.backends.cpsat import solve
from meal_planner.ir import LinExpr, Model


def test_minimizes_a_tiny_model():
    m = Model()
    x, y = m.new_var("x", 0, 10), m.new_var("y", 0, 10)
    m.add(LinExpr().add(x, 1).add(y, 1), lb=7)  # x + y >= 7
    m.add(LinExpr().add(x, 1), ub=3)  # x <= 3
    m.objective.add(x, 1).add(y, 2)  # cheapest: x=3, y=4
    out = solve(m, time_limit=5)
    assert out.status == "OPTIMAL"
    assert (out.values[x.index], out.values[y.index]) == (3, 4)
    assert out.objective == 11


def test_guarded_constraints_and_core():
    m = Model()
    x = m.new_var("x", 0, 10)
    low = m.add_guard("low", 0)
    high = m.add_guard("high", 0)
    m.add_guard("loose", None)
    m.add(LinExpr().add(x, 1), lb=8, enforced_by=low)
    m.add(LinExpr().add(x, 1), ub=3, enforced_by=high)
    out = solve(m, time_limit=5)
    assert out.status == "INFEASIBLE"
    assert {0, 1} <= set(out.core)  # may also hold the irrelevant guard 2


def test_unassumed_guards_switch_their_constraint_off():
    m = Model()
    x = m.new_var("x", 0, 10)
    low, high = m.add_guard("low", 0), m.add_guard("high", 0)
    m.add(LinExpr().add(x, 1), lb=8, enforced_by=low)
    m.add(LinExpr().add(x, 1), ub=3, enforced_by=high)
    m.objective.add(x, 1)
    out = solve(m, time_limit=5, assumed=[0])
    assert out.status == "OPTIMAL"
    assert out.values[x.index] == 8


def test_feasibility_only_skips_objective():
    m = Model()
    x = m.new_var("x", 0, 10)
    m.objective.add(x, 1)
    out = solve(m, time_limit=5, optimize=False)
    assert out.status in ("OPTIMAL", "FEASIBLE")
    assert out.objective is None


def test_term_less_constraints_are_decided_in_python():
    m = Model()
    x = m.new_var("x", 0, 5)
    ok, bad = m.add_guard("ok", None), m.add_guard("bad", None)
    m.add(LinExpr({}, 3), lb=1, enforced_by=ok)   # 3 >= 1 holds
    m.add(LinExpr({}, 0), lb=1, enforced_by=bad)  # 0 >= 1 fails
    out = solve(m, 5.0)
    assert out.status == "INFEASIBLE" and out.core == (1,)
    out = solve(m, 5.0, assumed=[0])
    assert out.status == "OPTIMAL"


def test_unenforced_violated_term_less_constraint_is_infeasible():
    m = Model()
    m.new_var("x", 0, 5)
    m.add(LinExpr({}, 0), ub=-1)
    assert solve(m, 5.0).status == "INFEASIBLE"
