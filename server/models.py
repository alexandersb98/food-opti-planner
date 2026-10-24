"""Database tables. Every model is imported here so migrations see it."""

from decimal import Decimal

from sqlalchemy import Column, ForeignKey, Numeric, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

NAME_LENGTH = 100
UNIT_LENGTH = 20
DERIVE_LENGTH = 3  # "all" or "any"
# Ingredient values and value bases, stored exactly as typed. 15 digits stay
# exact even in SQLite, which holds them as floating point.
VALUE_DIGITS = 15
VALUE_DECIMALS = 6


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
    basis: Mapped[Decimal] = mapped_column(Numeric(VALUE_DIGITS, VALUE_DECIMALS))
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
    value: Mapped[Decimal] = mapped_column(Numeric(VALUE_DIGITS, VALUE_DECIMALS))
    attribute: Mapped[Attribute] = relationship()


__all__ = ["Attribute", "Base", "Ingredient", "IngredientValue", "Tag", "ingredient_tags"]
