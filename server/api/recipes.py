"""/api/recipes: list, read, create, update and delete recipes (C1, C2), and
the tags a recipe would get from its ingredients, for the editor."""

from decimal import Decimal
from fractions import Fraction
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .. import models, translate
from ..db import DbSession
from .catalog import References, commit_named, get_or_404, in_list
from .errors import NAME_IN_USE, FieldError
from .fields import Multiplier, Name, Number, plain

router = APIRouter(prefix="/recipes", tags=["recipes"])

NOT_FOUND = {404: {"description": "No such recipe"}}


class RecipeItem(BaseModel):
    ingredient_id: int
    # For one portion, in the ingredient's unit.
    amount: Annotated[Number, Field(gt=0)]


class RecipeFields(BaseModel):
    name: Name
    # In the order listed, each ingredient at most once.
    items: Annotated[list[RecipeItem], Field(min_length=1)]
    # Tags added by hand, besides those the ingredients give it.
    extra_tag_ids: list[int]
    # Portion size: from min to max times the portion, above which
    # serving_cap_weight penalizes, never above hard_max_multiplier (null:
    # 3 times max). Any amount when step is null, else whole steps.
    min_multiplier: Multiplier
    max_multiplier: Multiplier
    step: Multiplier | None
    hard_max_multiplier: Multiplier | None
    serving_cap_weight: Annotated[Number, Field(ge=0)]


class Total(BaseModel):
    attribute_id: int
    # Rounded to the attribute's decimals, as the planner counts it.
    value: str


class Recipe(RecipeFields):
    id: int
    # Tags the ingredients give it, by each tag's rule.
    derived_tag_ids: list[int]
    # Every attribute's total for one portion, in attribute order.
    totals: list[Total]


class Ingredients(BaseModel):
    ingredient_ids: Annotated[list[int], Field(min_length=1)]


def loaded():
    """Recipes with everything their responses and the planner need, in a few queries."""
    ingredient = selectinload(models.Recipe.items).selectinload(models.RecipeItem.ingredient)
    return select(models.Recipe).options(
        ingredient.selectinload(models.Ingredient.values).selectinload(models.IngredientValue.attribute),
        ingredient.selectinload(models.Ingredient.tags),
        selectinload(models.Recipe.extra_tags),
    )


class _Responses:
    """The attributes and tags every response refers to, read once per request."""

    def __init__(self, db: DbSession):
        self.attributes = db.scalars(select(models.Attribute).order_by(models.Attribute.id)).all()
        self.tags = db.scalars(select(models.Tag).order_by(models.Tag.id)).all()

    def derived_tag_ids(self, ingredients: list[models.Ingredient]) -> list[int]:
        """The tags a dish of these ingredients gets, by the library's rule."""
        dish = [translate.ingredient(ingredient) for ingredient in ingredients]
        return [tag.id for tag in self.tags if translate.tag(tag).holds_for(dish)]

    def response(self, row: models.Recipe) -> Recipe:
        return Recipe(
            id=row.id,
            name=row.name,
            items=[RecipeItem(ingredient_id=i.ingredient_id, amount=i.amount) for i in row.items],
            extra_tag_ids=[tag.id for tag in row.extra_tags],
            min_multiplier=row.min_multiplier,
            max_multiplier=row.max_multiplier,
            step=row.step,
            hard_max_multiplier=row.hard_max_multiplier,
            serving_cap_weight=row.serving_cap_weight,
            derived_tag_ids=self.derived_tag_ids([item.ingredient for item in row.items]),
            totals=[
                Total(attribute_id=a.id, value=_rounded(_total(row, a), a.decimals))
                for a in self.attributes
            ],
        )


def _total(row: models.Recipe, attribute: models.Attribute) -> Fraction:
    """`attribute`'s total for one portion: each amount times that
    ingredient's value per its basis, summed. A missing value counts as 0.

    Summed as whole-number fractions, so it is exact. The library's per-unit
    values divide by the basis in Decimal, which cannot hold a third, and a
    total landing on a rounding tie would then round the wrong way: 16.5 of a
    value of 1 per basis 3 is exactly 5.5, but 5.4999... once divided. The
    editor sums the same way (`web/src/totals.ts`), so both always agree.
    """
    return sum(
        (
            Fraction(item.amount) * Fraction(value.value) / Fraction(item.ingredient.basis)
            for item in row.items
            for value in item.ingredient.values
            if value.attribute_id == attribute.id
        ),
        Fraction(0),
    )


