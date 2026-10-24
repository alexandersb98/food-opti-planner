"""Database tables. Every model is imported here so migrations see it."""

from decimal import Decimal

from sqlalchemy import Column, ForeignKey, Numeric, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

NAME_LENGTH = 100
UNIT_LENGTH = 20
DERIVE_LENGTH = 3  # "all" or "any"
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


__all__ = [
    "Attribute",
    "Base",
    "Ingredient",
    "IngredientValue",
    "Recipe",
    "RecipeItem",
    "Tag",
    "ingredient_tags",
    "recipe_extra_tags",
]
