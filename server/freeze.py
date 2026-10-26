"""A library plan to result rows: the frozen copy a saved plan keeps.

Pure, with no database or HTTP, like `translate`. The rows copy names,
units and amounts rather than refer to the catalog, so later edits or
deletes there never change a plan.
"""

from collections.abc import Mapping
from decimal import Decimal
from fractions import Fraction

from meal_planner import Plan, SolveStatus
from meal_planner.scaling import to_decimal

from . import models
from .rounding import rounded
from .translate import SolveInput

STATUS = {SolveStatus.OPTIMAL: "optimal", SolveStatus.FEASIBLE: "time_ran_out"}
# A FEASIBLE plan from a cancelled solve. An OPTIMAL one stays "optimal".
STOPPED = "stopped"
# Scaled ingredient amounts are stored to the catalog's decimals.
AMOUNT_DECIMALS = models.VALUE_DECIMALS


def average(total: Decimal, days: int, decimals: int) -> Decimal:
    """The daily average: the plan's rounded total over its days, rounded
    the same way. Divided exactly, so a tie rounds the right way."""
    return rounded(Fraction(total) / days, decimals)


def freeze(solve_input: SolveInput, plan: Plan, stopped: bool = False) -> models.PlanResult:
    """The unsaved result rows for `plan`, solved from `solve_input`, which
    names each slot's meal and gives each attribute's unit. `stopped` says
    the solve was cancelled, which makes a plan that may not be the best one
    `stopped`. `created_at` is left to the caller.

    A slot is planned when it was served; an absent slot and one the planner
    left out both come out as not planned, without items or totals. Each
    total is the library's, rounded to its attribute's decimals; each
    ingredient amount is the recipe's × the portion, rounded to 6 decimals.
    """
    request, meal_names = solve_input.request, solve_input.meal_names
    attributes = [
        models.PlanResultAttribute(position=i, name=a.name, unit=solve_input.units[a.name], decimals=a.precision)
        for i, a in enumerate(request.attributes)
    ]
    recipes = {recipe.name: recipe for recipe in request.recipes}
    result = models.PlanResult(
        saved=False,
        start_date=solve_input.start_date,
        days=len(request.days),
        status=STOPPED if stopped and plan.solve_status is SolveStatus.FEASIBLE else STATUS[plan.solve_status],
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