def _rounded(total: Fraction, decimals: int) -> str:
    # Half away from zero, as the library rounds.
    magnitude = abs(total)
    units = (2 * magnitude.numerator * 10**decimals + magnitude.denominator) // (
        2 * magnitude.denominator
    )
    return plain(Decimal(-units if total < 0 else units).scaleb(-decimals))


def _portion_errors(body: RecipeFields) -> list[FieldError]:
    """The library's rules for the portion size that span fields:
    0 < min <= max <= hard max, and min a whole number of steps."""
    errors = []

    def error(field: str, error_type: str, msg: str) -> None:
        errors.append(FieldError(loc=["body", field], type=error_type, msg=msg))

    if body.max_multiplier < body.min_multiplier:
        error("max_multiplier", "below_min", "Must be at least the smallest portion")
    if body.hard_max_multiplier is not None and body.hard_max_multiplier < body.max_multiplier:
        error("hard_max_multiplier", "below_max", "Must be at least the largest portion")
    if body.step is not None and body.min_multiplier % body.step != 0:
        error("min_multiplier", "not_in_steps", "Must be a whole number of steps")
    return errors


def _fill(recipe: models.Recipe, body: RecipeFields, db: DbSession) -> None:
    """Set the recipe's fields from `body`, answering 422 for portion sizes
    the library would refuse, ingredients given twice and ids that name nothing."""
    refs = References(db)
    refs.errors += _portion_errors(body)
    ingredient_ids = [item.ingredient_id for item in body.items]
    refs.rows(models.Ingredient, in_list("items", ingredient_ids, "ingredient_id"), "ingredient", unique=True)
    tags = refs.rows(models.Tag, in_list("extra_tag_ids", body.extra_tag_ids), "tag")
    refs.check()

    # Loading the old items and tags must not save the new name early, or a
    # name in use would fail here instead of in commit_named.
    with db.no_autoflush:
        recipe.name = body.name
        for field in ("min_multiplier", "max_multiplier", "step", "hard_max_multiplier", "serving_cap_weight"):
            setattr(recipe, field, getattr(body, field))
        by_ingredient = {item.ingredient_id: item for item in recipe.items}
        recipe.items = [
            _item(by_ingredient.get(item.ingredient_id), item, position)
            for position, item in enumerate(body.items)
        ]
        recipe.extra_tags = [tags[tag_id] for tag_id in sorted(set(body.extra_tag_ids))]


def _item(stored: models.RecipeItem | None, fields: RecipeItem, position: int) -> models.RecipeItem:
    # A stored item is changed rather than replaced, as its primary key stays.
    if stored is None:
        stored = models.RecipeItem(ingredient_id=fields.ingredient_id)
    stored.position = position
    stored.amount = fields.amount
    return stored


def _read(db: DbSession, recipe_id: int) -> Recipe:
    """The response for one recipe, or a 404."""
    recipe = db.scalars(loaded().where(models.Recipe.id == recipe_id)).one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such recipe")
    return _Responses(db).response(recipe)


@router.get("")
def list_recipes(db: DbSession) -> list[Recipe]:
    responses = _Responses(db)
    return [responses.response(recipe) for recipe in db.scalars(loaded().order_by(models.Recipe.id))]


@router.post("/derived-tags")
def derived_tags(body: Ingredients, db: DbSession) -> list[int]:
    """The ids of the tags a recipe of these ingredients gets from them, so
    the editor can show them before the recipe is saved."""
    refs = References(db)
    found = refs.rows(models.Ingredient, in_list("ingredient_ids", body.ingredient_ids), "ingredient")
    refs.check()
    return _Responses(db).derived_tag_ids(list(found.values()))


@router.get("/{recipe_id}", responses=NOT_FOUND)
def get_recipe(recipe_id: int, db: DbSession) -> Recipe:
    return _read(db, recipe_id)


@router.post("", status_code=status.HTTP_201_CREATED, responses=NAME_IN_USE)
def create_recipe(body: RecipeFields, db: DbSession) -> Recipe:
    recipe = models.Recipe()
    _fill(recipe, body, db)
    db.add(recipe)
    commit_named(db, recipe, "A recipe")
    return _read(db, recipe.id)


@router.put("/{recipe_id}", responses={**NOT_FOUND, **NAME_IN_USE})
def update_recipe(recipe_id: int, body: RecipeFields, db: DbSession) -> Recipe:
    recipe = get_or_404(db, models.Recipe, recipe_id, "recipe")
    _fill(recipe, body, db)
    commit_named(db, recipe, "A recipe")
    return _read(db, recipe_id)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_recipe(recipe_id: int, db: DbSession) -> None:
    db.delete(get_or_404(db, models.Recipe, recipe_id, "recipe"))
    db.commit()
