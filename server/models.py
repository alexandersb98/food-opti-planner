"""Database tables. Every model is imported here so migrations see it."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

NAME_LENGTH = 100
UNIT_LENGTH = 20


class Attribute(Base):
    """A tracked quantity (C5). `unit` is GUI-only; `decimals` is the library's precision."""

    __tablename__ = "attributes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_LENGTH), unique=True)
    unit: Mapped[str] = mapped_column(String(UNIT_LENGTH))
    decimals: Mapped[int]


__all__ = ["Attribute", "Base"]
