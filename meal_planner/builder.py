"""Turn a PlanRequest into a solver-neutral ir.Model (spec section 3).

Units: a recipe's attribute total is an integer at the attribute's
precision p. A multiplier is an integer number of thousandths (ticks). So
any slot, day or horizon total in the model is at scale 10**(p + 3).
"""

from dataclasses import dataclass
from fractions import Fraction

from .domain import Recipe
from .ir import LinExpr, Model, Var
from .request import Constraint, PlanRequest
from .scaling import MULTIPLIER_PRECISION, to_decimal, to_int

OBJECTIVE_SCALE = 10**12
"""Penalty fractions (#17) are multiplied by this before rounding to int."""

HEADROOM = 2**62
"""Largest magnitude any constraint or the objective may reach (int64 / 2)."""

MEAL_FLOOR = "min_meals_per_day"


class ModelTooLargeError(ValueError):
    """Scaled values would overflow the solver's 64-bit integers."""


@dataclass(frozen=True)
class SlotChoice:
    """Recipe ``recipe`` in slot ``slot`` of day ``day``.

    The multiplier in ticks is ``amount * ticks_per_amount``: continuous
    recipes count single ticks, discrete ones count whole steps.
    """

    day: int
    slot: int
    recipe: Recipe
    used: Var
    amount: Var
    ticks_per_amount: int


@dataclass(frozen=True)
class SoftTerm:
    """One side of one soft bound, for tests and debugging."""

    constraint: str
    day: int | None
    side: str
    slack: Var
    coefficient: int


@dataclass
class BuiltModel:
    model: Model
    choices: list[SlotChoice]
    recipe_units: dict[tuple[str, str], int]  # (recipe, attribute) -> int at p
    soft_terms: list[SoftTerm]


def build(request: PlanRequest) -> BuiltModel:
    return _Builder(request).run()


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


class _Builder:
    def __init__(self, request: PlanRequest):
        self.request = request
        self.model = Model()
        self.choices: list[SlotChoice] = []
        self.soft_terms: list[SoftTerm] = []
        self.precision = {a.name: a.precision for a in request.attributes}
        self.recipes = request.eligible_recipes()
        self.recipe_units = {
            (r.name, a): to_int(r.attribute_total(a), p)
            for r in self.recipes
            for a, p in self.precision.items()
        }

    def run(self) -> BuiltModel:
        self._choices()
        for c in self.request.constraints:
            self._constraint(c)
        self._serving_caps()
        self._check_headroom()
        return BuiltModel(self.model, self.choices, self.recipe_units, self.soft_terms)

    # Variables, one recipe per slot, day floor (spec items 2-3).

    def _choices(self) -> None:
        m = self.model
        for d, day in enumerate(self.request.days):
            served = LinExpr()
            for s, slot in enumerate(day.slots):
                if slot.kind != "generated":
                    continue
                per_slot = LinExpr()
                for r in self.recipes:
                    choice = self._choice(d, s, r)
                    per_slot.add(choice.used, 1)
                m.add(per_slot, ub=1)
                served.add_expr(per_slot)
            floor = day.meal_floor()
            if floor > 0:
                switch = m.add_guard(MEAL_FLOOR, d)
                m.add(served, lb=floor, enforced_by=switch)

    def _choice(self, d: int, s: int, r: Recipe) -> SlotChoice:
        m = self.model
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
        self.choices.append(choice)
        return choice

    # Totals (spec item 4).

    def _total(self, attribute: str, day: int | None) -> LinExpr:
        expr = LinExpr()
        for ch in self.choices:
            if day is None or ch.day == day:
                units = self.recipe_units[(ch.recipe.name, attribute)]
                expr.add(ch.amount, units * ch.ticks_per_amount)
        return expr

    def _scale_exp(self, attribute: str) -> int:
        return self.precision[attribute] + MULTIPLIER_PRECISION

    # Constraints (spec items 5-7).

    def _constraint(self, c: Constraint) -> None:
        days = len(self.request.days)
        factor = days if c.aggregate == "average_per_day" else 1
        if c.scope == "day":
            targets = [(d, self._total(c.attribute, d)) for d in range(days)]
        else:
            targets = [(None, self._total(c.attribute, None))]
        for day, expr in targets:
            if c.hard:
                self._hard(c, day, expr, factor)
            else:
                self._soft(c, c.name, day, expr, factor, c.side_weight)
        if c.has_guardrail():
            for d in range(days):
                self._soft(c, guardrail_name(c), d, self._total(c.attribute, d), 1,
                           c.guardrail_side_weight)

    def _bound(self, c: Constraint, value, factor: int) -> int:
        return to_int(to_decimal(value) * factor, self._scale_exp(c.attribute))

    def _hard(self, c: Constraint, day, expr: LinExpr, factor: int) -> None:
        lb = None if c.min is None else self._bound(c, c.min, factor)
        ub = None if c.max is None else self._bound(c, c.max, factor)
        switch = self.model.add_guard(c.name, day)
        self.model.add(expr, lb=lb, ub=ub, enforced_by=switch)

    def _soft(self, c: Constraint, name: str, day, expr: LinExpr, factor: int,
              weight_of) -> None:
        m = self.model
        low, high = m.bounds(expr)
        for side, value in (("below", c.min), ("above", c.max)):
            weight = weight_of(side)
            if value is None or weight == 0:
                continue
            bound = self._bound(c, value, factor)
            reach = bound - low if side == "below" else high - bound
            if reach <= 0:
                continue  # this side can never be missed
            reference = to_decimal(
                c.normalization_reference if c.normalization_reference is not None
                else value
            ) * factor
            slack = m.new_var(f"slack[{name}@{day},{side}]", 0, reach)
            if side == "below":
                m.add(expr.copy().add(slack, 1), lb=bound)
            else:
                m.add(expr.copy().add(slack, -1), ub=bound)
            coef = penalty_coefficient(weight, reference, self._scale_exp(c.attribute))
            m.objective.add(slack, coef)
            self.soft_terms.append(SoftTerm(name, day, side, slack, coef))

    # Serving cap (spec item 8).

    def _serving_caps(self) -> None:
        m = self.model
        for ch in self.choices:
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

    def _check_headroom(self) -> None:
        m = self.model
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


def guardrail_name(c: Constraint) -> str:
    return f"{c.name} (day guard-rail)"
