"""What the database knows about line units and conversions: how many recipes
use each stored conversion, and the form a line's unit is stored in. The
routing rule itself is `line_units`. No FastAPI."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import line_units, models, units


def usage(db: Session) -> dict[int, int]:
    """Conversion id to the number of distinct recipes with a line routed
    through it (`line_units.route(...).via`). Conversions no recipe uses are
    left out."""
    stored: dict[int, list[models.IngredientConversion]] = {}
    for conversion in db.scalars(select(models.IngredientConversion).order_by(models.IngredientConversion.id)):
        stored.setdefault(conversion.ingredient_id, []).append(conversion)
    if not stored:
        return {}
    own = dict(
        db.execute(select(models.Ingredient.id, models.Ingredient.unit).where(models.Ingredient.id.in_(list(stored)))).all()
    )
    lines = db.execute(
        select(models.RecipeItem.ingredient_id, models.RecipeItem.unit, models.RecipeSection.recipe_id)
        .join(models.RecipeSection, models.RecipeSection.id == models.RecipeItem.section_id)
        .where(models.RecipeItem.ingredient_id.in_(list(stored)))
    )
    recipes: dict[int, set[int]] = {}
    for ingredient_id, unit, recipe_id in lines:
        conversions = stored[ingredient_id]
        found = line_units.route(unit, own[ingredient_id], [(c.unit, c.factor) for c in conversions])
        if found is not None and found.via is not None:
            conversion = next(c for c in conversions if c.unit == found.via)
            recipes.setdefault(conversion.id, set()).add(recipe_id)
    return {conversion_id: len(ids) for conversion_id, ids in recipes.items()}


def canonical_unit(unit: str, ingredient: models.Ingredient) -> str:
    """The form a line's unit is stored in: empty for the ingredient's own
    unit, a stored conversion's spelling for its unit, else the catalogue
    spelling (or the text, trimmed, for free text)."""
    if line_units.is_own(unit, ingredient.unit):
        return ""
    for conversion in ingredient.conversions:
        if units.ratio(unit, conversion.unit) == 1:
            return conversion.unit
    return units.normalise(unit)
