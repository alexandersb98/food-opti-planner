"""/api/ingredients: list, read, create, update and delete ingredients (C3, C4)."""

from typing import Annotated

from fastapi import APIRouter, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from .. import models
from ..db import DbSession
from .catalog import References, commit_named, get_or_404, in_list
from .errors import NAME_IN_USE
from .fields import Name, Number

router = APIRouter(prefix="/ingredients", tags=["ingredients"])

NOT_FOUND = {404: {"description": "No such ingredient"}}


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
    refs = References(db)
    attribute_ids = [v.attribute_id for v in body.values]
    refs.rows(models.Attribute, in_list("values", attribute_ids, "attribute_id"), "attribute", unique=True)
    tags = refs.rows(models.Tag, in_list("tag_ids", body.tag_ids), "tag")
    refs.check()

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
