"""/api/ingredients: list, read, create, update and delete ingredients (C3, C4),
add one from a data source's food (C7) and unlink it from its source."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from .. import models, source_values, unit_change, units
from ..db import DbSession
from ..fields import Name, Number
from .catalog import References, commit_named, get_or_404, in_list
from .errors import NAME_IN_USE, FieldError, FieldErrors, invalid_fields
from .unit_changes import UNIT_CHANGE_REFUSED, UnitChange, UnitChangeRefusal, answer, refuse

router = APIRouter(prefix="/ingredients", tags=["ingredients"])

NOT_FOUND = {404: {"description": "No such ingredient"}}
UNPROCESSABLE = {422: {"description": "An energy unit, or an unknown attribute or tag"}}
UPDATE_UNPROCESSABLE = {
    422: {
        **UNIT_CHANGE_REFUSED[422],
        "description": "An energy unit, a non-mass unit for an ingredient from a data source, "
        "an unknown attribute or tag, or a conversion that would lose precision or a number's range",
    }
}
UNIT_NOT_FOR_INGREDIENT = "An ingredient is measured in an amount of food, such as g, dl or pieces."
UNIT_NOT_FOR_SOURCE = (
    "An ingredient from a data source can only be measured in a mass unit such as g or kg, "
    "as the source's values are per 100 g of food."
)
FROM_SOURCE_UNPROCESSABLE = {
    422: {
        "model": FieldErrors,
        "description": "An unknown or withdrawn food, a tag that is not one of the food's, "
        "or an unknown tag",
    }
}
NOT_LINKED = {422: {"model": FieldErrors, "description": "The ingredient is not from a data source"}}
IN_USE = {409: {"description": "Recipes use the ingredient, so it can't be deleted"}}


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


class IngredientUnitChange(BaseModel):
    unit: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.UNIT_LENGTH)
    ]
    # What the form is about to save too; the stored basis if left out.
    basis: Annotated[Number, Field(gt=0)] | None = None


class IngredientSource(BaseModel):
    """The data source food an ingredient is linked to."""

    key: str
    name: str
    colour: str
    food_id: int
    food_name: str
    withdrawn: bool


class IngredientFromSource(BaseModel):
    """Add from data source: the food and what the user chose in the preview.
    The unit, basis and values are the server's to work out."""

    food_id: int
    name: Name
    # Only source tags of the food: the ones the user left on.
    tag_ids: list[int]


class UpdatedValue(BaseModel):
    """A value the source has moved on from: what the ingredient has now (null:
    nothing) and what it would get, both in the ingredient's basis."""

    attribute_id: int
    value: Number | None
    new_value: Number


class SourceValuesAnswer(BaseModel):
    """Accept the updated values, or keep the ingredient's own."""

    model_config = ConfigDict(extra="forbid")

    answer: Literal["accept", "keep"]


class Ingredient(IngredientFields):
    id: int
    # How many recipes use it; it can't be deleted while any does.
    recipe_count: int
    # Null for an ingredient with no link to a source food.
    source: IngredientSource | None
    # The values of its source that differ from what it last copied or
    # answered, by attribute id; empty for an ingredient with no link.
    updated_values: list[UpdatedValue]


def _recipe_counts(db: DbSession) -> dict[int, int]:
    """Recipes, not lines: an ingredient on two lines of a recipe counts once."""
    rows = db.execute(
        select(models.RecipeItem.ingredient_id, func.count(distinct(models.RecipeSection.recipe_id)))
        .join(models.RecipeSection, models.RecipeSection.id == models.RecipeItem.section_id)
        .group_by(models.RecipeItem.ingredient_id)
    )
    return dict(rows.all())


def _source(ingredient: models.Ingredient) -> IngredientSource | None:
    food = ingredient.source_food
    if food is None:
        return None
    return IngredientSource(
        key=food.source.key,
        name=food.source.name,
        colour=food.source.colour,
        food_id=food.id,
        food_name=food.name,
        withdrawn=food.withdrawn,
    )


