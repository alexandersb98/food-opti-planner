"""/api/recipes: list, read, create, update and delete recipes (C1, C2), and
the tags a recipe would get from its ingredients, for the editor."""

from decimal import Decimal
from fractions import Fraction
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from .. import conversions, line_units, models, queries, translate, units
from ..db import DbSession
from ..fields import Multiplier, Name, Number, plain
from .catalog import References, commit_named, get_or_404, in_list
from .errors import NAME_IN_USE, FieldError
from .ingredients import UNIT_NOT_FOR_INGREDIENT

router = APIRouter(prefix="/recipes", tags=["recipes"])

NOT_FOUND = {404: {"description": "No such recipe"}}


MAX_SERVINGS = 1000
MAX_SECTIONS = 50
MAX_LINES = 200  # per section


class RecipeItem(BaseModel):
    """A line of a recipe. The same ingredient may be on several lines."""

    ingredient_id: int
    # For the whole recipe, in `unit`.
    amount: Annotated[Number, Field(gt=0)]
    # Empty: the ingredient's own unit. Otherwise a unit that converts to it:
    # a catalogue unit, or the unit of one of the ingredient's conversions.
    # Answered in one form (`conversions.canonical_unit`).
    unit: Annotated[str, StringConstraints(strip_whitespace=True, max_length=models.UNIT_LENGTH)] = ""
    # The line as imported, empty for one that was typed.
    original_text: Annotated[str, Field(max_length=models.ORIGINAL_TEXT_LENGTH)]


class Section(BaseModel):
    # Trimmed; may be empty only in a recipe of one section (no heading).
    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=models.NAME_LENGTH)]
    # In the order listed; may be empty while the recipe has a line elsewhere.
    items: Annotated[list[RecipeItem], Field(max_length=MAX_LINES)]


class RecipeFields(BaseModel):
    name: Name
    # The amounts below are for the whole recipe, which serves this many
    # portions; the planner's portion is one of them.
    servings: Annotated[int, Field(ge=1, le=MAX_SERVINGS)]
    # In the order listed.
    sections: Annotated[list[Section], Field(min_length=1, max_length=MAX_SECTIONS)]
    # Free text, line breaks kept.
    instructions: Annotated[str, Field(max_length=models.INSTRUCTIONS_LENGTH)]
    # Empty, or a link starting http:// or https://; trimmed.
    source_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=models.SOURCE_URL_LENGTH)]
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
    # Every attribute's total for one portion (the whole recipe divided by
    # servings), in attribute order.
    totals: list[Total]


class Ingredients(BaseModel):
    ingredient_ids: Annotated[list[int], Field(min_length=1)]


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
            servings=row.servings,
            sections=[
                Section(
                    name=section.name,
                    items=[
                        RecipeItem(
                            ingredient_id=i.ingredient_id, amount=i.amount, unit=i.unit,
                            original_text=i.original_text,
                        )
                        for i in section.items
                    ],
                )
                for section in row.sections
            ],
            instructions=row.instructions,
            source_url=row.source_url,
            extra_tag_ids=[tag.id for tag in row.extra_tags],
            min_multiplier=row.min_multiplier,
            max_multiplier=row.max_multiplier,
            step=row.step,
            hard_max_multiplier=row.hard_max_multiplier,
            serving_cap_weight=row.serving_cap_weight,
            derived_tag_ids=self.derived_tag_ids(list({item.ingredient: None for item in row.lines})),
            totals=[
                Total(attribute_id=a.id, value=_rounded(_total(row, a), a.decimals))
                for a in self.attributes
            ],
        )


def _total(row: models.Recipe, attribute: models.Attribute) -> Fraction:
    """`attribute`'s total for one portion: each line's amount (in the
    ingredient's own unit, `translate.own_unit_amount`) times that
    ingredient's value per its basis, summed over all lines and divided by
    the servings once. A missing value counts as 0.

    Summed as whole-number fractions, so it is exact. The library's per-unit
    values divide by the basis in Decimal, which cannot hold a third, and a
    total landing on a rounding tie would then round the wrong way: 16.5 of a
    value of 1 per basis 3 is exactly 5.5, but 5.4999... once divided. The
    editor sums the same way (`web/src/totals.ts`), so both always agree.
    """
    whole = sum(
        (
            translate.own_unit_amount(item) * Fraction(value.value) / Fraction(item.ingredient.basis)
            for item in row.lines
            for value in item.ingredient.values
            if value.attribute_id == attribute.id
        ),
        Fraction(0),
    )
    return whole / row.servings


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


