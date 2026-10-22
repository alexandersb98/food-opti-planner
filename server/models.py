"""Database tables. Every model is imported here so migrations see it."""

from .db import Base

__all__ = ["Base"]
