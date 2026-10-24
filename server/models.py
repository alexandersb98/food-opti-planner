"""Database tables. Every model is imported here so migrations see it."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

NAME_LENGTH = 100
UNIT_LENGTH = 20
DERIVE_LENGTH = 3  # "all" or "any"


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


__all__ = ["Attribute", "Base", "Tag"]