def _unit_refusal(ingredient: models.Ingredient, unit: str) -> tuple[str, str] | None:
    """The type and message of the rule `unit` breaks for this ingredient, if
    any: an energy unit (one refusal per field, so first), or a linked
    ingredient's unit that is not a mass unit (its values are per 100 g)."""
    parsed = units.parse(unit)
    if parsed is not None and parsed.category == "energy":
        return "unit_not_for_ingredient", UNIT_NOT_FOR_INGREDIENT
    if ingredient.source_food_id is not None and (parsed is None or parsed.category != "mass"):
        return "unit_not_for_source", UNIT_NOT_FOR_SOURCE
    return None


def _response(
    ingredient: models.Ingredient,
    recipe_counts: dict[int, int],
    updates: dict[int, list[source_values.Update]],
) -> Ingredient:
    return Ingredient(
        id=ingredient.id,
        name=ingredient.name,
        unit=ingredient.unit,
        basis=ingredient.basis,
        values=[IngredientValue(attribute_id=v.attribute_id, value=v.value) for v in ingredient.values],
        tag_ids=[tag.id for tag in ingredient.tags],
        recipe_count=recipe_counts.get(ingredient.id, 0),
        source=_source(ingredient),
        updated_values=[
            UpdatedValue(attribute_id=u.attribute_id, value=u.current, new_value=u.proposed)
            for u in updates.get(ingredient.id, [])
        ],
    )


def _one(db: DbSession, ingredient: models.Ingredient) -> Ingredient:
    """The answer for one ingredient, with its updates as they stand now."""
    return _response(ingredient, _recipe_counts(db), source_values.updates_for(db, [ingredient]))


def _fill(ingredient: models.Ingredient, body: IngredientFields, db: DbSession) -> None:
    """Set the ingredient's fields from `body`, answering 422 for an energy
    unit, a unit a linked ingredient can't have, attributes given twice and
    attribute or tag ids that name nothing."""
    refs = References(db)
    attribute_ids = [v.attribute_id for v in body.values]
    refs.rows(models.Attribute, in_list("values", attribute_ids, "attribute_id"), "attribute", unique=True)
    tags = refs.rows(models.Tag, in_list("tag_ids", body.tag_ids), "tag")
    refused = _unit_refusal(ingredient, body.unit)
    if refused:
        refs.error(["unit"], *refused)
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
    ingredients = db.scalars(
        select(models.Ingredient)
        .options(
            selectinload(models.Ingredient.values),
            selectinload(models.Ingredient.tags),
            selectinload(models.Ingredient.source_food).selectinload(models.SourceFood.source),
        )
        .order_by(models.Ingredient.id)
    )
    ingredients = list(ingredients)
    recipe_counts, updates = _recipe_counts(db), source_values.updates_for(db, ingredients)
    return [_response(ingredient, recipe_counts, updates) for ingredient in ingredients]


@router.get("/{ingredient_id}", responses=NOT_FOUND)
def get_ingredient(ingredient_id: int, db: DbSession) -> Ingredient:
    return _one(db, get_or_404(db, models.Ingredient, ingredient_id, "ingredient"))


@router.post("", status_code=status.HTTP_201_CREATED, responses={**NAME_IN_USE, **UNPROCESSABLE})
def create_ingredient(body: IngredientFields, db: DbSession) -> Ingredient:
    ingredient = models.Ingredient()
    _fill(ingredient, body, db)
    db.add(ingredient)
    commit_named(db, ingredient, "An ingredient")
    return _one(db, ingredient)


