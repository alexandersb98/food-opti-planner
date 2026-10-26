"""Database tables. Every model is imported here so migrations see it."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Column, ForeignKey, Index, Numeric, String, Table, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

NAME_LENGTH = 100
UNIT_LENGTH = 20
MEAL_NAME_LENGTH = 40
DERIVE_LENGTH = 3  # "all" or "any"
APPLIES_TO_LENGTH = 13  # "daily_average"
STATUS_LENGTH = 12  # "optimal", "time_ran_out", "stopped"
# Numbers typed on forms (ingredient values, value bases, ...), stored
# exactly as typed. 15 digits stay exact even in SQLite, which holds them as
# floating point.
VALUE_DIGITS = 15
VALUE_DECIMALS = 6
EXACT_NUMBER = Numeric(VALUE_DIGITS, VALUE_DECIMALS)


class Attribute(Base):
    """A tracked quantity (C5). `unit` is GUI-only; `decimals` is the library's precision."""

    __tablename__ = "attributes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_LENGTH), unique=True)
    unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))
    decimals: Mapped[int]


class Tag(Base):
    """A yes/no label (C6). `derive` is the library's rule for recipes, "all" or "any"."""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_LENGTH), unique=True)
    derive: Mapped[str] = mapped_column(String(DERIVE_LENGTH))


ingredient_tags = Table(
    "ingredient_tags",
    Base.metadata,
    Column("ingredient_id", ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Ingredient(Base):
    """Something recipes are made of (C4). `basis` is GUI-only: values are
    typed per `basis` units ("per 100 g"); the library's value is value / basis."""

    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_LENGTH), unique=True)
    unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))
    basis: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    # Only the values typed in; an attribute without one counts as 0.
    values: Mapped[list["IngredientValue"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="IngredientValue.attribute_id",
    )
    tags: Mapped[list[Tag]] = relationship(secondary=ingredient_tags, order_by=Tag.id)


class IngredientValue(Base):
    """An ingredient's value for one attribute, per the ingredient's basis."""

    __tablename__ = "ingredient_values"

    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    attribute_id: Mapped[int] = mapped_column(
        ForeignKey("attributes.id", ondelete="CASCADE"), primary_key=True
    )
    value: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    attribute: Mapped[Attribute] = relationship()


recipe_extra_tags = Table(
    "recipe_extra_tags",
    Base.metadata,
    Column("recipe_id", ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Recipe(Base):
    """A dish of fixed ingredient amounts for one portion (C2), eaten at a
    multiple of that portion: from `min_multiplier` to `max_multiplier`,
    above which `serving_cap_weight` penalizes, up to `hard_max_multiplier`
    (NULL: 3 times `max_multiplier`, the library's default). `step` NULL
    means any amount, otherwise whole steps."""

    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_LENGTH), unique=True)
    min_multiplier: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    max_multiplier: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    step: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    hard_max_multiplier: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    serving_cap_weight: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    items: Mapped[list["RecipeItem"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecipeItem.position",
    )
    # Tags added by hand; the others come from the ingredients.
    extra_tags: Mapped[list[Tag]] = relationship(secondary=recipe_extra_tags, order_by=Tag.id)


class RecipeItem(Base):
    """An amount of an ingredient in one portion of a recipe, in the
    ingredient's unit. An ingredient can't be deleted while a recipe uses it."""

    __tablename__ = "recipe_items"

    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="RESTRICT"), primary_key=True
    )
    # The order the ingredients are listed in, from 0.
    position: Mapped[int]
    amount: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    ingredient: Mapped[Ingredient] = relationship()


