"""/api/plan-results: the plans the planner made (R1, and the New plan,
Today and Saved plans cards on A1). At most one is unsaved, until it is
saved or discarded or another plan replaces it (`POST /api/plan/solve`).
Each is a frozen copy, so catalog edits never change it."""

import datetime as dt

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from .. import models
from ..db import DbSession
from .catalog import get_or_404
from .results import PlanResult, PlanResultSummary, ResultMeal, read, summary

router = APIRouter(prefix="/plan-results", tags=["plan results"])

NOT_FOUND = {404: {"description": "No such plan"}}


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
    row.saved_at = row.chosen_at = models.now()
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
    row.chosen_at = models.now()
    db.commit()
    return summary(row)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_plan_result(plan_id: int, db: DbSession) -> None:
    """Delete a saved plan, or discard the unsaved one."""
    db.delete(get_or_404(db, models.PlanResult, plan_id, "plan"))
    db.commit()
