"""/api/plan: read and save the plan setup (A1, A2). There is one setup,
made with the defaults the first time it is read. Making a plan from it is
in `solve`."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy.orm import Session, selectinload

from .. import models
from ..db import DbSession
from .errors import FieldChecks

router = APIRouter(prefix="/plan", tags=["plan"])

PLAN_ID = 1
MAX_DAYS = 31
MAX_MEALS = 8
# The 5-minute ceiling: the solve runs inside the request.
MAX_SOLVE_TIME = 300

DEFAULT_DAYS = 7
DEFAULT_MEALS = ("Breakfast", "Lunch", "Dinner")
DEFAULT_SOLVE_TIME = 30

MealName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.MEAL_NAME_LENGTH)
]
# Days are numbered from 0. One beyond the plan's days, but within the
# most days a plan can have, is dropped on save, so the editor can keep the
# cells of days it hides while the number of days is lowered.
DayIndex = Annotated[int, Field(ge=0, lt=MAX_DAYS)]


class MealFields(BaseModel):
    # None for a meal added in the editor.
    id: int | None = None
    name: MealName


class Meal(MealFields):
    id: int


class Skip(BaseModel):
    """A skipped cell. `meal` is the meal's position in `meals`."""

    day: DayIndex
    meal: Annotated[int, Field(ge=0)]


class Minimum(BaseModel):
    """The fewest meals a day may serve. A day without one serves all its
    planned meals ("at least: all")."""

    day: DayIndex
    at_least: Annotated[int, Field(ge=0)]


class PlanFields(BaseModel):
    start_date: date
    days: Annotated[int, Field(ge=1, le=MAX_DAYS)]
    # In the order of the day, names unique.
    meals: Annotated[list[MealFields], Field(min_length=1, max_length=MAX_MEALS)]
    # Only the skipped cells; every other cell is planned.
    skips: list[Skip]
    minimums: list[Minimum]
    # Whole seconds.
    solve_time_limit: Annotated[int, Field(ge=1, le=MAX_SOLVE_TIME)]


class Plan(PlanFields):
    meals: list[Meal]


def stored(db: Session) -> models.Plan:
    """The plan, made with the defaults if there is none yet."""
    loaded = [
        selectinload(models.Plan.meals).selectinload(models.PlanMeal.skips),
        selectinload(models.Plan.minimums),
    ]
    plan = db.get(models.Plan, PLAN_ID, options=loaded)
    if plan is None:
        plan = models.Plan(
            id=PLAN_ID,
            start_date=date.today(),
            days=DEFAULT_DAYS,
            meals=[models.PlanMeal(position=i, name=name) for i, name in enumerate(DEFAULT_MEALS)],
            minimums=[],
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
        solve_time_limit=plan.solve_time_limit,
    )


def _check(plan: models.Plan, body: PlanFields, checks: FieldChecks) -> None:
    """What Pydantic can't check: meal ids of other meals or given twice,
    names given twice, cells on no meal or given twice, and a minimum given
    twice for a day or above the meals the day plans. Cells and minimums
    beyond the days are not checked, as they are dropped."""
    stored_ids = {meal.id for meal in plan.meals}
    ids, names = set(), set()
    for i, meal in enumerate(body.meals):
        if meal.id is not None:
            if meal.id not in stored_ids:
                checks.add(["meals", i, "id"], "unknown_meal", "No such meal")
            elif meal.id in ids:
                checks.add(["meals", i, "id"], "duplicate", "This meal is given twice")
            ids.add(meal.id)
        if meal.name in names:
            checks.add(["meals", i, "name"], "duplicate", "Another meal has this name")
        names.add(meal.name)

    skipped = {day: set() for day in range(body.days)}
    for i, skip in enumerate(body.skips):
        if skip.day >= body.days:
            continue
        if skip.meal >= len(body.meals):
            checks.add(["skips", i, "meal"], "unknown_meal", "No such meal")
        elif skip.meal in skipped[skip.day]:
            checks.add(["skips", i], "duplicate", "This cell is given twice")
        else:
            skipped[skip.day].add(skip.meal)

    days = set()
    for i, minimum in enumerate(body.minimums):
        if minimum.day >= body.days:
            continue
        planned = len(body.meals) - len(skipped[minimum.day])
        if minimum.day in days:
            checks.add(["minimums", i, "day"], "duplicate", "This day is given twice")
        elif minimum.at_least > planned:
            checks.add(["minimums", i, "at_least"], "above_planned", f"Must be at most the {planned} planned meals")
        days.add(minimum.day)


def _fill(plan: models.Plan, body: PlanFields) -> None:
    """Replace the setup with `body`. Meals with an id are changed rather
    than replaced, as their ids stay; a stored meal left out goes, with its
    cells. Cells and minimums beyond the days are dropped."""
    plan.start_date = body.start_date
    plan.days = body.days
    plan.solve_time_limit = body.solve_time_limit
    by_id = {meal.id: meal for meal in plan.meals}
    meals = [by_id.get(meal.id) or models.PlanMeal() for meal in body.meals]
    skipped = [sorted({s.day for s in body.skips if s.meal == i and s.day < body.days}) for i in range(len(meals))]
    for position, (meal, fields, days) in enumerate(zip(meals, body.meals, skipped, strict=True)):
        meal.position = position
        meal.name = fields.name
        kept = {skip.day: skip for skip in meal.skips}
        meal.skips = [kept.get(day) or models.PlanSkip(day=day) for day in days]
    plan.meals = meals
    kept = {minimum.day: minimum for minimum in plan.minimums}
    plan.minimums = [
        _minimum(kept.get(m.day), m)
        for m in sorted(body.minimums, key=lambda m: m.day)
        if m.day < body.days
    ]


def _minimum(stored: models.PlanDayMinimum | None, fields: Minimum) -> models.PlanDayMinimum:
    # A stored minimum is changed rather than replaced, as its primary key stays.
    if stored is None:
        stored = models.PlanDayMinimum(day=fields.day)
    stored.at_least = fields.at_least
    return stored


@router.get("")
def get_plan(db: DbSession) -> Plan:
    return _response(stored(db))


@router.put("")
def update_plan(body: PlanFields, db: DbSession) -> Plan:
    plan = stored(db)
    checks = FieldChecks()
    _check(plan, body, checks)
    checks.check()
    _fill(plan, body)
    db.commit()
    return _response(plan)
