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


def porridge(**fields) -> models.Recipe:
    milk = models.Ingredient(name="Milk", unit="ml", basis=Decimal("100"), values=[], tags=[])
    defaults = {
        "name": "Porridge",
        "min_multiplier": Decimal("0.5"),
        "max_multiplier": Decimal("2"),
        "step": None,
        "hard_max_multiplier": None,
        "serving_cap_weight": Decimal("1"),
        "items": [
            models.RecipeItem(ingredient=oats("100", [(ENERGY, "389")]), amount=Decimal("60")),
            models.RecipeItem(ingredient=milk, amount=Decimal("200")),
        ],
        "extra_tags": [],
    }
    return models.Recipe(**{**defaults, **fields})


def test_a_tag_keeps_its_name_and_rule():
    tag = translate.tag(models.Tag(name="contains-nuts", derive="any"))
    assert (tag.name, tag.derive) == ("contains-nuts", "any")


def test_a_recipes_items_are_its_ingredients_in_order_with_their_amounts():
    recipe = translate.recipe(porridge())
    assert [(i.ingredient.name, i.quantity) for i in recipe.items] == [("Oats", 60), ("Milk", 200)]
    assert recipe.items[0].ingredient.attributes == {"Energy": Decimal("3.89")}
    assert recipe.attribute_total("Energy") == Decimal("233.4")


def test_tags_added_by_hand_are_extra_tags():
    recipe = translate.recipe(porridge(extra_tags=[VEGAN]))
    assert recipe.extra_tags == frozenset({"vegan"})


def test_the_portion_size_fields_are_copied():
    recipe = translate.recipe(porridge(
        min_multiplier=Decimal("1"), max_multiplier=Decimal("2.5"), step=Decimal("0.5"),
        hard_max_multiplier=Decimal("4"), serving_cap_weight=Decimal("0"),
    ))
    assert (
        recipe.min_multiplier, recipe.max_multiplier, recipe.multiplier_step,
        recipe.hard_max_multiplier, recipe.serving_cap_weight,
    ) == (1, Decimal("2.5"), Decimal("0.5"), 4, 0)


def test_any_amount_is_no_step_and_no_hard_limit_is_3_times_the_soft_one():
    recipe = translate.recipe(porridge(max_multiplier=Decimal("1.5")))
    assert recipe.multiplier_step is None
    assert recipe.hard_max_multiplier == Decimal("4.5")


def test_derived_tags_come_from_the_ingredients_by_each_tags_rule():
    nuts = models.Tag(name="contains-nuts", derive="any")
    almonds = models.Ingredient(name="Almonds", unit="g", basis=Decimal("100"), values=[], tags=[VEGAN, nuts])
    recipe = translate.recipe(porridge(items=[
        models.RecipeItem(ingredient=oats(tags=[VEGAN]), amount=Decimal("60")),
        models.RecipeItem(ingredient=almonds, amount=Decimal("10")),
    ]))
    tag_defs = {tag.name: translate.tag(tag) for tag in (VEGAN, nuts)}
    assert recipe.tags(tag_defs) == frozenset({"vegan", "contains-nuts"})
