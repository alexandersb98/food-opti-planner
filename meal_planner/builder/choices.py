"""Choice variables: one recipe per slot, a day's meal floor, and totals.

Spec section 3, items 2-4.
"""

from ..ir import LinExpr
from ..recipe import Recipe
from ..request import PlanRequest
from ..scaling import MULTIPLIER_PRECISION, to_int
from .built import BuiltModel, SlotChoice

MEAL_FLOOR = "min_meals_per_day"


def add_choices(built: BuiltModel, request: PlanRequest, recipes) -> None:
    m = built.model
    for d, day in enumerate(request.days):
        served = LinExpr()
        for s, slot in enumerate(day.slots):
            if slot.kind != "generated":
                continue
            per_slot = LinExpr()
            for r in recipes:
                per_slot.add(_add_choice(built, d, s, r).used, 1)
            m.add(per_slot, ub=1)
            served.add_expr(per_slot)
        floor = day.meal_floor()
        if floor > 0:
            switch = m.add_guard(MEAL_FLOOR, d)
            m.add(served, lb=floor, enforced_by=switch)


def _add_choice(built: BuiltModel, d: int, s: int, r: Recipe) -> SlotChoice:
    m = built.model
    low = to_int(r.min_multiplier, MULTIPLIER_PRECISION)
    high = to_int(r.hard_max_multiplier, MULTIPLIER_PRECISION)
    step = 1
    if r.multiplier_step is not None:
        step = to_int(r.multiplier_step, MULTIPLIER_PRECISION)
        low, high = low // step, high // step
    tag = f"[{d},{s},{r.name}]"
    used = m.new_bool(f"used{tag}")
    amount = m.new_var(f"amount{tag}", 0, high)
    m.add(LinExpr().add(amount, 1).add(used, -low), lb=0)
    m.add(LinExpr().add(amount, 1).add(used, -high), ub=0)
    choice = SlotChoice(d, s, r, used, amount, step)
    built.choices.append(choice)
    return choice


def total(built: BuiltModel, attribute: str, day: int | None) -> LinExpr:
    """``attribute`` summed over one day, or the horizon when ``day`` is None."""
    expr = LinExpr()
    for ch in built.choices:
        if day is None or ch.day == day:
            units = built.recipe_units[(ch.recipe.name, attribute)]
            expr.add(ch.amount, units * ch.ticks_per_amount)
    return expr
