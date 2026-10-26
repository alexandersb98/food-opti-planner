"""/api/plan: read and save the plan setup (A1, A2), and make a plan from
it (Make plan) or stop making it (Cancel). There is one setup, made with
the defaults the first time it is read."""

import threading
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from meal_planner import ModelTooLargeError, SolveStatus, StopHandle
from meal_planner import plan as solve_plan

from .. import freeze, models, translate
from ..db import DbSession
from . import plan_results, recipes
from .errors import FieldError, invalid_fields
from .fields import Number

router = APIRouter(prefix="/plan", tags=["plan"])

PLAN_ID = 1
MAX_DAYS = 31
MAX_MEALS = 8
MAX_GOALS = 50
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


AppliesTo = Literal["day", "plan_total", "daily_average"]


class GoalFields(BaseModel):
    """A goal: a bound on an attribute, per day or over the plan. At least
    one of `min` and `max` is given. `importance` (1-5) is how much a Prefer
    goal weighs; a Must goal keeps its own. `zero_reference` is given exactly
    when a bound is 0 and a soft penalty is made from it (the library's
    rule, `translate.needs_zero_reference`) and is dropped otherwise."""

    # None for a goal added in the editor.
    id: int | None = None
    attribute_id: int
    min: Number | None = None
    max: Number | None = None
    applies_to: AppliesTo
    must: bool
    importance: Annotated[int, Field(ge=1, le=5)]
    zero_reference: Annotated[Number, Field(gt=0)] | None = None


class Goal(GoalFields):
    id: int
    # Generated, as the goal reads ("Protein per day").
    name: str


class PlanFields(BaseModel):
    start_date: date
    days: Annotated[int, Field(ge=1, le=MAX_DAYS)]
    # In the order of the day, names unique.
    meals: Annotated[list[MealFields], Field(min_length=1, max_length=MAX_MEALS)]
    # Only the skipped cells; every other cell is planned.
    skips: list[Skip]
    minimums: list[Minimum]
    # In the order the user keeps them in.
    goals: Annotated[list[GoalFields], Field(max_length=MAX_GOALS)]
    # Whole seconds.
    solve_time_limit: Annotated[int, Field(ge=1, le=MAX_SOLVE_TIME)]


class Plan(PlanFields):
    meals: list[Meal]
    goals: list[Goal]


def _stored(db: DbSession) -> models.Plan:
    """The plan, made with the defaults if there is none yet."""
    loaded = [
        selectinload(models.Plan.meals).selectinload(models.PlanMeal.skips),
        selectinload(models.Plan.minimums),
        selectinload(models.Plan.goals).selectinload(models.Goal.attribute),
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
                attribute_id=goal.attribute_id,
                min=goal.min,
                max=goal.max,
                applies_to=goal.applies_to,
                must=goal.must,
                importance=goal.importance,
                zero_reference=goal.zero_reference,
            )
            for goal, name in zip(plan.goals, translate.goal_names(plan.goals), strict=True)
        ],
        solve_time_limit=plan.solve_time_limit,
    )


