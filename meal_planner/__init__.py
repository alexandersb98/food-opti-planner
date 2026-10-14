"""Meal planner core (slice A): data model, model builder, CP-SAT solve."""
from .domain import AttributeDef, Ingredient, IngredientAmount, PlanRequestError, Recipe, TagDef
from .request import Constraint, Day, PlanRequest, Slot
