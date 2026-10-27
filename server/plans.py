"""The plan setup (A1, A2): what a valid setup is and how a saved one
changes. `PlanFields` is the setup as given, checked by Pydantic; the checks
Pydantic can't make (`errors`, `filter_errors`) and the update of the stored
rows (`fill`) are plain functions of it and the model objects, with no
database or HTTP, so each can be tested on its own. The route in `api/plan`
loads the rows, calls these and answers, with its own models for what it
answers."""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from . import models, translate
from .fields import AppliesTo, Number

MAX_DAYS = 31
MAX_MEALS = 8
MAX_GOALS = 50
# The 5-minute ceiling: the solve runs inside the request.
MAX_SOLVE_TIME = 300

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


class Skip(BaseModel):
    """A skipped cell. `meal` is the meal's position in `meals`."""

    day: DayIndex
    meal: Annotated[int, Field(ge=0)]


class Minimum(BaseModel):
    """The fewest meals a day may serve. A day without one serves all its
    planned meals ("at least: all")."""

    day: DayIndex
    at_least: Annotated[int, Field(ge=0)]


GoalName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.NAME_LENGTH)]
Importance = Annotated[int, Field(ge=1, le=5)]


class GoalFields(BaseModel):
    """A goal: a bound on an attribute, per day or over the plan. At least
    one of `min` and `max` is given. `importance` (1-5) is how much a Prefer
    goal weighs; a Must goal keeps its own. `zero_reference` is given exactly
    when a bound is 0 and a soft penalty is made from it (the library's
    rule, `translate.needs_zero_reference`) and is dropped otherwise.

    The advanced settings: `custom_name` is the name the user typed, unique
    among the goals, None to follow the generated one. `importance_below`
    and `importance_above` weigh each side of a Prefer goal with both
    bounds (None: the goal's importance) and are dropped for other goals.
    `day_guard_rail` keeps each day of a daily average in range too, at
    `guard_rail_importance` (None: follows the goal's, `translate.constraint`);
    other goals keep it on, and without the guard-rail its importance is
    dropped."""

    # None for a goal added in the editor.
    id: int | None = None
    attribute_id: int
    min: Number | None = None
    max: Number | None = None
    applies_to: AppliesTo
    must: bool
    importance: Importance
    zero_reference: Annotated[Number, Field(gt=0)] | None = None
    custom_name: GoalName | None = None
    importance_below: Importance | None = None
    importance_above: Importance | None = None
    day_guard_rail: bool = True
    guard_rail_importance: Importance | None = None


# The fields a goal row and its API fields share, copied as they are. The
# custom name is the row's `name`.
GOAL_FIELDS = [field for field in GoalFields.model_fields if field not in ("id", "custom_name")]


FilterMode = Literal["only", "never"]


class TagFilter(BaseModel):
    """A recipe filter: "only" keeps just the recipes with the tag, "never"
    the recipes without it. A tag without one is Any."""

    tag_id: int
    mode: FilterMode


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
    # Required, so a body without them is refused rather than removing them.
    # Answered in tag id order.
    tag_filters: list[TagFilter]
    # Whole seconds.
    solve_time_limit: Annotated[int, Field(ge=1, le=MAX_SOLVE_TIME)]


@dataclass(frozen=True)
class Problem:
    """A field of the setup that is wrong, where Pydantic would put it:
    `loc` is its path in the setup (["meals", 0, "name"]), `type` what is
    wrong ("duplicate") and `msg` the message to show."""

    loc: tuple[str | int, ...]
    type: str
    msg: str


def errors(
    plan: models.Plan, setup: PlanFields, attributes: dict[int, models.Attribute], tags: dict[int, models.Tag]
) -> list[Problem]:
    """What Pydantic can't check, section by section. Cells and minimums
    beyond the days are not checked, as they are dropped."""
    skipped, skip_errors = _skip_errors(setup)
    return [
        *_meal_errors(plan, setup),
        *skip_errors,
        *_minimum_errors(setup, skipped),
        *_goal_errors(plan.goals, setup.goals, attributes),
        *filter_errors(setup.tag_filters, tags),
    ]


def _error(loc: list[str | int], error_type: str, msg: str) -> Problem:
    return Problem(loc=tuple(loc), type=error_type, msg=msg)