def _errors(plan: models.Plan, body: PlanFields, attributes: dict[int, models.Attribute]) -> list[FieldError]:
    """What Pydantic can't check: meal ids of other meals or given twice,
    names given twice, cells on no meal or given twice, a minimum given twice
    for a day or above the meals the day plans, and goals that name no
    attribute, have no bound or a minimum above the maximum, lack a needed
    zero reference, have bounds finer than their attribute, or have an id of
    another goal or given twice. Cells and minimums beyond the days are not
    checked, as they are dropped."""
    errors = []

    def error(loc: list[str | int], error_type: str, msg: str) -> None:
        errors.append(FieldError(loc=["body", *loc], type=error_type, msg=msg))

    stored_ids = {meal.id for meal in plan.meals}
    ids, names = set(), set()
    for i, meal in enumerate(body.meals):
        if meal.id is not None:
            if meal.id not in stored_ids:
                error(["meals", i, "id"], "unknown_meal", "No such meal")
            elif meal.id in ids:
                error(["meals", i, "id"], "duplicate", "This meal is given twice")
            ids.add(meal.id)
        if meal.name in names:
            error(["meals", i, "name"], "duplicate", "Another meal has this name")
        names.add(meal.name)

    skipped = {day: set() for day in range(body.days)}
    for i, skip in enumerate(body.skips):
        if skip.day >= body.days:
            continue
        if skip.meal >= len(body.meals):
            error(["skips", i, "meal"], "unknown_meal", "No such meal")
        elif skip.meal in skipped[skip.day]:
            error(["skips", i], "duplicate", "This cell is given twice")
        else:
            skipped[skip.day].add(skip.meal)

    days = set()
    for i, minimum in enumerate(body.minimums):
        if minimum.day >= body.days:
            continue
        planned = len(body.meals) - len(skipped[minimum.day])
        if minimum.day in days:
            error(["minimums", i, "day"], "duplicate", "This day is given twice")
        elif minimum.at_least > planned:
            error(["minimums", i, "at_least"], "above_planned", f"Must be at most the {planned} planned meals")
        days.add(minimum.day)

    stored_goals = {goal.id for goal in plan.goals}
    goal_ids = set()
    for i, goal in enumerate(body.goals):
        if goal.id is not None:
            if goal.id not in stored_goals:
                error(["goals", i, "id"], "unknown_goal", "No such goal")
            elif goal.id in goal_ids:
                error(["goals", i, "id"], "duplicate", "This goal is given twice")
            goal_ids.add(goal.id)
        attribute = attributes.get(goal.attribute_id)
        if attribute is None:
            error(["goals", i, "attribute_id"], "unknown_attribute", "No such attribute")
        if goal.min is None and goal.max is None:
            error(["goals", i, "min"], "no_bound", "Give a minimum, a maximum or both")
        elif goal.min is not None and goal.max is not None and goal.min > goal.max:
            error(["goals", i, "min"], "min_above_max", "Must be at most the maximum")
        if attribute is not None:
            for field in ("min", "max"):
                bound = getattr(goal, field)
                if bound is not None and _decimals(bound) > attribute.decimals:
                    error(["goals", i, field], "too_many_decimals", f"{attribute.name} has {attribute.decimals} decimals")
        if goal.zero_reference is None and translate.needs_zero_reference(goal.applies_to, goal.must, goal.min, goal.max):
            error(["goals", i, "zero_reference"], "needs_reference", "Needed when a bound is 0")
    return errors


def _decimals(number: Decimal) -> int:
    """The decimal places of `number` as typed, not counting trailing zeros."""
    return max(0, -number.normalize().as_tuple().exponent)


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
    by_id = {goal.id: goal for goal in plan.goals}
    plan.goals = [
        _goal(by_id.get(fields.id), position, fields) for position, fields in enumerate(body.goals)
    ]


def _minimum(stored: models.PlanDayMinimum | None, fields: Minimum) -> models.PlanDayMinimum:
    # A stored minimum is changed rather than replaced, as its primary key stays.
    if stored is None:
        stored = models.PlanDayMinimum(day=fields.day)
    stored.at_least = fields.at_least
    return stored


def _goal(stored: models.Goal | None, position: int, fields: GoalFields) -> models.Goal:
    # A stored goal is changed rather than replaced, as its id and the
    # columns the API doesn't have yet stay.
    goal = stored or models.Goal()
    goal.position = position
    goal.attribute_id = fields.attribute_id
    goal.min = fields.min
    goal.max = fields.max
    goal.applies_to = fields.applies_to
    goal.must = fields.must
    goal.importance = fields.importance
    needed = translate.needs_zero_reference(fields.applies_to, fields.must, fields.min, fields.max)
    goal.zero_reference = fields.zero_reference if needed else None
    return goal


@router.get("")
def get_plan(db: DbSession) -> Plan:
    return _response(_stored(db))


@router.put("")
def update_plan(body: PlanFields, db: DbSession) -> Plan:
    plan = _stored(db)
    attributes = {a.id: a for a in db.scalars(select(models.Attribute))}
    errors = _errors(plan, body, attributes)
    if errors:
        raise invalid_fields(errors)
    _fill(plan, body)
    db.commit()
    return _response(plan)


# Why a solve made no plan: the catalog has no recipes; the numbers are too
# large for the solver; no plan meets the setup; time ran out first; or it
# was cancelled first.
Failure = Literal["no_recipes", "too_large", "infeasible", "no_plan_in_time", "stopped"]
FAILURES: dict[SolveStatus, Failure] = {
    SolveStatus.INFEASIBLE: "infeasible",
    SolveStatus.TIMEOUT_NO_SOLUTION: "no_plan_in_time",
}

BUSY = {409: {"description": "A plan is already being made"}}


# The client names its solve, so a Cancel says which solve it means. Both
# requests carry the same id, which only has to tell one solve from the
# next; the client makes it.
SOLVE_ID_LENGTH = 64


