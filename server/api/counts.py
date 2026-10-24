"""GET /api/counts: how many of each catalog item there are, for the menu (C0)."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from .. import models
from ..db import DbSession

router = APIRouter()


class Counts(BaseModel):
    attributes: int


@router.get("/counts")
def counts(db: DbSession) -> Counts:
    return Counts(attributes=db.scalar(select(func.count()).select_from(models.Attribute)))