def _meal_errors(plan: models.Plan, setup: PlanFields) -> list[Problem]:
    """Meal ids of other meals or given twice, and names given twice."""
    errors = []
    stored_ids = {meal.id for meal in plan.meals}
    ids, names = set(), set()
    for i, meal in enumerate(setup.meals):
        if meal.id is not None:
            if meal.id not in stored_ids:
                errors.append(_error(["meals", i, "id"], "unknown_meal", "No such meal"))
            elif meal.id in ids:
                errors.append(_error(["meals", i, "id"], "duplicate", "This meal is given twice"))
            ids.add(meal.id)
        if meal.name in names:
            errors.append(_error(["meals", i, "name"], "duplicate", "Another meal has this name"))
        names.add(meal.name)
    return errors


def _skip_errors(setup: PlanFields) -> tuple[dict[int, set[int]], list[Problem]]:
    """The skipped meals of each day, and the cells on no meal or given twice."""
    errors = []
    skipped = {day: set() for day in range(setup.days)}
    for i, skip in enumerate(setup.skips):
        if skip.day >= setup.days:
            continue
        if skip.meal >= len(setup.meals):
            errors.append(_error(["skips", i, "meal"], "unknown_meal", "No such meal"))
        elif skip.meal in skipped[skip.day]:
            errors.append(_error(["skips", i], "duplicate", "This cell is given twice"))
        else:
            skipped[skip.day].add(skip.meal)
    return skipped, errors


def _minimum_errors(setup: PlanFields, skipped: dict[int, set[int]]) -> list[Problem]:
    """A minimum given twice for a day, or above the meals the day plans."""
    errors = []
    days = set()
    for i, minimum in enumerate(setup.minimums):
        if minimum.day >= setup.days:
            continue
        planned = len(setup.meals) - len(skipped[minimum.day])
        if minimum.day in days:
            errors.append(_error(["minimums", i, "day"], "duplicate", "This day is given twice"))
        elif minimum.at_least > planned:
            errors.append(
                _error(["minimums", i, "at_least"], "above_planned", f"Must be at most the {planned} planned meals")
            )
        days.add(minimum.day)
    return errors


def _goal_errors(
    stored_goals: Sequence[models.Goal], goals: Sequence[GoalFields], attributes: dict[int, models.Attribute]
) -> list[Problem]:
    """Goal ids of other goals or given twice, typed names given twice, and
    each goal's own errors."""
    errors = []
    by_id = {goal.id: goal for goal in stored_goals}
    # Each goal with a name another has is marked, so the editor of either
    # goal finds the error on its own.
    names = Counter(goal.custom_name for goal in goals if goal.custom_name is not None)
    ids = set()
    for i, goal in enumerate(goals):
        if goal.id is not None:
            if goal.id not in by_id:
                errors.append(_error(["goals", i, "id"], "unknown_goal", "No such goal"))
            elif goal.id in ids:
                errors.append(_error(["goals", i, "id"], "duplicate", "This goal is given twice"))
            ids.add(goal.id)
        if goal.custom_name is not None and names[goal.custom_name] > 1:
            errors.append(_error(["goals", i, "custom_name"], "duplicate", "Another goal has this name"))
        errors += _one_goal_errors(i, goal, by_id.get(goal.id), attributes)
    return errors


def _one_goal_errors(
    i: int, goal: GoalFields, stored: models.Goal | None, attributes: dict[int, models.Attribute]
) -> list[Problem]:
    """A goal that names no attribute, has no bound or a minimum above the
    maximum, has bounds finer than its attribute, or lacks a needed zero
    reference."""
    errors = []

    def error(field: str, error_type: str, msg: str) -> None:
        errors.append(_error(["goals", i, field], error_type, msg))

    attribute = attributes.get(goal.attribute_id)
    if attribute is None:
        error("attribute_id", "unknown_attribute", "No such attribute")
    if goal.min is None and goal.max is None:
        error("min", "no_bound", "Give a minimum, a maximum or both")
    elif goal.min is not None and goal.max is not None and goal.min > goal.max:
        error("min", "min_above_max", "Must be at most the maximum")
    # A stored goal is not held to a later cut in its attribute's decimals
    # unless its attribute or a bound changes.
    unchanged = stored is not None and (stored.attribute_id, stored.min, stored.max) == (goal.attribute_id, goal.min, goal.max)
    if attribute is not None and not unchanged:
        for field in ("min", "max"):
            bound = getattr(goal, field)
            if bound is not None and _decimals(bound) > attribute.decimals:
                error(field, "too_many_decimals", f"{attribute.name} has {attribute.decimals} decimals")
    needed = translate.needs_zero_reference(goal.applies_to, goal.must, goal.day_guard_rail, goal.min, goal.max)
    if goal.zero_reference is None and needed:
        error("zero_reference", "needs_reference", "Needed when a bound is 0 or below")
    return errors


