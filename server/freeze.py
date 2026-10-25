"""A library plan to result rows: the frozen copy a saved plan keeps.

Pure, with no database or HTTP, like `translate`. The rows copy names,
units and amounts rather than refer to the catalog, so later edits or
deletes there never change a plan.
"""

from collections.abc import Mapping, Sequence
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

from meal_planner import Plan, PlanRequest, SolveStatus
from meal_planner.scaling import to_decimal

from . import models

STATUS = {SolveStatus.OPTIMAL: "optimal", SolveStatus.FEASIBLE: "time_ran_out"}
# Scaled ingredient amounts are stored to the catalog's decimals.
AMOUNT_DECIMALS = models.VALUE_DECIMALS


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


def freeze(
    request: PlanRequest,
    plan: Plan,
    start_date: date,
    meal_names: Sequence[str],
    units: Mapping[str, str],
) -> models.PlanResult:
    """The unsaved result rows for `plan`, solved from `request`. `meal_names`
    are the meals of a day in schedule order, one per slot; `units` gives
    each attribute's unit by name. `created_at` is left to the caller.

    A slot is planned when it was served; an absent slot and one the planner
    left out both come out as not planned, without items or totals. Each
    total is the library's, rounded to its attribute's decimals; each
    ingredient amount is the recipe's × the portion, rounded to 6 decimals.
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
        status=STATUS[plan.solve_status],
        attributes=attributes,
        meals=[],
        totals=[],
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
    return result
