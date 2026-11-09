"""/api/tags: list, create, update and delete tags (C6)."""

from typing import Annotated, Literal

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .. import models, tag_groups
from ..db import DbSession
from ..fields import Name
from .catalog import References, commit_named, count_by, get_or_404, in_list
from .errors import NAME_IN_USE, FieldError, FieldErrors, invalid_fields

router = APIRouter(prefix="/tags", tags=["tags"])

NOT_FOUND = {404: {"description": "No such tag"}}
SOURCE_TAG = {
    422: {"model": FieldErrors, "description": "A source tag's name can't change and it can't be deleted"}
}

# The library's DERIVE_RULES, spelled out so the API description lists them;
# a test checks that the two agree.
DeriveRule = Literal["all", "any"]


class TagFields(BaseModel):
    name: Name
    derive: DeriveRule


class TagUpdate(TagFields):
    # The complete list of the tag's other group members as wanted; null
    # (or left out) keeps the group as it is.
    equivalent_tag_ids: list[int] | None = None
    # Answers yes to every question the request raises (a 409 with
    # `questions`); without it a request that raises any changes nothing.
    confirm: bool = False


class GroupQuestions(BaseModel):
    """The 409 body when a change touches other tags: the facts of every
    question it raises, for the app to ask."""

    questions: list[Annotated[tag_groups.Question, Field(discriminator="type")]]


class TagSource(BaseModel):
    key: str
    name: str
    colour: str


class Tag(TagFields):
    id: int
    # The data source a source tag comes from (decision 12), null for a tag
    # made by hand.
    source: TagSource | None
    # The ids of every tag in this tag's group, itself included, in id order;
    # empty for a tag in no group (decision 13).
    group: list[int]
    # What deleting the tag removes it from, for the warning: the ingredients
    # that have it, the recipes it was added to by hand and the plan's recipe
    # filters on it. No ingredient having it means it was only ever added by
    # hand.
    ingredient_count: int
    recipe_count: int
    filter_count: int


def _counts(db: DbSession) -> dict[str, dict[int, int]]:
    """What deleting each tag removes it from, by response field and tag id."""
    return {
        "ingredient_count": count_by(db, models.ingredient_tags.c.tag_id),
        "recipe_count": count_by(db, models.recipe_extra_tags.c.tag_id),
        "filter_count": count_by(db, models.PlanTagFilter.tag_id),
    }


def _response(tag: models.Tag, counts: dict[str, dict[int, int]], groups: dict[int, list[int]]) -> Tag:
    return Tag(
        id=tag.id,
        name=tag.name,
        derive=tag.derive,
        source=(
            None
            if tag.source is None
            else TagSource(key=tag.source.key, name=tag.source.name, colour=tag.source.colour)
        ),
        group=[] if tag.group_id is None else groups[tag.group_id],
        **{field: by_id.get(tag.id, 0) for field, by_id in counts.items()},
    )


@router.get("")
def list_tags(db: DbSession) -> list[Tag]:
    # The tags made by hand first, so a source's many tags don't bury them.
    tags = db.scalars(
        select(models.Tag)
        .options(selectinload(models.Tag.source))
        .order_by(models.Tag.source_id.is_not(None), models.Tag.id)
    )
    counts, groups = _counts(db), tag_groups.members(db)
    return [_response(tag, counts, groups) for tag in tags]


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_tag(body: TagFields, db: DbSession) -> Tag:
    tag = models.Tag(**body.model_dump())
    db.add(tag)
    commit_named(db, tag, "A tag")
    return _response(tag, _counts(db), {})


@router.put(
    "/{tag_id}",
    response_model=Tag,
    responses={
        **NOT_FOUND,
        **SOURCE_TAG,
        409: {
            "model": FieldErrors | GroupQuestions,
            "description": "The name is already in use (`detail`), or the change needs answers (`questions`)",
        },
    },
)
def update_tag(tag_id: int, body: TagUpdate, db: DbSession) -> Tag | JSONResponse:
    tag = get_or_404(db, models.Tag, tag_id, "tag")
    if tag.source_id is not None and body.name != tag.name:
        raise invalid_fields(
            [FieldError(loc=["body", "name"], type="source_tag", msg="A source tag can't be renamed")]
        )
    equivalent = None
    if body.equivalent_tag_ids is not None:
        references = References(db)
        refs = in_list("equivalent_tag_ids", body.equivalent_tag_ids)
        found = references.rows(models.Tag, refs, "tag", unique=True)
        for loc, tag_id_given in refs:
            if tag_id_given == tag.id:
                references.error(loc, "own_tag", "A tag is equivalent to itself already")
        references.check()
        equivalent = [found[i] for i in body.equivalent_tag_ids]
    change, questions = tag_groups.plan_change(db, tag, body.derive, equivalent)
    if questions and not body.confirm:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT, content=GroupQuestions(questions=questions).model_dump()
        )
    # The group first: a name in use is found when committing, which rolls
    # the whole request back.
    tag_groups.apply_change(db, tag, change)
    tag.name = body.name
    commit_named(db, tag, "A tag")
    return _response(tag, _counts(db), tag_groups.members(db))


@router.delete(
    "/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, responses={**NOT_FOUND, **SOURCE_TAG}
)
def delete_tag(tag_id: int, db: DbSession) -> None:
    tag = get_or_404(db, models.Tag, tag_id, "tag")
    if tag.source_id is not None:
        raise invalid_fields(
            [FieldError(loc=["path", "tag_id"], type="source_tag", msg="A source tag can't be deleted")]
        )
    tag_groups.leave_group(db, tag)
    db.delete(tag)
    db.commit()
