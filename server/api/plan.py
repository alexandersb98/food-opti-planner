"""/api/plan: read and save the plan setup (A1, A2). There is one setup,
made with the defaults the first time it is read. What a valid setup is and
how a save changes it are in `plans`; making a plan from it is in `solve`."""

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import models, plans, translate
from ..db import DbSession
from ..plans import GoalFields, MealFields, Minimum, PlanFields, Skip, TagFilter
from . import recipes
from .errors import invalid_fields

router = APIRouter(prefix="/plan", tags=["plan"])

PLAN_ID = 1
DEFAULT_DAYS = 7
DEFAULT_MEALS = ("Breakfast", "Lunch", "Dinner")
DEFAULT_SOLVE_TIME = 30


class Meal(MealFields):
    id: int


class Goal(GoalFields):
    id: int
    # The name the goal reads by: its custom name, or the generated one
    # ("Protein per day"), numbered around the others (`translate.goal_names`).
    name: str


class Plan(PlanFields):
    meals: list[Meal]
    goals: list[Goal]


class RecipeCountFields(BaseModel):
    tag_filters: list[TagFilter]


class RecipeCount(BaseModel):
    """How many recipes are left after the filters, out of all recipes."""

    usable: int
    total: int


def stored(db: Session) -> models.Plan:
    """The plan, made with the defaults if there is none yet."""
    loaded = [
        selectinload(models.Plan.meals).selectinload(models.PlanMeal.skips),
        selectinload(models.Plan.minimums),
        selectinload(models.Plan.goals).selectinload(models.Goal.attribute),
        selectinload(models.Plan.tag_filters).selectinload(models.PlanTagFilter.tag),
    ]
    plan = db.get(models.Plan, PLAN_ID, options=loaded)
    if plan is None:
        plan = models.Plan(
            id=PLAN_ID,
            start_date=date.today(),
            days=DEFAULT_DAYS,
            meals=[models.PlanMeal(position=i, name=name) for i, name in enumerate(DEFAULT_MEALS)],
            minimums=[],
            goals=[],
            tag_filters=[],
            solve_time_limit=DEFAULT_SOLVE_TIME,
        )
        db.add(plan)
        db.commit()
    return plan


def _response(plan: models.Plan) -> Plan:
    return Plan(
        start_date=plan.start_date,
        days=plan.days,
        meals=[Meal(id=meal.id, name=meal.name) for meal in plan.meals],
        skips=sorted(
            (Skip(day=skip.day, meal=meal.position) for meal in plan.meals for skip in meal.skips),
            key=lambda skip: (skip.day, skip.meal),
        ),
        minimums=[Minimum(day=m.day, at_least=m.at_least) for m in plan.minimums],
        goals=[
            Goal(
                id=goal.id,
                name=name,
                custom_name=goal.name,
                **{field: getattr(goal, field) for field in plans.GOAL_FIELDS},
            )
            for goal, name in translate.named_goals(plan.goals)
        ],
        tag_filters=[TagFilter(tag_id=f.tag_id, mode=f.mode) for f in plan.tag_filters],
        solve_time_limit=plan.solve_time_limit,
    )


@router.get("")
def get_plan(db: DbSession) -> Plan:
    return _response(stored(db))


@router.put("")
def update_plan(body: PlanFields, db: DbSession) -> Plan:
    plan = stored(db)
    attributes = {a.id: a for a in db.scalars(select(models.Attribute))}
    tags = {t.id: t for t in db.scalars(select(models.Tag))}
    errors = plans.errors(plan, body, attributes, tags)
    if errors:
        raise invalid_fields(errors)
    plans.fill(plan, body)
    db.commit()
    return _response(plan)


@router.post("/recipe-count")
def recipe_count(body: RecipeCountFields, db: DbSession) -> RecipeCount:
    """How many recipes the filters in `body` leave for a plan, by the
    planner's rule (`translate.usable_recipes`). Nothing is saved."""
    tags = {t.id: t for t in db.scalars(select(models.Tag).order_by(models.Tag.id))}
    errors = plans.filter_errors(body.tag_filters, tags)
    if errors:
        raise invalid_fields(errors)
    rows = db.scalars(recipes.loaded()).all()
    only, never = ({tags[f.tag_id].name for f in body.tag_filters if f.mode == mode} for mode in ("only", "never"))
    usable = translate.usable_recipes(rows, list(tags.values()), only, never)
    return RecipeCount(usable=len(usable), total=len(rows))