@router.post(
    "/from-source", status_code=status.HTTP_201_CREATED, responses={**NAME_IN_USE, **FROM_SOURCE_UNPROCESSABLE}
)
def create_from_source(body: IngredientFromSource, db: DbSession) -> Ingredient:
    """Make an ingredient from a source food: its name and chosen source tags
    are the user's, the unit, basis and values come from the food as the
    mapping and preferences stand now. It stays linked to the food, and each
    value remembers the source's number."""
    refs = References(db)
    found = refs.rows(models.SourceFood, [(["food_id"], body.food_id)], "food")
    refs.check()
    food = found[body.food_id]
    if food.withdrawn:
        refs.error(["food_id"], "withdrawn", "This food is no longer in the source")
        refs.check()
    food_tags = set(
        db.scalars(select(models.source_food_tags.c.tag_id).where(models.source_food_tags.c.food_id == food.id))
    )
    existing = set(db.scalars(select(models.Tag.id).where(models.Tag.id.in_(body.tag_ids))))
    for i, tag_id in enumerate(body.tag_ids):
        if tag_id in existing and tag_id not in food_tags:
            refs.error(["tag_ids", i], "not_a_food_tag", "This tag is not one of the food's source tags")
    refs.check()

    unit, basis = source_values.food_basis(db)
    copied = source_values.copied_values(db, food)
    fields = IngredientFields(
        name=body.name,
        unit=unit,
        basis=basis,
        values=[IngredientValue(attribute_id=c.attribute.id, value=c.value) for c in copied.values],
        tag_ids=body.tag_ids,
    )
    ingredient = models.Ingredient(source_food_id=food.id)
    _fill(ingredient, fields, db)
    for value in ingredient.values:
        value.source_value = value.value
    db.add(ingredient)
    commit_named(db, ingredient, "An ingredient")
    return _one(db, ingredient)


@router.post("/{ingredient_id}/unlink", responses=NOT_FOUND)
def unlink_ingredient(ingredient_id: int, db: DbSession) -> Ingredient:
    """Cut the link to the source food and forget the source's numbers. The
    values, tags and basis stay. An unlinked ingredient is answered as it is."""
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    ingredient.source_food_id = None
    ingredient.source_food = None
    for value in ingredient.values:
        value.source_value = None
    db.commit()
    return _one(db, ingredient)


@router.post("/{ingredient_id}/source-values", responses={**NOT_FOUND, **NOT_LINKED})
def answer_updated_values(ingredient_id: int, body: SourceValuesAnswer, db: DbSession) -> Ingredient:
    """Accept the source's new values (copy them) or keep the ingredient's own
    (and remember the source's numbers as answered). What is answered is what
    the server finds now; nothing to answer is a no-op."""
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    if ingredient.source_food_id is None:
        raise invalid_fields(
            [FieldError(loc=["path", "ingredient_id"], type="not_linked", msg="This ingredient is not from a data source")]
        )
    source_values.apply_answer(ingredient, source_values.updates_for(db, [ingredient]).get(ingredient.id, []), body.answer)
    db.commit()
    return _one(db, ingredient)


@router.post("/{ingredient_id}/unit-change", responses=NOT_FOUND)
def preview_unit_change(ingredient_id: int, body: IngredientUnitChange, db: DbSession) -> UnitChange:
    """What changing the unit does to the basis and the recipe amounts. Writes nothing."""
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    basis = ingredient.basis if body.basis is None else body.basis
    converters = unit_change.ingredient_converters(ingredient, basis)
    preview = answer(unit_change.plan(db, ingredient.unit, body.unit, converters))
    refused = _unit_refusal(ingredient, body.unit)
    if refused:
        preview.refusal = UnitChangeRefusal(type=refused[0], msg=refused[1])  # type: ignore[arg-type]
    return preview


@router.put("/{ingredient_id}", responses={**NOT_FOUND, **NAME_IN_USE, **UPDATE_UNPROCESSABLE})
def update_ingredient(ingredient_id: int, body: IngredientFields, db: DbSession) -> Ingredient:
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    # Planned before anything changes (the plan reads the database, and the
    # new fields must not be flushed first). The basis converted is the
    # body's, as typed in the old unit.
    converters = unit_change.ingredient_converters(ingredient, body.basis)
    change = unit_change.plan(db, ingredient.unit, body.unit, converters)
    _fill(ingredient, body, db)  # its own 422s win over a refused conversion
    refuse(change)
    change.apply()
    commit_named(db, ingredient, "An ingredient")
    return _one(db, ingredient)


@router.delete("/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT, responses={**NOT_FOUND, **IN_USE})
def delete_ingredient(ingredient_id: int, db: DbSession) -> None:
    db.delete(get_or_404(db, models.Ingredient, ingredient_id, "ingredient"))
    try:
        db.commit()
    except IntegrityError:
        # The recipes' foreign key keeps an ingredient they use.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recipes use this ingredient") from None
