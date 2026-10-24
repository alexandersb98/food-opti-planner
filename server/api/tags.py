"""/api/tags: list, create, update and delete tags (C6)."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .. import models
from ..db import DbSession
from .errors import NAME_IN_USE, name_in_use

router = APIRouter(prefix="/tags", tags=["tags"])

NOT_FOUND = {404: {"description": "No such tag"}}

# The library's DERIVE_RULES, spelled out so the API description lists them;
# a test checks that the two agree.
DeriveRule = Literal["all", "any"]


class TagFields(BaseModel):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.NAME_LENGTH)
    ]
    derive: DeriveRule


class Tag(TagFields):
    id: int
    # What deleting the tag removes it from, for the warning. No ingredient
    # having it means it was added to recipes by hand.
    ingredient_count: int
    recipe_count: int
    filter_count: int


def _response(tag: models.Tag) -> Tag:
    # Ingredients arrive in slice 5, recipes in slice 6 and plan filters in
    # slice 10; until then deleting a tag removes nothing else.
    return Tag(
        id=tag.id,
        name=tag.name,
        derive=tag.derive,
        ingredient_count=0,
        recipe_count=0,
        filter_count=0,
    )


def _get(db: DbSession, tag_id: int) -> models.Tag:
    tag = db.get(models.Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such tag")
    return tag


def _save(db: DbSession, tag: models.Tag) -> Tag:
    try:
        db.commit()
    except IntegrityError:  # the only constraint a valid body can break is the unique name
        db.rollback()
        raise name_in_use("A tag") from None
    return _response(tag)


@router.get("")
def list_tags(db: DbSession) -> list[Tag]:
    tags = db.scalars(select(models.Tag).order_by(models.Tag.id))
    return [_response(tag) for tag in tags]


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_tag(body: TagFields, db: DbSession) -> Tag:
    tag = models.Tag(**body.model_dump())
    db.add(tag)
    return _save(db, tag)


@router.put("/{tag_id}", responses={**NOT_FOUND, **NAME_IN_USE})
def update_tag(tag_id: int, body: TagFields, db: DbSession) -> Tag:
    tag = _get(db, tag_id)
    for field, value in body.model_dump().items():
        setattr(tag, field, value)
    return _save(db, tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_tag(tag_id: int, db: DbSession) -> None:
    db.delete(_get(db, tag_id))
    db.commit()
