"""/api/plan/solve: make a plan from the setup (Make plan) or stop making it
(Cancel). One solve runs at a time; its plan becomes the unsaved one."""

import threading
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from meal_planner import ConflictReport, ModelTooLargeError, PlanRequest, SolveStatus, StopHandle
from meal_planner import plan as solve_plan

from .. import freeze, models, queries, translate
from ..db import DbSession
from . import results

router = APIRouter(prefix="/plan", tags=["plan"])

# Why a solve made no plan: the catalog has no recipes; the recipe filters
# leave none; the numbers are too large for the solver; no plan meets the
# setup; time ran out first; or it was cancelled first.
Failure = Literal["no_recipes", "no_usable_recipes", "too_large", "infeasible", "no_plan_in_time", "stopped"]

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


class ClashMember(BaseModel):
    """A rule in the clash: a Must goal, by its id and its name at the solve,
    or a day's meals that must be served (its "At least", or all planned).
    `day` (from 0) and its `date` are null for a goal over the whole plan."""

    kind: Literal["goal", "day_minimum"]
    goal_id: int | None
    name: str | None
    day: int | None
    date: date | None


class SolveOutcome(BaseModel):
    """The new unsaved plan, or why there is none. With `failure`
    "infeasible", `clash` is a set of rules that can't all hold (empty when
    the solver named none), trimmed by the library until dropping any would
    leave a plan possible. A Cancel cuts the trim short: `clash_minimal` is
    then false, as the set may hold more than it needs (also, harmlessly,
    for a Cancel just after a trim that finished)."""

    plan: results.PlanResult | None
    failure: Failure | None
    clash: list[ClashMember] | None = None
    clash_minimal: bool | None = None


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


@dataclass(frozen=True)
class _Setup:
    """What a solve uses of the setup and the catalog, as plain values: the
    request, and what the frozen copy keeps besides (`freeze.freeze`)."""

    request: PlanRequest
    start_date: date
    meal_names: list[str]
    units: dict[str, str]
    goals: list[freeze.FrozenGoal]
    # Each goal's id, in goal order, to lead a clash back to its goal.
    goal_ids: list[int]


def _read(db: DbSession) -> _Setup | Failure:
    """The setup and the whole catalog, or why there is nothing to plan
    with: no recipes, or none the recipe filters leave. The read is ended,
    so no connection waits in a transaction while the solve runs for
    minutes (Neon drops one idle for 5); as that expires the rows, only the
    plain values are kept."""
    plan = queries.plan(db)
    attributes = db.scalars(select(models.Attribute).order_by(models.Attribute.id)).all()
    tags = db.scalars(select(models.Tag).order_by(models.Tag.id)).all()
    rows = db.scalars(queries.recipes().order_by(models.Recipe.id)).all()
    only, never = translate.filter_names(plan, "only"), translate.filter_names(plan, "never")
    setup: _Setup | Failure
    if not rows:
        setup = "no_recipes"
    elif not translate.usable_recipes(rows, tags, only, never):
        # The library refuses such a request.
        setup = "no_usable_recipes"
    else:
        # Any PlanRequestError means the server let through what the library
        # refuses: a bug, so it is not caught.
        setup = _Setup(
            request=translate.plan_request(plan, attributes, tags, rows),
            start_date=plan.start_date,
            meal_names=[meal.name for meal in plan.meals],
            units={attribute.name: attribute.unit for attribute in attributes},
            goals=[
                freeze.FrozenGoal(translate.constraint_key(i), name, goal.applies_to, goal.must, goal.min, goal.max)
                for i, (goal, name) in enumerate(translate.named_goals(plan.goals))
            ],
            goal_ids=[goal.id for goal in plan.goals],
        )
    db.commit()
    return setup


def _solve(db: DbSession, stop: StopHandle) -> SolveOutcome:
    setup = _read(db)
    if isinstance(setup, str):
        return SolveOutcome(plan=None, failure=setup)
    try:
        answer = solve_plan(setup.request, stop)
    except ModelTooLargeError:
        return SolveOutcome(plan=None, failure="too_large")
    if answer.solve_status is SolveStatus.TIMEOUT_NO_SOLUTION and stop.stopped:
        return SolveOutcome(plan=None, failure="stopped")
    if answer.solve_status is SolveStatus.INFEASIBLE:
        clash = _clash(answer.conflicts or ConflictReport(()), setup)
        return SolveOutcome(plan=None, failure="infeasible", clash=clash, clash_minimal=not stop.stopped)
    if answer.solve_status is SolveStatus.TIMEOUT_NO_SOLUTION:
        return SolveOutcome(plan=None, failure="no_plan_in_time")

    result = freeze.freeze(
        setup.request, answer, setup.start_date, setup.meal_names, setup.units, setup.goals, stopped=stop.stopped
    )
    result.created_at = models.now()
    # The old unsaved plan goes first, as only one may exist.
    db.execute(delete(models.PlanResult).where(models.PlanResult.saved.is_(False)))
    db.add(result)
    db.commit()
    return SolveOutcome(plan=results.read(db, result.id), failure=None)


def _clash(report: ConflictReport, setup: _Setup) -> list[ClashMember]:
    """The report's members in the GUI's terms: goals in goal order, each by
    day (the whole plan first), then the days' meals by day. A name the
    server doesn't know is a bug, so it is not caught."""
    goals, days = [], []
    for member in report.members:
        when = None if member.day is None else setup.start_date + timedelta(days=member.day)
        position = translate.goal_position(member.constraint)
        if position is not None:
            goal = setup.goals[position]
            item = ClashMember(kind="goal", goal_id=setup.goal_ids[position], name=goal.name, day=member.day, date=when)
            goals.append(((position, -1 if member.day is None else member.day), item))
        elif member.constraint == translate.DAY_MINIMUM:
            days.append((member.day, ClashMember(kind="day_minimum", goal_id=None, name=None, day=member.day, date=when)))
        else:
            raise ValueError(f"unknown rule in a clash: {member.constraint}")
    return [item for _, item in sorted(goals, key=lambda pair: pair[0])] + [
        item for _, item in sorted(days, key=lambda pair: pair[0])
    ]