def filter_errors(filters: Sequence[TagFilter], tags: dict[int, models.Tag]) -> list[Problem]:
    """Filters on no tag, or on a tag given twice."""
    errors = []
    ids = set()
    for i, tag_filter in enumerate(filters):
        if tag_filter.tag_id not in tags:
            errors.append(_error(["tag_filters", i, "tag_id"], "unknown_tag", "No such tag"))
        elif tag_filter.tag_id in ids:
            errors.append(_error(["tag_filters", i, "tag_id"], "duplicate", "This tag is given twice"))
        ids.add(tag_filter.tag_id)
    return errors


def _decimals(number: Decimal) -> int:
    """The decimal places of `number` as typed, not counting trailing zeros."""
    return max(0, -number.normalize().as_tuple().exponent)


def fill(plan: models.Plan, setup: PlanFields) -> None:
    """Replace the stored setup with `setup`, section by section. A stored
    row that is kept is changed rather than replaced, as its id stays."""
    plan.start_date = setup.start_date
    plan.days = setup.days
    plan.solve_time_limit = setup.solve_time_limit
    _fill_meals(plan, setup)
    _fill_minimums(plan, setup)
    _fill_goals(plan, setup)
    _fill_tag_filters(plan, setup)


def _fill_meals(plan: models.Plan, setup: PlanFields) -> None:
    """Meals with an id are changed; a stored meal left out goes, with its
    cells. Cells beyond the days are dropped."""
    by_id = {meal.id: meal for meal in plan.meals}
    meals = [by_id.get(meal.id) or models.PlanMeal() for meal in setup.meals]
    skipped = [sorted({s.day for s in setup.skips if s.meal == i and s.day < setup.days}) for i in range(len(meals))]
    for position, (meal, fields, days) in enumerate(zip(meals, setup.meals, skipped, strict=True)):
        meal.position = position
        meal.name = fields.name
        kept = {skip.day: skip for skip in meal.skips}
        meal.skips = [kept.get(day) or models.PlanSkip(day=day) for day in days]
    plan.meals = meals


def _fill_minimums(plan: models.Plan, setup: PlanFields) -> None:
    """Minimums beyond the days are dropped."""
    kept = {minimum.day: minimum for minimum in plan.minimums}
    plan.minimums = [
        _minimum(kept.get(m.day), m)
        for m in sorted(setup.minimums, key=lambda m: m.day)
        if m.day < setup.days
    ]


def _fill_goals(plan: models.Plan, setup: PlanFields) -> None:
    by_id = {goal.id: goal for goal in plan.goals}
    plan.goals = [
        _goal(by_id.get(fields.id), position, fields) for position, fields in enumerate(setup.goals)
    ]


def _fill_tag_filters(plan: models.Plan, setup: PlanFields) -> None:
    """In tag id order. A stored filter is changed rather than replaced, as
    its primary key stays."""
    kept = {f.tag_id: f for f in plan.tag_filters}
    filters = []
    for fields in sorted(setup.tag_filters, key=lambda f: f.tag_id):
        tag_filter = kept.get(fields.tag_id) or models.PlanTagFilter(tag_id=fields.tag_id)
        tag_filter.mode = fields.mode
        filters.append(tag_filter)
    plan.tag_filters = filters


def _minimum(stored: models.PlanDayMinimum | None, fields: Minimum) -> models.PlanDayMinimum:
    # A stored minimum is changed rather than replaced, as its primary key stays.
    if stored is None:
        stored = models.PlanDayMinimum(day=fields.day)
    stored.at_least = fields.at_least
    return stored


def _goal(stored: models.Goal | None, position: int, fields: GoalFields) -> models.Goal:
    """The goal row for `fields`, keeping only the settings that apply: a
    zero reference when needed, importance below and above for a Prefer goal
    with both bounds, the guard-rail settings for a daily average (others
    keep the defaults), its importance while it is on. So a setting the
    editor hides never changes a plan."""
    # A stored goal is changed rather than replaced, as its id stays.
    goal = stored or models.Goal()
    goal.position = position
    goal.name = fields.custom_name
    for field in GOAL_FIELDS:
        setattr(goal, field, getattr(fields, field))
    split = not fields.must and fields.min is not None and fields.max is not None
    if not split:
        goal.importance_below = goal.importance_above = None
    average = fields.applies_to == "daily_average"
    if not average:
        goal.day_guard_rail = True
    if not (average and fields.day_guard_rail):
        goal.guard_rail_importance = None
    needed = translate.needs_zero_reference(fields.applies_to, fields.must, goal.day_guard_rail, fields.min, fields.max)
    goal.zero_reference = fields.zero_reference if needed else None
    return goal
