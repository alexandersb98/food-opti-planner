"""Meal planner core (slice A): data model, model builder, CP-SAT solve."""

from .builder import ModelTooLargeError
from .constraint import Constraint
from .domain import AttributeDef, Ingredient, IngredientAmount, TagDef
from .planner import plan
from .recipe import Recipe
from .request import PlanRequest
from .result import (
    ConflictMember,
    ConflictReport,
    Plan,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)
from .schedule import Day, Slot
from .stopping import StopHandle
from .validation import PlanRequestError

__all__ = [
    "AttributeDef", "ConflictMember", "ConflictReport", "Constraint", "Day",
    "Ingredient", "IngredientAmount", "ModelTooLargeError", "Plan", "PlanRequest",
    "PlanRequestError", "Recipe", "SlotAssignment", "Slot", "SolveStatus", "StopHandle", "TagDef",
    "Violation", "ViolationReport", "plan",
]
