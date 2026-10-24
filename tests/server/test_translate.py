"""The mapping rules from stored data to library objects, without a database."""

from decimal import Decimal

from meal_planner import IngredientAmount, Recipe
from server import models, translate

ENERGY = models.Attribute(id=1, name="Energy", unit="kcal", decimals=0)
PROTEIN = models.Attribute(id=2, name="Protein", unit="g", decimals=1)
VEGAN = models.Tag(id=1, name="vegan", derive="all")


def oats(basis="100", values=(), tags=()) -> models.Ingredient:
    return models.Ingredient(
        name="Oats",
        unit="g",
        basis=Decimal(basis),
        values=[models.IngredientValue(attribute=a, value=Decimal(v)) for a, v in values],
        tags=list(tags),
    )


def test_name_unit_and_tags_are_copied():
    ingredient = translate.ingredient(oats(tags=[VEGAN]))
    assert (ingredient.name, ingredient.unit, ingredient.tags) == ("Oats", "g", frozenset({"vegan"}))


def test_a_typed_value_is_divided_by_the_value_basis():
    ingredient = translate.ingredient(oats("100", [(ENERGY, "389"), (PROTEIN, "16.9")]))
    assert ingredient.attributes == {"Energy": Decimal("3.89"), "Protein": Decimal("0.169")}


def test_a_basis_of_one_keeps_the_value():
    egg = translate.ingredient(oats("1", [(PROTEIN, "6.3")]))
    assert egg.attributes == {"Protein": Decimal("6.3")}


def test_the_division_is_exact_enough_for_any_precision():
    """1/3 per unit, times 300 units, is 100 to well beyond 6 decimals."""
    ingredient = translate.ingredient(oats("3", [(ENERGY, "1")]))
    recipe = Recipe("Bowl", items=[IngredientAmount(ingredient, 300)])
    assert abs(recipe.attribute_total("Energy") - 100) < Decimal("1e-20")


def test_an_attribute_without_a_value_counts_as_0():
    ingredient = translate.ingredient(oats("100", [(ENERGY, "389")]))
    assert "Protein" not in ingredient.attributes
    recipe = Recipe("Bowl", items=[IngredientAmount(ingredient, 50)])
    assert recipe.attribute_total("Protein") == 0
    assert recipe.attribute_total("Energy") == Decimal("194.5")
