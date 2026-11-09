"""/api/recipe-imports: turn pasted recipe text into a draft (I1), and suggest
a conversion factor for a line matched by hand (C2's import review).

Nothing is stored here. Errors use the FieldErrors shape with fixed messages:
what the provider said, and the API key, never appear in an answer."""

import logging
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, StringConstraints

from .. import models, recipe_import, units
from ..ai.errors import AIServiceError, BadAnswerError, NoRecipeFound
from ..ai_runtime import NotConfigured
from ..ai_usage import DailyLimitReached
from ..db import DbSession
from ..fields import Number
from .catalog import References
from .errors import FieldError, FieldErrors
from .conversions import UNIT_IS_OWN_UNIT, UNIT_NOT_FOR_INGREDIENT

router = APIRouter(prefix="/recipe-imports", tags=["recipe imports"])
log = logging.getLogger(__name__)

MAX_REQUEST_CHARS = 200_000

ERRORS = {
    422: {"model": FieldErrors, "description": "No text, too much text, or no recipe in it"},
    429: {"model": FieldErrors, "description": "Today's limit of model calls is reached"},
    502: {"model": FieldErrors, "description": "The AI service didn't give a usable answer"},
    503: {"model": FieldErrors, "description": "No AI key is set"},
}


def _fail(code: int, error_type: str, msg: str, loc: list[str | int] | None = None) -> HTTPException:
    error = FieldError(loc=loc or ["body"], type=error_type, msg=msg)
    return HTTPException(status_code=code, detail=[error.model_dump()])


def _text_error(error_type: str, msg: str) -> HTTPException:
    return _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, error_type, msg, ["body", "text"])


NOT_CONFIGURED = _fail(status.HTTP_503_SERVICE_UNAVAILABLE, "ai_not_configured", "Needs an AI key.")


def _map(exc: Exception) -> HTTPException:
    """The fixed answer for an AI failure; the exception's text is never used."""
    if isinstance(exc, DailyLimitReached):
        return _fail(status.HTTP_429_TOO_MANY_REQUESTS, "limit_reached", "Today's import limit is reached.")
    if isinstance(exc, NoRecipeFound):
        return _text_error("no_recipe", "No recipe found in this text.")
    if isinstance(exc, NotConfigured):
        return NOT_CONFIGURED
    return _fail(status.HTTP_502_BAD_GATEWAY, "ai_failed", "The AI service didn't answer. Try again.")


class RecipeImportRequest(BaseModel):
    text: str  # trimmed; 1 to 200 000 characters, checked by hand for the error shape


class ImportedLine(BaseModel):
    original_text: str
    food: str  # the ingredient as the text names it, for the search and the AI
    amount: Number | None  # null only on a not_an_ingredient line
    unit: str  # in the form a recipe line stores it ("" for the ingredient's own unit)
    ingredient_id: int | None
    # unmatched: no ingredient of the user's has that name; not_an_ingredient:
    # not an amount of a food; own_unit, built_in_step, stored_conversion: the
    # unit converts; needs_factor: a conversion is missing; bad_unit: an energy
    # unit or one that is too long.
    status: recipe_import.Status
    # How many of the ingredient's own unit one `unit` makes, as the AI guessed;
    # on needs_factor lines only, null when none was asked or it failed.
    suggested_factor: Number | None


class ImportedSection(BaseModel):
    name: str
    lines: list[ImportedLine]


class ImportedRecipe(BaseModel):
    name: str
    servings: int
    instructions: str
    source_url: str  # empty for pasted text
    cut: bool  # the text was long and its end was left out
    needs_you: int  # lines that are unmatched, need a factor or have a bad unit
    sections: list[ImportedSection]


class FactorRequest(BaseModel):
    ingredient_id: int
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.UNIT_LENGTH)]
    food: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class FactorAnswer(BaseModel):
    factor: Number


def _calls(chat) -> str:
    return f"{chat.calls} calls, {chat.input_tokens} tokens in, {chat.output_tokens} tokens out"


@router.post("", responses=ERRORS)
def import_recipe(body: RecipeImportRequest, request: Request, db: DbSession) -> ImportedRecipe:
    """Ask the AI for a draft of the text, checked against the user's own
    ingredients. Writes nothing."""
    ai = request.app.state.ai
    if not ai.configured:
        raise NOT_CONFIGURED
    text = body.text.strip()
    if not text:
        raise _text_error("text_required", "Paste the recipe text first.")
    if len(text) > MAX_REQUEST_CHARS:
        raise _text_error("too_long", "That is too much text. Paste only the recipe.")
    chat = ai.limited(request.app.state.engine)
    try:
        draft = recipe_import.import_recipe(
            db, text, ai.converter(chat), ai.suggester(chat)
        )
    except (NoRecipeFound, DailyLimitReached, BadAnswerError, AIServiceError) as exc:
        log.info("recipe import failed: %s (%s)", type(exc).__name__, _calls(chat))
        raise _map(exc) from None
    log.info("recipe import: %s", _calls(chat))
    return _answer(draft)


def _answer(draft: recipe_import.ImportedDraft) -> ImportedRecipe:
    return ImportedRecipe.model_validate(draft, from_attributes=True)


@router.post("/factor", responses={**ERRORS})
def suggest_factor(body: FactorRequest, request: Request, db: DbSession) -> FactorAnswer:
    """The AI's guess at how many of the ingredient's own unit one `unit` of
    `food` makes."""
    ai = request.app.state.ai
    if not ai.configured:
        raise NOT_CONFIGURED
    refs = References(db)
    found = refs.rows(models.Ingredient, [(["ingredient_id"], body.ingredient_id)], "ingredient")
    refs.check()
    ingredient = found[body.ingredient_id]
    parsed = units.parse(body.unit)
    if parsed is not None and parsed.category == "energy":
        raise _fail(422, "unit_not_for_ingredient", UNIT_NOT_FOR_INGREDIENT, ["body", "unit"])
    if units.ratio(body.unit, ingredient.unit) == 1:
        raise _fail(422, "unit_is_own_unit", UNIT_IS_OWN_UNIT, ["body", "unit"])
    chat = ai.limited(request.app.state.engine)
    try:
        factor: Decimal = recipe_import.suggest_one(db, ingredient.id, body.unit, body.food, ai.suggester(chat))
    except (DailyLimitReached, BadAnswerError, AIServiceError) as exc:
        log.info("factor suggestion failed: %s (%s)", type(exc).__name__, _calls(chat))
        raise _map(exc) from None
    return FactorAnswer(factor=factor)
