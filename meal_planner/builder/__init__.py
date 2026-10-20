"""Turn a PlanRequest into a solver-neutral ir.Model (spec section 3).

Each step lives in its own module and writes into one shared
:class:`BuiltModel`: :mod:`.choices` makes the variables and totals,
:mod:`.limits` the bounds and objective terms.
"""

from ..bounds import hard_bounds, soft_bounds
from ..ir import Model
from ..request import PlanRequest
from ..scaling import to_int
from .built import BuiltModel, SlotChoice, SoftTerm
from .choices import MEAL_FLOOR, add_choices, total
from .limits import (
    OBJECTIVE_SCALE, add_hard, add_serving_caps, add_soft, penalty_coefficient,
)

HEADROOM = 2**62
"""Largest magnitude any constraint or the objective may reach (int64 / 2)."""

__all__ = [
    "HEADROOM", "MEAL_FLOOR", "OBJECTIVE_SCALE", "BuiltModel", "ModelTooLargeError",
    "SlotChoice", "SoftTerm", "build", "penalty_coefficient",
]


class ModelTooLargeError(ValueError):
    """Scaled values would overflow the solver's 64-bit integers."""


def build(request: PlanRequest) -> BuiltModel:
    recipes = request.eligible_recipes()
    precision = {a.name: a.precision for a in request.attributes}
    built = BuiltModel(
        precision=precision,
        recipe_units={
            (r.name, a): to_int(r.attribute_total(a), p)
            for r in recipes
            for a, p in precision.items()
        },
    )
    add_choices(built, request, recipes)
    days = len(request.days)
    for c in request.constraints:
        for bound in hard_bounds(c, days):
            add_hard(built, bound, total(built, bound.attribute, bound.day))
        for bound in soft_bounds(c, days):
            add_soft(built, bound, total(built, bound.attribute, bound.day))
    add_serving_caps(built)
    check_headroom(built.model)
    return built


def check_headroom(m: Model) -> None:
    worst = max(
        [m.magnitude(m.objective)]
        + [m.magnitude(c.expr) for c in m.constraints]
        + [abs(b) for c in m.constraints for b in (c.lb, c.ub) if b is not None]
    )
    if worst > HEADROOM:
        raise ModelTooLargeError(
            f"scaled model reaches {worst}, above the int64 headroom {HEADROOM}; "
            "lower an attribute precision or shrink the request"
        )
