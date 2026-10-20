import pytest

from meal_planner.ir import LinExpr, Model


def test_new_vars_are_indexed_in_order():
    m = Model()
    x = m.new_var("x", 0, 5)
    b = m.new_bool("b")
    assert (x.index, b.index) == (0, 1)
    assert (b.lb, b.ub) == (0, 1)


def test_new_var_rejects_empty_domain():
    with pytest.raises(ValueError):
        Model().new_var("x", 3, 2)


def test_lin_expr_merges_and_cancels_terms():
    m = Model()
    x, y = m.new_var("x", 0, 5), m.new_var("y", 0, 5)
    e = LinExpr().add(x, 2).add(y, 3).add(x, -2)
    assert e.terms == {y.index: 3}
    e.add_expr(LinExpr({x.index: 1}, 4), factor=2)
    assert e.terms == {y.index: 3, x.index: 2}
    assert e.constant == 8


def test_bounds_and_magnitude():
    m = Model()
    x, y = m.new_var("x", -2, 5), m.new_var("y", 0, 3)
    e = LinExpr({x.index: 2, y.index: -1}, 1)
    assert m.bounds(e) == (-2 * 2 - 3 + 1, 2 * 5 + 1)
    assert m.magnitude(e) == 1 + 2 * 5 + 1 * 3


def test_guard_creates_a_named_switch():
    m = Model()
    switch = m.add_guard("energy", 3)
    assert m.guards[0].switch == switch
    assert (m.guards[0].constraint, m.guards[0].day) == ("energy", 3)