class SolveId(BaseModel):
    """Which solve a request is about."""

    solve_id: str = Field(min_length=1, max_length=SOLVE_ID_LENGTH)


class RunningSolve:
    """The one solve a server process runs at a time, named by its solve id,
    and its stop handle. One process is enough, as Cloud Run runs one
    instance."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._id: str | None = None
        self._stop: StopHandle | None = None
        # A solve cancelled before it reached the server, remembered so the
        # Cancel is not lost in that instant.
        self._cancelled: str | None = None

    def begin(self, solve_id: str) -> StopHandle | None:
        """The new solve's handle, or None while another solve runs. The
        handle comes stopped if this solve was cancelled before it got
        here, which ends it as it starts."""
        with self._lock:
            if self._stop is not None:
                return None
            stop = StopHandle()
            if self._cancelled == solve_id:
                self._cancelled = None
                stop.stop()
            self._id, self._stop = solve_id, stop
            return stop

    def end(self) -> None:
        with self._lock:
            self._id = self._stop = None

    def cancel(self, solve_id: str) -> None:
        """Stop the solve named `solve_id`. Another solve is left alone: a
        Cancel that crosses the answer must not stop the next solve."""
        with self._lock:
            if self._id == solve_id:
                stop = self._stop
            else:
                # Still on its way, or long over. Remembering it stops the
                # first; an id that never comes back is forgotten by the
                # next Cancel, and means nothing until then.
                stop, self._cancelled = None, solve_id
        if stop is not None:
            stop.stop()


def _running(request: Request) -> RunningSolve:
    return request.app.state.running_solve


Running = Annotated[RunningSolve, Depends(_running)]


class SolveOutcome(BaseModel):
    """The new unsaved plan, or why there is none."""

    plan: plan_results.PlanResult | None
    failure: Failure | None


@router.post("/solve", responses=BUSY)
def solve(body: SolveId, db: DbSession, running: Running) -> SolveOutcome:
    """Make a plan from the setup and the whole catalog, within the setup's
    time limit or until cancelled. A plan replaces the unsaved one; without
    a plan nothing is stored, and the unsaved plan stays. Runs inside the
    request, one at a time."""
    stop = running.begin(body.solve_id)
    if stop is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A plan is already being made")
    try:
        return _solve(db, stop)
    finally:
        running.end()


@router.post("/solve/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel(body: SolveId, running: Running) -> None:
    """Stop the solve `solve_id` names, which then answers with the best
    plan found so far. A Cancel that arrives first stops it as it starts;
    one for any other solve does nothing, as it may cross the answer."""
    running.cancel(body.solve_id)


def _solve(db: DbSession, stop: StopHandle) -> SolveOutcome:
    plan = _stored(db)
    attributes = db.scalars(select(models.Attribute).order_by(models.Attribute.id)).all()
    tags = db.scalars(select(models.Tag).order_by(models.Tag.id)).all()
    rows = db.scalars(recipes.loaded().order_by(models.Recipe.id)).all()
    if not rows:
        return SolveOutcome(plan=None, failure="no_recipes")
    # Any PlanRequestError means the server let through what the library
    # refuses: a bug, so it is not caught.
    request = translate.plan_request(plan, attributes, tags, rows)
    start_date = plan.start_date
    meal_names = [meal.name for meal in plan.meals]
    units = {attribute.name: attribute.unit for attribute in attributes}
    # End the read before solving, so no connection waits in a transaction
    # for minutes (Neon drops one idle for 5). Only the plain values above
    # are used after this, as the commit expires the rows.
    db.commit()
    try:
        answer = solve_plan(request, stop)
    except ModelTooLargeError:
        return SolveOutcome(plan=None, failure="too_large")
    if answer.solve_status is SolveStatus.TIMEOUT_NO_SOLUTION and stop.stopped:
        return SolveOutcome(plan=None, failure="stopped")
    if answer.solve_status in FAILURES:
        return SolveOutcome(plan=None, failure=FAILURES[answer.solve_status])

    result = freeze.freeze(request, answer, start_date, meal_names, units, stopped=stop.stopped)
    result.created_at = plan_results.now()
    # The old unsaved plan goes first, as only one may exist.
    db.execute(delete(models.PlanResult).where(models.PlanResult.saved.is_(False)))
    db.add(result)
    db.commit()
    return SolveOutcome(plan=plan_results.read(db, result.id), failure=None)
