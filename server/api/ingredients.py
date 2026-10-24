"""/api/ingredients: list, read, create, update and delete ingredients (C3, C4)."""

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, status
from pydantic import BaseModel, Field, PlainSerializer, StringConstraints, WithJsonSchema
from sqlalchemy import select

from .. import models
from ..db import DbSession
from .catalog import Name, commit_named, get_or_404
from .errors import NAME_IN_USE, FieldError, invalid_fields

router = APIRouter(prefix="/ingredients", tags=["ingredients"])

NOT_FOUND = {404: {"description": "No such ingredient"}}


def _plain(number: Decimal) -> str:
    """As typed, without the zeros the database pads it with: "100", "0.5"."""
    return format(number.normalize() + 0, "f")  # + 0 turns -0 into 0


# A number as typed on the form. Sent as a JSON number or string; answered
# as a string, so it reads back exactly as it was entered. The request's
# schema is spelled out, as Pydantic versions describe decimals differently.
Number = Annotated[
    Decimal,
    Field(max_digits=models.VALUE_DIGITS, decimal_places=models.VALUE_DECIMALS),
    PlainSerializer(_plain, return_type=str),
    WithJsonSchema({"anyOf": [{"type": "number"}, {"type": "string"}]}, mode="validation"),
]


class IngredientValue(BaseModel):
    attribute_id: int
    value: Number


class IngredientFields(BaseModel):
    name: Name
    unit: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.UNIT_LENGTH)
    ]
    # Values are typed per this many units ("per 100 g").
    basis: Annotated[Number, Field(gt=0)]
    # Only the values typed in, at most one per attribute; any other
    # attribute counts as 0.
    values: list[IngredientValue]
    tag_ids: list[int]


class Ingredient(IngredientFields):
    id: int
    # How many recipes use it; it can't be deleted while any does.
    recipe_count: int


def _response(ingredient: models.Ingredient) -> Ingredient:
    # Recipes arrive in slice 6; until then no recipe uses an ingredient.
    return Ingredient(
        id=ingredient.id,
        name=ingredient.name,
        unit=ingredient.unit,
        basis=ingredient.basis,
        values=[IngredientValue(attribute_id=v.attribute_id, value=v.value) for v in ingredient.values],
        tag_ids=[tag.id for tag in ingredient.tags],
        recipe_count=0,
    )


def _fill(ingredient: models.Ingredient, body: IngredientFields, db: DbSession) -> None:
    """Set the ingredient's fields from `body`, answering 422 for attributes
    given twice and for attribute or tag ids that name nothing."""
    attribute_ids = [v.attribute_id for v in body.values]
    found_attributes = select(models.Attribute.id).where(models.Attribute.id.in_(attribute_ids))
    known_attributes = set(db.scalars(found_attributes))
    found_tags = db.scalars(select(models.Tag).where(models.Tag.id.in_(body.tag_ids)))
    tags = {tag.id: tag for tag in found_tags}

    errors = []
    for i, attribute_id in enumerate(attribute_ids):
        loc = ["body", "values", i, "attribute_id"]
        if attribute_id not in known_attributes:
            errors.append(FieldError(loc=loc, type="unknown_attribute", msg="No such attribute"))
        elif attribute_id in attribute_ids[:i]:
            errors.append(FieldError(loc=loc, type="duplicate", msg="This attribute has a value already"))
    for i, tag_id in enumerate(body.tag_ids):
        if tag_id not in tags:
            errors.append(FieldError(loc=["body", "tag_ids", i], type="unknown_tag", msg="No such tag"))
    if errors:
        raise invalid_fields(errors)

    # Loading the old values and tags must not save the new name early, or a
    # name in use would fail here instead of in commit_named.
    with db.no_autoflush:
        ingredient.name = body.name
        ingredient.unit = body.unit
        ingredient.basis = body.basis
        by_attribute = {v.attribute_id: v for v in ingredient.values}
        ingredient.values = [
            _value(by_attribute.get(v.attribute_id), v)
            for v in sorted(body.values, key=lambda v: v.attribute_id)
        ]
        ingredient.tags = [tags[tag_id] for tag_id in sorted(set(body.tag_ids))]


def _value(stored: models.IngredientValue | None, fields: IngredientValue) -> models.IngredientValue:
    # A stored value is changed rather than replaced, as its primary key stays.
    if stored is None:
        return models.IngredientValue(attribute_id=fields.attribute_id, value=fields.value)
    stored.value = fields.value
    return stored


@router.get("")
def list_ingredients(db: DbSession) -> list[Ingredient]:
    ingredients = db.scalars(select(models.Ingredient).order_by(models.Ingredient.id))
    return [_response(ingredient) for ingredient in ingredients]


@router.get("/{ingredient_id}", responses=NOT_FOUND)
def get_ingredient(ingredient_id: int, db: DbSession) -> Ingredient:
    return _response(get_or_404(db, models.Ingredient, ingredient_id, "ingredient"))


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_ingredient(body: IngredientFields, db: DbSession) -> Ingredient:
    ingredient = models.Ingredient()
    _fill(ingredient, body, db)
    db.add(ingredient)
    commit_named(db, ingredient, "An ingredient")
    return _response(ingredient)


@router.put("/{ingredient_id}", responses={**NOT_FOUND, **NAME_IN_USE})
def update_ingredient(ingredient_id: int, body: IngredientFields, db: DbSession) -> Ingredient:
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    _fill(ingredient, body, db)
    commit_named(db, ingredient, "An ingredient")
    return _response(ingredient)


@router.delete("/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_ingredient(ingredient_id: int, db: DbSession) -> None:
    db.delete(get_or_404(db, models.Ingredient, ingredient_id, "ingredient"))
    db.commit()
