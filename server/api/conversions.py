"""/api/ingredients/{id}/conversions: add, edit and delete an ingredient's
conversions ("1 dl = 40 g", C4 and C2's New unit). Conversions are answered
with the ingredient (`conversions` in its answer)."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints

from .. import conversions, models, units
from ..db import DbSession
from ..fields import Number
from .catalog import get_or_404
from .errors import FieldError, FieldErrors, invalid_fields

router = APIRouter(prefix="/ingredients", tags=["conversions"])

NOT_FOUND = {404: {"description": "No such ingredient or conversion"}}
UNPROCESSABLE = {422: {"model": FieldErrors, "description": "An energy unit, the ingredient's own unit or a unit it has"}}
IN_USE = {409: {"model": FieldErrors, "description": "Recipes use the conversion"}}
UNIT_NOT_FOR_INGREDIENT = "A conversion is for an amount of food, such as dl or pinch, not for energy."
UNIT_IS_OWN_UNIT = "That is the ingredient's own unit."
DUPLICATE = "This ingredient has a conversion for that unit already."


class ConversionFields(BaseModel):
    # A catalogue unit (stored with its catalogue spelling) or free text.
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.UNIT_LENGTH)]
    # How many of the ingredient's own unit one of `unit` makes.
    factor: Annotated[Number, Field(gt=0)]


class Conversion(BaseModel):
    id: int
    unit: str
    factor: Number
    # "ai": suggested by the AI, not checked by the user.
    source: Literal["ai", "user"]
    # How many recipes have a line that uses it; it can't be deleted while any does.
    recipe_count: int


def answer(row: models.IngredientConversion, usage: dict[int, int]) -> Conversion:
    return Conversion(
        id=row.id, unit=row.unit, factor=row.factor, source=row.source,  # type: ignore[arg-type]
        recipe_count=usage.get(row.id, 0),
    )


def _check(ingredient: models.Ingredient, fields: ConversionFields, ignore_id: int | None) -> None:
    """Answer 422 on the unit: an energy unit, the ingredient's own unit, or a
    unit another conversion has (in any spelling)."""
    parsed = units.parse(fields.unit)
    if parsed is not None and parsed.category == "energy":
        error = ("unit_not_for_ingredient", UNIT_NOT_FOR_INGREDIENT)
    elif units.ratio(fields.unit, ingredient.unit) == 1:
        error = ("unit_is_own_unit", UNIT_IS_OWN_UNIT)
    elif any(c.id != ignore_id and units.ratio(fields.unit, c.unit) == 1 for c in ingredient.conversions):
        error = ("duplicate", DUPLICATE)
    else:
        return
    raise invalid_fields([FieldError(loc=["body", "unit"], type=error[0], msg=error[1])])


def _conversion(ingredient: models.Ingredient, conversion_id: int) -> models.IngredientConversion:
    for conversion in ingredient.conversions:
        if conversion.id == conversion_id:
            return conversion
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such conversion")


@router.post(
    "/{ingredient_id}/conversions", status_code=status.HTTP_201_CREATED, responses={**NOT_FOUND, **UNPROCESSABLE}
)
def add_conversion(ingredient_id: int, body: ConversionFields, db: DbSession) -> Conversion:
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    _check(ingredient, body, None)
    row = models.IngredientConversion(unit=units.normalise(body.unit), factor=body.factor, source="user")
    ingredient.conversions.append(row)
    db.commit()
    return answer(row, {})


@router.put("/{ingredient_id}/conversions/{conversion_id}", responses={**NOT_FOUND, **UNPROCESSABLE, **IN_USE})
def edit_conversion(ingredient_id: int, conversion_id: int, body: ConversionFields, db: DbSession) -> Conversion:
    """Only the factor may change while a recipe uses the conversion. A save
    that changes neither unit nor factor keeps the source; one that does is
    the user's."""
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    row = _conversion(ingredient, conversion_id)
    _check(ingredient, body, row.id)
    usage = conversions.usage(db)
    unit_changed = units.ratio(body.unit, row.unit) != 1
    if unit_changed and usage.get(row.id, 0):
        error = FieldError(
            loc=["body", "unit"], type="conversion_in_use", msg="Recipes use this conversion, so its unit can't change"
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=[error.model_dump()])
    if unit_changed or body.factor != row.factor:
        row.source = "user"
    row.unit = units.normalise(body.unit)
    row.factor = body.factor
    db.commit()
    return answer(row, conversions.usage(db))


@router.delete(
    "/{ingredient_id}/conversions/{conversion_id}", status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **IN_USE},
)
def delete_conversion(ingredient_id: int, conversion_id: int, db: DbSession) -> None:
    ingredient = get_or_404(db, models.Ingredient, ingredient_id, "ingredient")
    row = _conversion(ingredient, conversion_id)
    if conversions.usage(db).get(row.id, 0):
        error = FieldError(loc=["path", "conversion_id"], type="conversion_in_use", msg="Recipes use this conversion")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=[error.model_dump()])
    db.delete(row)
    db.commit()
