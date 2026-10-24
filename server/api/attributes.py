"""/api/attributes: list, create, update and delete attributes (C5)."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meal_planner.domain import MAX_PRECISION, MIN_PRECISION

from .. import models
from ..db import DbSession
from .errors import NAME_IN_USE, name_in_use

router = APIRouter(prefix="/attributes", tags=["attributes"])

NOT_FOUND = {404: {"description": "No such attribute"}}


class AttributeFields(BaseModel):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.NAME_LENGTH)
    ]
    unit: Annotated[str, StringConstraints(strip_whitespace=True, max_length=models.UNIT_LENGTH)]
    decimals: Annotated[int, Field(ge=MIN_PRECISION, le=MAX_PRECISION)]


class Attribute(AttributeFields):
    id: int
    # What deleting the attribute removes, for the warning.
    ingredient_count: int
    goal_count: int


def _response(attribute: models.Attribute) -> Attribute:
    # Ingredient values arrive in slice 5 and goals in slice 8; until then
    # deleting an attribute removes nothing else.
    return Attribute(
        id=attribute.id,
        name=attribute.name,
        unit=attribute.unit,
        decimals=attribute.decimals,
        ingredient_count=0,
        goal_count=0,
    )


def _get(db: DbSession, attribute_id: int) -> models.Attribute:
    attribute = db.get(models.Attribute, attribute_id)
    if attribute is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such attribute")
    return attribute


def _save(db: DbSession, attribute: models.Attribute) -> Attribute:
    try:
        db.commit()
    except IntegrityError:  # the only constraint a valid body can break is the unique name
        db.rollback()
        raise name_in_use("An attribute") from None
    return _response(attribute)


@router.get("")
def list_attributes(db: DbSession) -> list[Attribute]:
    attributes = db.scalars(select(models.Attribute).order_by(models.Attribute.id))
    return [_response(attribute) for attribute in attributes]


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_attribute(body: AttributeFields, db: DbSession) -> Attribute:
    attribute = models.Attribute(**body.model_dump())
    db.add(attribute)
    return _save(db, attribute)


@router.put("/{attribute_id}", responses={**NOT_FOUND, **NAME_IN_USE})
def update_attribute(attribute_id: int, body: AttributeFields, db: DbSession) -> Attribute:
    attribute = _get(db, attribute_id)
    for field, value in body.model_dump().items():
        setattr(attribute, field, value)
    return _save(db, attribute)


@router.delete("/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_attribute(attribute_id: int, db: DbSession) -> None:
    db.delete(_get(db, attribute_id))
    db.commit()
