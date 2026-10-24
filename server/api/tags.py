"""/api/tags: list, create, update and delete tags (C6)."""

from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select

from .. import models
from ..db import DbSession
from .catalog import Name, commit_named, get_or_404
from .errors import NAME_IN_USE

router = APIRouter(prefix="/tags", tags=["tags"])

NOT_FOUND = {404: {"description": "No such tag"}}

# The library's DERIVE_RULES, spelled out so the API description lists them;
# a test checks that the two agree.
DeriveRule = Literal["all", "any"]


class TagFields(BaseModel):
    name: Name
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


@router.get("")
def list_tags(db: DbSession) -> list[Tag]:
    tags = db.scalars(select(models.Tag).order_by(models.Tag.id))
    return [_response(tag) for tag in tags]


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_tag(body: TagFields, db: DbSession) -> Tag:
    tag = models.Tag(**body.model_dump())
    db.add(tag)
    commit_named(db, tag, "A tag")
    return _response(tag)


@router.put("/{tag_id}", responses={**NOT_FOUND, **NAME_IN_USE})
def update_tag(tag_id: int, body: TagFields, db: DbSession) -> Tag:
    tag = get_or_404(db, models.Tag, tag_id, "tag")
    for field, value in body.model_dump().items():
        setattr(tag, field, value)
    commit_named(db, tag, "A tag")
    return _response(tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_tag(tag_id: int, db: DbSession) -> None:
    db.delete(get_or_404(db, models.Tag, tag_id, "tag"))
    db.commit()
