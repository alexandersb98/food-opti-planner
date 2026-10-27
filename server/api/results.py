"""What the answers about a plan result share: the plan in full or in
summary, and reading it for a response. Used by the plan-results routes and
by a solve, which answers with the plan it made."""

import datetime as dt
from collections import defaultdict
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import freeze, models, queries
from ..fields import AppliesTo, plain

# "optimal" for the best possible plan, "time_ran_out" for the best found
# within Max solving time, "stopped" for the best found until cancelled.
Status = Literal["optimal", "time_ran_out", "stopped"]


class PlanResultSummary(BaseModel):
    """A plan without its days, for the cards on A1. Times are UTC."""

    id: int
    saved: bool
    status: Status
    start_date: dt.date
    days: int
    created_at: dt.datetime
    saved_at: dt.datetime | None


class ResultAttribute(BaseModel):
    name: str
    unit: str
    decimals: int


class ResultItem(BaseModel):
    """An ingredient scaled to the meal's portion, in its unit."""

    ingredient: str
    unit: str
    amount: str


class ResultMeal(BaseModel):
    """A meal of a day. Not planned (no recipe, portion, totals or items)
    when skipped in the schedule or left out by the planner."""

    name: str
    planned: bool
    recipe: str | None
    portion: str | None
    # In `attributes`' order, like every list of totals.
    totals: list[str]
    items: list[ResultItem]


class ResultGoal(BaseModel):
    """A goal as the plan was made with it. `attribute` is an index into
    `attributes`; `min` and `max` are None for no bound."""

    name: str
    attribute: int
    applies_to: AppliesTo
    must: bool
    min: str | None
    max: str | None


class ResultMiss(BaseModel):
    """Where the plan missed a goal's bound, on a `day` (from 0) or over the
    whole plan (None). `goal` is an index into `goals`; the numbers are in
    the attribute's unit, per day for a daily average. `percent` is the miss
    as a percentage of the goal's reference, to 1 decimal."""

    goal: int
    day: int | None
    side: Literal["below", "above"]
    bound: str
    actual: str
    amount: str
    percent: str


class PlanResult(PlanResultSummary):
    """One plan in full. Totals are the library's, rounded to each
    attribute's decimals; an average is the plan's total over its days."""

    attributes: list[ResultAttribute]
    totals: list[str]
    averages: list[str]
    # One list per day.
    day_totals: list[list[str]]
    # One list per day, each in the schedule's meal order.
    meals: list[list[ResultMeal]]
    # In the setup's order.
    goals: list[ResultGoal]
    # By goal, then day (the whole plan first), then below before above.
    misses: list[ResultMiss]


def _utc(time: dt.datetime | None) -> dt.datetime | None:
    return None if time is None else time.replace(tzinfo=dt.UTC)


def summary(row: models.PlanResult) -> PlanResultSummary:
    return PlanResultSummary(
        id=row.id,
        saved=row.saved,
        status=row.status,
        start_date=row.start_date,
        days=row.days,
        created_at=_utc(row.created_at),
        saved_at=_utc(row.saved_at),
    )


def response(row: models.PlanResult) -> PlanResult:
    """The plan in full, from a row loaded by `queries.plan_result`."""
    position = {a.id: i for i, a in enumerate(row.attributes)}
    # The totals by what they are of: ("meal", id), ("day", day) or ("plan",).
    totals = defaultdict(lambda: [Decimal(0)] * len(row.attributes))
    for total in row.totals:
        if total.meal_id is not None:
            key = ("meal", total.meal_id)
        elif total.day is not None:
            key = ("day", total.day)
        else:
            key = ("plan",)
        totals[key][position[total.attribute_id]] = total.value

    def answered(key) -> list[str]:
        return [plain(value) for value in totals[key]]

    meals = [[] for _ in range(row.days)]
    for meal in row.meals:
        meals[meal.day].append(
            ResultMeal(
                name=meal.name,
                planned=meal.planned,
                recipe=meal.recipe,
                portion=None if meal.portion is None else plain(meal.portion),
                totals=answered(("meal", meal.id)) if meal.planned else [],
                items=[ResultItem(ingredient=i.ingredient, unit=i.unit, amount=plain(i.amount)) for i in meal.items],
            )
        )
    misses = [
        ResultMiss(
            goal=i,
            day=miss.day,
            side=miss.side,
            bound=plain(miss.bound),
            actual=plain(miss.actual),
            amount=plain(miss.amount),
            percent=plain(miss.percent),
        )
        for i, goal in enumerate(row.goals)
        for miss in sorted(goal.misses, key=lambda m: (-1 if m.day is None else m.day, m.side != "below"))
    ]
    return PlanResult(
        **summary(row).model_dump(),
        attributes=[ResultAttribute(name=a.name, unit=a.unit, decimals=a.decimals) for a in row.attributes],
        totals=answered(("plan",)),
        averages=[
            plain(freeze.average(total, row.days, a.decimals))
            for total, a in zip(totals[("plan",)], row.attributes, strict=True)
        ],
        day_totals=[answered(("day", day)) for day in range(row.days)],
        meals=meals,
        goals=[
            ResultGoal(
                name=goal.name,
                attribute=position[goal.attribute_id],
                applies_to=goal.applies_to,
                must=goal.must,
                min=None if goal.min is None else plain(goal.min),
                max=None if goal.max is None else plain(goal.max),
            )
            for goal in row.goals
        ],
        misses=misses,
    )


def read(db: Session, plan_id: int) -> PlanResult:
    """The response for one plan, or a 404."""
    row = queries.plan_result(db, plan_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such plan")
    return response(row)
