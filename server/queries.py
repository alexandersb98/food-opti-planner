"""The reads more than one route needs: the plan setup, the recipes with
everything the planner uses of them, and a plan result in full. The routes
import these rather than each other."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models

PLAN_ID = 1
DEFAULT_DAYS = 7
DEFAULT_MEALS = ("Breakfast", "Lunch", "Dinner")
DEFAULT_SOLVE_TIME = 30


def plan(db: Session) -> models.Plan:
    """The plan setup, made with the defaults if there is none yet."""
    loaded = [
        selectinload(models.Plan.meals).selectinload(models.PlanMeal.skips),
        selectinload(models.Plan.minimums),
        selectinload(models.Plan.goals).selectinload(models.Goal.attribute),
        selectinload(models.Plan.tag_filters).selectinload(models.PlanTagFilter.tag),
    ]
    setup = db.get(models.Plan, PLAN_ID, options=loaded)
    if setup is None:
        setup = models.Plan(
            id=PLAN_ID,
            start_date=date.today(),
            days=DEFAULT_DAYS,
            meals=[models.PlanMeal(position=i, name=name) for i, name in enumerate(DEFAULT_MEALS)],
            minimums=[],
            goals=[],
            tag_filters=[],
            solve_time_limit=DEFAULT_SOLVE_TIME,
        )
        db.add(setup)
        db.commit()
    return setup


def recipes():
    """Recipes with everything their responses and the planner need, in a few queries."""
    ingredient = selectinload(models.Recipe.items).selectinload(models.RecipeItem.ingredient)
    return select(models.Recipe).options(
        ingredient.selectinload(models.Ingredient.values).selectinload(models.IngredientValue.attribute),
        ingredient.selectinload(models.Ingredient.tags),
        selectinload(models.Recipe.extra_tags),
    )


def plan_result(db: Session, plan_id: int) -> models.PlanResult | None:
    """A plan result with everything its response needs, or None."""
    query = select(models.PlanResult).options(
        selectinload(models.PlanResult.attributes),
        selectinload(models.PlanResult.meals).selectinload(models.PlanResultMeal.items),
        selectinload(models.PlanResult.totals),
        selectinload(models.PlanResult.goals).selectinload(models.PlanResultGoal.misses),
    )
    return db.scalars(query.where(models.PlanResult.id == plan_id)).one_or_none()
