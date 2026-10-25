"""/api/plan-results: the plans the planner made (R1, and the New plan,
Today and Saved plans cards on A1). At most one is unsaved, until it is
saved or discarded or another plan replaces it (`POST /api/plan/solve`).
Each is a frozen copy, so catalog edits never change it."""

import datetime as dt
from collections import defaultdict
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import freeze, models
from ..db import DbSession
from .catalog import get_or_404
from .fields import plain

router = APIRouter(prefix="/plan-results", tags=["plan results"])

NOT_FOUND = {404: {"description": "No such plan"}}

# "optimal" for the best possible plan, "time_ran_out" for the best found
# within Max solving time.
Status = Literal["optimal", "time_ran_out"]


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


class PlanResults(BaseModel):
    unsaved: PlanResultSummary | None
    # Newest saved first.
    saved: list[PlanResultSummary]


class TodayPlan(BaseModel):
    """The plan used for `date` and that day's meals; `day` is from 0."""

    id: int
    day: int
    date: dt.date
    meals: list[ResultMeal]


def now() -> dt.datetime:
    """The time stored: UTC, without a zone, as columns hold it everywhere."""
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


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
    """The plan in full, from a row loaded with `_loaded`."""
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
    )


def _loaded():
    return select(models.PlanResult).options(
        selectinload(models.PlanResult.attributes),
        selectinload(models.PlanResult.meals).selectinload(models.PlanResultMeal.items),
        selectinload(models.PlanResult.totals),
    )


def read(db: Session, plan_id: int) -> PlanResult:
    """The response for one plan, or a 404."""
    row = db.scalars(_loaded().where(models.PlanResult.id == plan_id)).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such plan")
    return response(row)


@router.get("")
def list_plan_results(db: DbSession) -> PlanResults:
    unsaved = db.scalars(select(models.PlanResult).where(models.PlanResult.saved.is_(False))).one_or_none()
    saved = db.scalars(
        select(models.PlanResult)
        .where(models.PlanResult.saved.is_(True))
        .order_by(models.PlanResult.saved_at.desc(), models.PlanResult.id.desc())
    )
    return PlanResults(
        unsaved=None if unsaved is None else summary(unsaved),
        saved=[summary(row) for row in saved],
    )


@router.get("/today")
def today(date: dt.date, db: DbSession) -> TodayPlan | None:
    """Among the saved plans covering `date` (the browser's), the one
    chosen last: saved, or picked with Use for today."""
    chosen = db.scalars(
        select(models.PlanResult)
        .where(models.PlanResult.saved.is_(True))
        .order_by(models.PlanResult.chosen_at.desc(), models.PlanResult.id.desc())
    )
    for row in chosen:
        day = (date - row.start_date).days
        if 0 <= day < row.days:
            return TodayPlan(id=row.id, day=day, date=date, meals=read(db, row.id).meals[day])
    return None


@router.get("/{plan_id}", responses=NOT_FOUND)
def get_plan_result(plan_id: int, db: DbSession) -> PlanResult:
    return read(db, plan_id)


@router.post("/{plan_id}/save", responses={**NOT_FOUND, 409: {"description": "The plan is already saved"}})
def save_plan_result(plan_id: int, db: DbSession) -> PlanResultSummary:
    """Save the unsaved plan. It becomes the plan used for the dates it covers."""
    row = get_or_404(db, models.PlanResult, plan_id, "plan")
    if row.saved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This plan is already saved")
    row.saved = True
    row.saved_at = row.chosen_at = now()
    db.commit()
    return summary(row)


@router.post(
    "/{plan_id}/use-for-today", responses={**NOT_FOUND, 409: {"description": "The plan is not saved"}}
)
def use_plan_result_for_today(plan_id: int, db: DbSession) -> PlanResultSummary:
    """Make a saved plan the one used for the dates it covers."""
    row = get_or_404(db, models.PlanResult, plan_id, "plan")
    if not row.saved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a saved plan can be used for today")
    row.chosen_at = now()
    db.commit()
    return summary(row)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_plan_result(plan_id: int, db: DbSession) -> None:
    """Delete a saved plan, or discard the unsaved one."""
    db.delete(get_or_404(db, models.PlanResult, plan_id, "plan"))
    db.commit()
