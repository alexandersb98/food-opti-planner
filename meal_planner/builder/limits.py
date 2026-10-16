"""Hard bounds, soft-bound slacks and serving caps (spec section 3, items 5-8)."""

from fractions import Fraction

from ..bounds import HardBound, SoftBound
from ..ir import LinExpr
from ..scaling import MULTIPLIER_PRECISION, to_decimal, to_int
from .built import BuiltModel, SoftTerm

OBJECTIVE_SCALE = 10**12
"""Penalty fractions (#17) are multiplied by this before rounding to int."""


def penalty_coefficient(weight, reference, scale_exp: int) -> int:
    """Objective coefficient for one unit of slack at scale 10**scale_exp.

    The real penalty is ``weight * slack / reference`` (#17). A positive
    weight never rounds down to zero.
    """
    exact = (
        Fraction(OBJECTIVE_SCALE)
        * Fraction(to_decimal(weight))
        / (Fraction(10) ** scale_exp * Fraction(to_decimal(reference)))
    )
    coefficient = round(exact)
    if coefficient == 0 and exact > 0:
        coefficient = 1
    return coefficient


def add_hard(built: BuiltModel, bound: HardBound, expr: LinExpr) -> None:
    scale = built.total_scale(bound.attribute)
    lb = None if bound.low is None else to_int(bound.low, scale)
    ub = None if bound.high is None else to_int(bound.high, scale)
    switch = built.model.add_guard(bound.constraint, bound.day)
    built.model.add(expr, lb=lb, ub=ub, enforced_by=switch)


def add_soft(built: BuiltModel, bound: SoftBound, expr: LinExpr) -> None:
    """A slack per side that can be missed, penalized in the objective."""
    m = built.model
    scale = built.total_scale(bound.attribute)
    low, high = m.bounds(expr)
    for s in bound.sides:
        target = to_int(s.bound, scale)
        reach = target - low if s.side == "below" else high - target
        if reach <= 0:
            continue  # this side can never be missed
        slack = m.new_var(f"slack[{bound.name}@{bound.day},{s.side}]", 0, reach)
        if s.side == "below":
            m.add(expr.copy().add(slack, 1), lb=target)
        else:
            m.add(expr.copy().add(slack, -1), ub=target)
        coef = penalty_coefficient(s.weight, s.reference, scale)
        m.objective.add(slack, coef)
        built.soft_terms.append(SoftTerm(bound.name, bound.day, s.side, slack, coef))


def add_serving_caps(built: BuiltModel) -> None:
    """Penalize serving past ``max_multiplier`` up to the hard max (#16, #38)."""
    m = built.model
    for ch in built.choices:
        r = ch.recipe
        soft = to_int(r.max_multiplier, MULTIPLIER_PRECISION)
        hard = ch.amount.ub * ch.ticks_per_amount
        if hard <= soft or to_decimal(r.serving_cap_weight) == 0:
            continue
        excess = m.new_var(f"excess[{ch.day},{ch.slot},{r.name}]", 0, hard - soft)
        m.add(LinExpr().add(ch.amount, ch.ticks_per_amount).add(excess, -1), ub=soft)
        coef = penalty_coefficient(r.serving_cap_weight, r.max_multiplier,
                                   MULTIPLIER_PRECISION)
        m.objective.add(excess, coef)
