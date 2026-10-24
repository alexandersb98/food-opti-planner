"""GET /api/counts: how many of each catalog item there are, for the menu (C0)."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from .. import models
from ..db import DbSession

router = APIRouter()


class Counts(BaseModel):
    ingredients: int
    attributes: int
    tags: int


@router.get("/counts")
def counts(db: DbSession) -> Counts:
    def count(model: type[models.Base]) -> int:
        return db.scalar(select(func.count()).select_from(model))

    return Counts(
        ingredients=count(models.Ingredient),
        attributes=count(models.Attribute),
        tags=count(models.Tag),
    )