def _recipe_errors(body: RecipeFields) -> list[FieldError]:
    """The rules that span a recipe's sections, and the source link."""
    errors = []

    def error(loc: list[str | int], error_type: str, msg: str) -> None:
        errors.append(FieldError(loc=["body", *loc], type=error_type, msg=msg))

    if len(body.sections) > 1:
        for i, section in enumerate(body.sections):
            if not section.name:
                error(["sections", i, "name"], "name_required", "Every section needs a name")
    if not any(section.items for section in body.sections):
        error(["sections"], "no_items", "Add at least one ingredient")
    if body.source_url and not body.source_url.startswith(("http://", "https://")):
        error(["source_url"], "invalid_url", "Must start with http:// or https://")
    return errors


def _unit_errors(body: RecipeFields, ingredients: dict[int, models.Ingredient]) -> list[FieldError]:
    """A line's unit must be one the ingredient can take: not an energy unit,
    and one that converts to the ingredient's own (`line_units.route`)."""
    errors = []
    for i, section in enumerate(body.sections):
        for j, item in enumerate(section.items):
            ingredient = ingredients.get(item.ingredient_id)
            if ingredient is None or not item.unit:
                continue
            loc = ["body", "sections", i, "items", j, "unit"]
            parsed = units.parse(item.unit)
            if parsed is not None and parsed.category == "energy":
                errors.append(FieldError(loc=loc, type="unit_not_for_ingredient", msg=UNIT_NOT_FOR_INGREDIENT))
            elif line_units.route(item.unit, ingredient.unit, [(c.unit, c.factor) for c in ingredient.conversions]) is None:
                msg = (
                    f"{plain(item.amount)} {item.unit} of {ingredient.name} doesn't convert to {ingredient.unit}: "
                    f"add a conversion for {item.unit}"
                )
                errors.append(FieldError(loc=loc, type="unit_not_convertible", msg=msg))
    return errors


def _fill(recipe: models.Recipe, body: RecipeFields, db: DbSession) -> None:
    """Set the recipe's fields from `body`, answering 422 for portion sizes
    the library would refuse, sections and links that break the rules and ids
    that name nothing. The sections and their lines are rebuilt."""
    refs = References(db)
    refs.errors += _portion_errors(body) + _recipe_errors(body)
    lines = [
        (["sections", i, "items", j, "ingredient_id"], item.ingredient_id)
        for i, section in enumerate(body.sections)
        for j, item in enumerate(section.items)
    ]
    ingredients = refs.rows(models.Ingredient, lines, "ingredient")
    refs.errors += _unit_errors(body, ingredients)
    tags = refs.rows(models.Tag, in_list("extra_tag_ids", body.extra_tag_ids), "tag")
    refs.check()

    # Loading the old sections and tags must not save the new name early, or a
    # name in use would fail here instead of in commit_named.
    with db.no_autoflush:
        recipe.name = body.name
        for field in (
            "servings", "instructions", "source_url",
            "min_multiplier", "max_multiplier", "step", "hard_max_multiplier", "serving_cap_weight",
        ):
            setattr(recipe, field, getattr(body, field))
        recipe.sections = [
            models.RecipeSection(
                position=i,
                name=section.name,
                items=[
                    models.RecipeItem(
                        position=j, ingredient_id=item.ingredient_id, amount=item.amount,
                        unit=conversions.canonical_unit(item.unit, ingredients[item.ingredient_id]),
                        original_text=item.original_text,
                    )
                    for j, item in enumerate(section.items)
                ],
            )
            for i, section in enumerate(body.sections)
        ]
        recipe.extra_tags = [tags[tag_id] for tag_id in sorted(set(body.extra_tag_ids))]


def _read(db: DbSession, recipe_id: int) -> Recipe:
    """The response for one recipe, or a 404."""
    recipe = db.scalars(queries.recipes().where(models.Recipe.id == recipe_id)).one_or_none()
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such recipe")
    return _Responses(db).response(recipe)


@router.get("")
def list_recipes(db: DbSession) -> list[Recipe]:
    responses = _Responses(db)
    return [responses.response(recipe) for recipe in db.scalars(queries.recipes().order_by(models.Recipe.id))]


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
