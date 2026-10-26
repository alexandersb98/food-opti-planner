"""A library plan to result rows: the frozen copy a saved plan keeps.

Pure, with no database or HTTP, like `translate`. The rows copy names,
units and amounts rather than refer to the catalog, so later edits or
deletes there never change a plan.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

from meal_planner import Plan, PlanRequest, SolveStatus
from meal_planner.bounds import guardrail_name
from meal_planner.scaling import to_decimal

from . import models

STATUS = {SolveStatus.OPTIMAL: "optimal", SolveStatus.FEASIBLE: "time_ran_out"}
# A FEASIBLE plan from a cancelled solve. An OPTIMAL one stays "optimal".
STOPPED = "stopped"
# Scaled ingredient amounts are stored to the catalog's decimals.
AMOUNT_DECIMALS = models.VALUE_DECIMALS
PERCENT_DECIMALS = 1


def rounded(value: Decimal | Fraction, decimals: int) -> Decimal:
    """Half away from zero, as the library rounds (and the recipe totals)."""
    if isinstance(value, Fraction):
        magnitude = abs(value)
        units = (2 * magnitude.numerator * 10**decimals + magnitude.denominator) // (2 * magnitude.denominator)
        return Decimal(-units if value < 0 else units).scaleb(-decimals)
    return value.quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)


def average(total: Decimal, days: int, decimals: int) -> Decimal:
    """The daily average: the plan's rounded total over its days, rounded
    the same way. Divided exactly, so a tie rounds the right way."""
    return rounded(Fraction(total) / days, decimals)


@dataclass(frozen=True)
class FrozenGoal:
    """A goal as the plan's setup had it. `name` is the constraint's name."""

    name: str
    applies_to: str
    must: bool
    min: Decimal | None
    max: Decimal | None


def freeze(
    request: PlanRequest,
    plan: Plan,
    start_date: date,
    meal_names: Sequence[str],
    units: Mapping[str, str],
    goals: Sequence[FrozenGoal],
    stopped: bool = False,
) -> models.PlanResult:
    """The unsaved result rows for `plan`, solved from `request`. `meal_names`
    are the meals of a day in schedule order, one per slot; `units` gives
    each attribute's unit by name; `goals` are the plan's goals in order,
    each named as its constraint; `stopped` says the solve was cancelled,
    which makes a plan that may not be the best one `stopped`. `created_at`
    is left to the caller.

    A slot is planned when it was served; an absent slot and one the planner
    left out both come out as not planned, without items or totals. Each
    total is the library's, rounded to its attribute's decimals; each
    ingredient amount is the recipe's × the portion, rounded to 6 decimals.

    A violation named as a goal is a miss of it, and one named as its day
    guard-rail a miss on its day; serving caps are not goals and are left
    out. A daily average's miss over the plan is stored per day, so its
    bound, actual and amount are divided by the days.
    """
    attributes = [
        models.PlanResultAttribute(position=i, name=a.name, unit=units[a.name], decimals=a.precision)
        for i, a in enumerate(request.attributes)
    ]
    recipes = {recipe.name: recipe for recipe in request.recipes}
    result = models.PlanResult(
        saved=False,
        start_date=start_date,
        days=len(request.days),
        status=STOPPED if stopped and plan.solve_status is SolveStatus.FEASIBLE else STATUS[plan.solve_status],
        attributes=attributes,
        meals=[],
        totals=[],
        goals=[],
    )

    def add_totals(values: Mapping[str, Decimal], meal: models.PlanResultMeal | None = None,
                   day: int | None = None) -> None:
        result.totals += [
            models.PlanResultTotal(attribute=a, meal=meal, day=day, value=rounded(values[a.name], a.decimals))
            for a in attributes
        ]

    for slot in sorted(plan.slots, key=lambda s: (s.day, s.slot)):
        meal = models.PlanResultMeal(
            day=slot.day, position=slot.slot, name=meal_names[slot.slot], planned=False, items=[]
        )
        if slot.recipe is not None:
            meal.planned, meal.recipe, meal.portion = True, slot.recipe, slot.multiplier
            meal.items = [
                models.PlanResultMealItem(
                    position=i,
                    ingredient=item.ingredient.name,
                    unit=item.ingredient.unit,
                    amount=rounded(to_decimal(item.quantity) * slot.multiplier, AMOUNT_DECIMALS),
                )
                for i, item in enumerate(recipes[slot.recipe].items)
            ]
            add_totals(slot.totals, meal=meal)
        result.meals.append(meal)
    for day, values in enumerate(plan.day_totals):
        add_totals(values, day=day)
    add_totals(plan.horizon_totals)
    result.goals = _goals(request, plan, goals, attributes)
    return result


def _goals(
    request: PlanRequest, plan: Plan, goals: Sequence[FrozenGoal], attributes: Sequence[models.PlanResultAttribute]
) -> list[models.PlanResultGoal]:
    constraints = {c.name: c for c in request.constraints}
    attribute_of = {a.name: a for a in attributes}
    rows = [
        models.PlanResultGoal(
            position=i,
            name=goal.name,
            attribute=attribute_of[constraints[goal.name].attribute],
            applies_to=goal.applies_to,
            must=goal.must,
            min=goal.min,
            max=goal.max,
            misses=[],
        )
        for i, goal in enumerate(goals)
    ]
    # A day guard-rail's miss is the goal's, on its day.
    by_name = {row.name: row for row in rows}
    by_name |= {guardrail_name(constraints[row.name]): row for row in rows}
    days = len(request.days)
    for violation in plan.violations:
        row = by_name.get(violation.constraint)
        if row is None:
            continue
        decimals = row.attribute.decimals
        # The library's horizon numbers of an average are totals over the days.
        divisor = days if row.applies_to == "daily_average" and violation.day is None else 1
        row.misses.append(
            models.PlanResultMiss(
                day=violation.day,
                side=violation.side,
                bound=rounded(Fraction(violation.bound) / divisor, decimals),
                actual=rounded(Fraction(violation.actual) / divisor, decimals),
                amount=rounded(Fraction(violation.amount) / divisor, decimals),
                percent=rounded(violation.percent, PERCENT_DECIMALS),
            )
        )
    return rows