class Plan(Base):
    """The plan setup (A1, A2), one row. Its days are numbered from 0, from
    `start_date`; every cell of the days × meals grid is planned unless
    skipped, and every day serves all its planned meals unless it has a
    minimum. `solve_time_limit` is in whole seconds."""

    __tablename__ = "plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    start_date: Mapped[date]
    days: Mapped[int]
    solve_time_limit: Mapped[int]
    meals: Mapped[list["PlanMeal"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanMeal.position"
    )
    # Only the days with a minimum; the others are "at least: all".
    minimums: Mapped[list["PlanDayMinimum"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanDayMinimum.day"
    )
    goals: Mapped[list["Goal"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="Goal.position"
    )


class PlanMeal(Base):
    """A meal of each day ("Breakfast"). Its skipped cells refer to it by id,
    so they stay with it when it is renamed or moved, and go with it when it
    is removed. Names are unique within the plan; the API checks that, as a
    unique constraint would trip over two meals swapping names."""

    __tablename__ = "plan_meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.id", ondelete="CASCADE"))
    # The order of the meals in a day, from 0.
    position: Mapped[int]
    name: Mapped[str] = mapped_column(String(MEAL_NAME_LENGTH))
    skips: Mapped[list["PlanSkip"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanSkip.day"
    )


class PlanSkip(Base):
    """A skipped cell: no meal is planned for this meal on this day."""

    __tablename__ = "plan_skips"

    meal_id: Mapped[int] = mapped_column(
        ForeignKey("plan_meals.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[int] = mapped_column(primary_key=True)


class PlanDayMinimum(Base):
    """The fewest meals a day may serve, from 0 to its planned meals."""

    __tablename__ = "plan_day_minimums"

    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[int] = mapped_column(primary_key=True)
    at_least: Mapped[int]


class Goal(Base):
    """A bound on an attribute that the plan aims for (the library's
    constraint). `name` NULL means the generated one. `min` and `max` are
    NULL for no bound. `applies_to` is "day", "plan_total" or
    "daily_average". `importance` (1-5) is kept for a Must goal too, so
    switching back restores it. `zero_reference` is the zero-bound field,
    NULL when not needed. The last four columns have no API field yet: NULL
    importance_below/importance_above mean the goal's importance, and NULL
    guard_rail_importance the library's default (half the goal's weight)."""

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.id", ondelete="CASCADE"))
    attribute_id: Mapped[int] = mapped_column(ForeignKey("attributes.id", ondelete="CASCADE"))
    # The goals' order, from 0.
    position: Mapped[int]
    name: Mapped[str | None] = mapped_column(String(NAME_LENGTH))
    min: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    max: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    applies_to: Mapped[str] = mapped_column(String(APPLIES_TO_LENGTH))
    must: Mapped[bool]
    importance: Mapped[int] = mapped_column(default=3)
    zero_reference: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    importance_below: Mapped[int | None]
    importance_above: Mapped[int | None]
    day_guard_rail: Mapped[bool] = mapped_column(default=True)
    guard_rail_importance: Mapped[int | None]
    attribute: Mapped[Attribute] = relationship()


class PlanResult(Base):
    """A plan the planner made (R1): the unsaved one, or a saved one. A
    frozen copy of what was planned, so nothing in it refers to the catalog
    and later edits or deletes there never change it. At most one is
    unsaved. Times are UTC. `chosen_at` is set on save and by Use for today;
    the saved plan with the latest one that covers a date is that date's."""

    __tablename__ = "plan_results"
    __table_args__ = (
        Index(
            "plan_results_one_unsaved",
            "saved",
            unique=True,
            sqlite_where=text("NOT saved"),
            postgresql_where=text("NOT saved"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    saved: Mapped[bool]
    created_at: Mapped[datetime]
    saved_at: Mapped[datetime | None]
    chosen_at: Mapped[datetime | None]
    start_date: Mapped[date]
    days: Mapped[int]
    status: Mapped[str] = mapped_column(String(STATUS_LENGTH))
    attributes: Mapped[list["PlanResultAttribute"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanResultAttribute.position"
    )
    meals: Mapped[list["PlanResultMeal"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="[PlanResultMeal.day, PlanResultMeal.position]",
    )
    # Every meal's, day's and the whole plan's totals.
    totals: Mapped[list["PlanResultTotal"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanResultTotal.id"
    )
    goals: Mapped[list["PlanResultGoal"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanResultGoal.position"
    )


class PlanResultAttribute(Base):
    """An attribute as it was when the plan was made."""

    __tablename__ = "plan_result_attributes"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_result_id: Mapped[int] = mapped_column(ForeignKey("plan_results.id", ondelete="CASCADE"))
    # The attributes' order, from 0.
    position: Mapped[int]
    name: Mapped[str] = mapped_column(String(NAME_LENGTH))
    unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))
    decimals: Mapped[int]


class PlanResultMeal(Base):
    """One cell of the plan's days × meals grid. Not planned (no recipe or
    portion) when skipped in the schedule or left out by the planner."""

    __tablename__ = "plan_result_meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_result_id: Mapped[int] = mapped_column(ForeignKey("plan_results.id", ondelete="CASCADE"))
    # Days from 0; the meal's place in the day from 0.
    day: Mapped[int]
    position: Mapped[int]
    name: Mapped[str] = mapped_column(String(MEAL_NAME_LENGTH))
    planned: Mapped[bool]
    recipe: Mapped[str | None] = mapped_column(String(NAME_LENGTH))
    portion: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    items: Mapped[list["PlanResultMealItem"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanResultMealItem.position"
    )


class PlanResultMealItem(Base):
    """An ingredient of a planned meal, scaled to its portion, in the
    ingredient's unit."""

    __tablename__ = "plan_result_meal_items"

    meal_id: Mapped[int] = mapped_column(
        ForeignKey("plan_result_meals.id", ondelete="CASCADE"), primary_key=True
    )
    # The recipe's order, from 0.
    position: Mapped[int] = mapped_column(primary_key=True)
    ingredient: Mapped[str] = mapped_column(String(NAME_LENGTH))
    unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))
    amount: Mapped[Decimal] = mapped_column(EXACT_NUMBER)


class PlanResultTotal(Base):
    """An attribute's total, as the library returned it, rounded to the
    attribute's decimals: a meal's (with `meal`), a day's (with `day`) or
    the whole plan's (neither)."""

    __tablename__ = "plan_result_totals"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_result_id: Mapped[int] = mapped_column(ForeignKey("plan_results.id", ondelete="CASCADE"))
    attribute_id: Mapped[int] = mapped_column(ForeignKey("plan_result_attributes.id", ondelete="CASCADE"))
    meal_id: Mapped[int | None] = mapped_column(ForeignKey("plan_result_meals.id", ondelete="CASCADE"))
    day: Mapped[int | None]
    value: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    attribute: Mapped[PlanResultAttribute] = relationship()
    meal: Mapped[PlanResultMeal | None] = relationship()


class PlanResultGoal(Base):
    """A goal as it was when the plan was made, on the result's copy of its
    attribute. `name` is the one the plan's constraint had."""

    __tablename__ = "plan_result_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_result_id: Mapped[int] = mapped_column(ForeignKey("plan_results.id", ondelete="CASCADE"))
    attribute_id: Mapped[int] = mapped_column(ForeignKey("plan_result_attributes.id", ondelete="CASCADE"))
    # The goals' order, from 0.
    position: Mapped[int]
    name: Mapped[str] = mapped_column(String(NAME_LENGTH))
    applies_to: Mapped[str] = mapped_column(String(APPLIES_TO_LENGTH))
    must: Mapped[bool]
    min: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    max: Mapped[Decimal | None] = mapped_column(EXACT_NUMBER)
    attribute: Mapped[PlanResultAttribute] = relationship()
    misses: Mapped[list["PlanResultMiss"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlanResultMiss.id"
    )


class PlanResultMiss(Base):
    """Where the plan missed a goal's bound: on a day (`day` from 0) or over
    the whole plan (NULL). `side` is "below" or "above". The numbers are
    rounded to the attribute's decimals, `percent` to 1 decimal; a daily
    average's are per day."""

    __tablename__ = "plan_result_misses"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("plan_result_goals.id", ondelete="CASCADE"))
    day: Mapped[int | None]
    side: Mapped[str] = mapped_column(String(5))
    bound: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    actual: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    amount: Mapped[Decimal] = mapped_column(EXACT_NUMBER)
    percent: Mapped[Decimal] = mapped_column(EXACT_NUMBER)


__all__ = [
    "Attribute",
    "Base",
    "Goal",
    "Ingredient",
    "IngredientValue",
    "Plan",
    "PlanDayMinimum",
    "PlanMeal",
    "PlanResult",
    "PlanResultAttribute",
    "PlanResultGoal",
    "PlanResultMeal",
    "PlanResultMealItem",
    "PlanResultMiss",
    "PlanResultTotal",
    "PlanSkip",
    "Recipe",
    "RecipeItem",
    "Tag",
    "ingredient_tags",
    "recipe_extra_tags",
]
