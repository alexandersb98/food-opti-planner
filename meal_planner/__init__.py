"""Meal planner core (slice A): data model, model builder, CP-SAT solve."""

from .builder import ModelTooLargeError
from .domain import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef
from .planner import plan
from .request import Constraint, Day, PlanRequest, Slot
from .result import (
    ConflictMember,
    ConflictReport,
    Plan,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)

__all__ = [
    "AttributeDef", "ConflictMember", "ConflictReport", "Constraint", "Day",
    "Ingredient", "IngredientAmount", "ModelTooLargeError", "Plan", "PlanRequest",
    "PlanRequestError", "Recipe", "SlotAssignment", "Slot", "SolveStatus", "TagDef",
    "Violation", "ViolationReport", "plan",
]
