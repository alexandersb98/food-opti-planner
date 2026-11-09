"""The unit-change engine: the number rule, `plan` and `apply`."""

from decimal import Decimal
from fractions import Fraction

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from server import models
from server.unit_change import _convert, attribute_converters, convert_number, ingredient_converters, plan

from .conftest import recipe_body, schedule
from .test_plan import goal
from .test_solve import solve

D = Decimal
MILLI = Fraction(1, 1000)


# The number rule.

def test_a_whole_conversion_is_exact():
    assert _convert(D("12"), Fraction(1000), None, False).value == D("12000")


def test_a_conversion_to_six_places_is_exact_and_not_rounded():
    result = _convert(D("0.5"), MILLI, None, False)
    assert (result.value, result.rounded) == (D("0.0005"), False)


def test_digits_past_six_places_round_half_up_and_count():
    result = _convert(D("1.2345675"), Fraction(1), None, False)
    assert (result.value, result.rounded) == (D("1.234568"), True)
    assert _convert(D("1.234567"), Fraction(1), None, False).rounded is False
    result = _convert(D("1234.5675"), MILLI, None, False)  # 1.2345675
    assert (result.value, result.rounded) == (D("1.234568"), True)


def test_a_non_terminating_ratio_rounds_ingredient_numbers():
    result = _convert(D("1"), Fraction(1, 3), None, False)
    assert (result.value, result.rounded) == (D("0.333333"), True)


def test_a_goal_bound_that_needs_more_decimals_is_refused_with_how_many():
    result = _convert(D("0.5"), MILLI, 3, False)
    assert (result.refusal, result.decimals_needed) == ("conversion_needs_decimals", 4)
    assert _convert(D("0.5"), MILLI, 4, False).value == D("0.0005")


def test_a_goal_bound_with_no_exact_decimal_is_refused_without_a_number():
    result = _convert(D("1"), Fraction(1, 3), 6, False)
    assert (result.refusal, result.decimals_needed) == ("conversion_needs_decimals", None)


def test_a_number_reaching_a_billion_is_refused():
    assert _convert(D("999999999"), Fraction(1), None, False).value == D("999999999")
    assert _convert(D("999999999"), Fraction(2), None, False).refusal == "conversion_too_large"


def test_a_positive_number_that_would_round_to_zero_is_refused():
    assert _convert(D("0.0000004"), Fraction(1), None, True).refusal == "conversion_rounds_to_zero"  # already 0 at 6 places
    assert _convert(D("0.000001"), Fraction(1), None, True).value == D("0.000001")
    assert _convert(D("0.000001"), MILLI, None, True).refusal == "conversion_rounds_to_zero"


def test_zero_is_fine_where_a_number_need_not_be_positive():
    assert _convert(D("0"), MILLI, None, False).value == D("0")


# `plan` and `apply`, on a database.

@pytest.fixture
def db(client):
    with Session(client.app.state.engine) as session:
        yield session


def world(client, catalog):
    """Iron in mg with values 12 and 0.5, a goal with min and max and one
    with a zero reference; Oats (g, basis 100) in 3 recipes."""
    iron = catalog.attribute("Iron", "mg", 4)
    other = catalog.attribute("Zinc", "mg", 2)
    oats = catalog.ingredient("Oats", "g", "100", values={iron: "12", other: "7"})
    seeds = catalog.ingredient("Seeds", "g", "100", values={iron: "0.5"})
    catalog.recipe("Porridge", {oats: "60"})
    catalog.recipe("Muesli", {oats: "30", seeds: "20"})
    catalog.recipe("Bread", {oats: "10"})
    schedule(client, goals=[
        goal(iron, min="0.5", max="2"),
        goal(iron, min="0", applies_to="plan_total", zero_reference="1.5"),
        goal(other, min="3"),
    ])
    return iron, other, oats, seeds


def values(db, attribute_id):
    rows = db.scalars(select(models.IngredientValue).where(models.IngredientValue.attribute_id == attribute_id))
    return sorted(row.value for row in rows)


def attribute_change(db, iron, old, new, decimals=4):
    attribute = db.get(models.Attribute, iron)
    return plan(db, old, new, attribute_converters(attribute, decimals))


def ingredient_change(db, oats, old, new, basis="100"):
    ingredient = db.get(models.Ingredient, oats)
    return plan(db, old, new, ingredient_converters(ingredient, D(basis)))


def test_a_conversion_within_a_category_converts_and_counts(client, catalog, db):
    iron, *_ = world(client, catalog)
    change = attribute_change(db, iron, "mg", "µg")
    assert (change.kind, change.factor, change.rounded, change.refusal) == ("convert", "1000", 0, None)
    assert change.counts == {"ingredient_values": 2, "source_values": 0, "goals": 2}


@pytest.mark.parametrize(
    ("old", "new", "kind", "factor"),
    [("g", "gram", "same", None), ("mg", "mg.", "same", None), ("mg", "MG", "no_convert", None), ("mg", "µg", "convert", "1000"),
     ("g", "kcal", "no_convert", None), ("g", "st", "no_convert", None), ("st", "pcs", "same", None),
     ("g", "pinch", "no_convert", None), ("IU", "IE", "no_convert", None), ("IU", "iu", "same", None),
     ("", "", "same", None), ("fl oz", "ml", "convert", "29.5735295625")],
)
def test_the_kind_and_factor(client, catalog, db, old, new, kind, factor):
    iron, *_ = world(client, catalog)
    change = attribute_change(db, iron, old, new)
    assert (change.kind, change.factor) == (kind, factor)


def test_the_factor_shows_twelve_significant_digits(client, catalog, db):
    iron, *_ = world(client, catalog)
    assert attribute_change(db, iron, "fl oz", "l").factor == "0.0295735295625"
    assert attribute_change(db, iron, "mg", "g").factor == "0.001"
    assert attribute_change(db, iron, "tsk", "US cup").factor == "0.0211337641887"


def test_counts_are_filled_in_for_every_kind(client, catalog, db):
    iron, *_ = world(client, catalog)
    assert attribute_change(db, iron, "mg", "dl").counts == {"ingredient_values": 2, "source_values": 0, "goals": 2}
    assert attribute_change(db, iron, "mg", "mg.").counts == {"ingredient_values": 2, "source_values": 0, "goals": 2}


def test_an_ingredient_counts_its_basis_and_recipe_amounts(client, catalog, db):
    _, _, oats, _ = world(client, catalog)
    change = ingredient_change(db, oats, "g", "kg")
    assert (change.kind, change.factor, change.counts) == ("convert", "0.001", {"basis": 1, "recipe_amounts": 3})
    assert ingredient_change(db, oats, "g", "st").counts == {"basis": 1, "recipe_amounts": 3}


def test_apply_writes_every_converted_number(client, catalog, db):
    iron, other, oats, _ = world(client, catalog)
    attribute_change(db, iron, "mg", "µg").apply()
    db.commit()
    assert values(db, iron) == [D("500"), D("12000")]
    assert values(db, other) == [D("7")]
    goals = sorted(db.get(models.Plan, 1).goals, key=lambda g: g.position)
    first, second, third = goals
    assert (first.min, first.max) == (D("500"), D("2000"))
    assert (second.min, second.zero_reference) == (D("0"), D("1500"))
    assert third.min == D("3")
    ingredient_change(db, oats, "g", "kg").apply()
    db.commit()
    assert db.get(models.Ingredient, oats).basis == D("0.1")
    items = db.scalars(select(models.RecipeItem).where(models.RecipeItem.ingredient_id == oats))
    assert sorted(i.amount for i in items) == [D("0.01"), D("0.03"), D("0.06")]


def two_sections(client, name, *amounts_by_section, oats, servings=1):
    """A recipe with Oats on one line per given amount, each list a section."""
    sections = [
        {"name": f"S{i}", "items": [{"ingredient_id": oats, "amount": a, "original_text": f"{a} g"} for a in amounts]}
        for i, amounts in enumerate(amounts_by_section)
    ]
    response = client.post("/api/recipes", json=recipe_body(name, sections=sections, servings=servings))
    assert response.status_code == 201, response.text


def test_a_recipe_with_the_ingredient_on_two_lines_converts_both(client, catalog, db):
    oats = catalog.ingredient("Oats", "g", "100")
    two_sections(client, "Porridge", ["40"], ["20"], oats=oats, servings=2)
    two_sections(client, "Muesli", ["30"], oats=oats)
    change = ingredient_change(db, oats, "g", "kg")
    assert change.counts == {"basis": 1, "recipe_amounts": 3}
    change.apply()
    db.commit()
    lines = db.scalars(select(models.RecipeItem).order_by(models.RecipeItem.id)).all()
    assert [(i.amount, i.original_text) for i in lines] == [
        (D("0.04"), "40 g"), (D("0.02"), "20 g"), (D("0.03"), "30 g"),
    ]
    assert [r.servings for r in db.scalars(select(models.Recipe).order_by(models.Recipe.id))] == [2, 1]


def test_the_first_refused_line_is_the_first_in_recipe_section_line_order(client, catalog, db):
    oats = catalog.ingredient("Oats", "g", "100")
    # 0.0004 g is 0.0000004 kg, which rounds to 0 and is refused.
    two_sections(client, "Zed", ["60", "0.0004", "0.0003"], ["0.0002"], oats=oats)
    two_sections(client, "Alpha", ["0.0001"], oats=oats)

    def first_refused():
        refusal = ingredient_change(db, oats, "g", "kg").refusal
        return refusal.type, refusal.name, refusal.number

    # The first recipe (by id), its first section, its first line.
    assert first_refused() == ("conversion_rounds_to_zero", "Zed", "0.0004")
    db.delete(db.scalars(select(models.Recipe).where(models.Recipe.name == "Zed")).one())
    db.commit()
    assert first_refused() == ("conversion_rounds_to_zero", "Alpha", "0.0001")


def test_apply_does_nothing_unless_the_change_converts(client, catalog, db):
    iron, _, oats, _ = world(client, catalog)
    for new in ("dl", "mg."):
        attribute_change(db, iron, "mg", new).apply()
    ingredient_change(db, oats, "g", "ml").apply()
    db.commit()
    assert values(db, iron) == [D("0.5"), D("12")]
    assert db.get(models.Ingredient, oats).basis == D("100")


def test_a_refused_change_applies_nothing(client, catalog, db):
    iron, *_ = world(client, catalog)
    change = attribute_change(db, iron, "mg", "g", decimals=3)  # min 0.5 g needs 4
    assert change.refusal.type == "conversion_needs_decimals"
    change.apply()
    db.commit()
    assert values(db, iron) == [D("0.5"), D("12")]


def test_the_refusal_names_the_first_problem_in_converter_order(client, catalog, db):
    iron, *_ = world(client, catalog)
    row = db.scalar(select(models.IngredientValue).where(
        models.IngredientValue.attribute_id == iron, models.IngredientValue.value == D("12")))
    row.value = D("999999999")
    db.commit()
    change = attribute_change(db, iron, "mg", "µg", decimals=1)
    assert change.refusal.type == "conversion_too_large"
    assert (change.refusal.kind, change.refusal.name) == ("ingredient_value", "Oats")
    # Goals alone: the value problem is gone with g, the goal's is reported.
    row.value = D("12")
    db.commit()
    assert attribute_change(db, iron, "mg", "g", decimals=3).refusal.type == "conversion_needs_decimals"


def test_a_refusal_carries_the_facts_of_the_goal(client, catalog, db):
    iron, *_ = world(client, catalog)
    refusal = attribute_change(db, iron, "mg", "g", decimals=3).refusal
    assert (refusal.kind, refusal.name, refusal.field) == ("goal", "Iron per day", "min")
    assert (refusal.number, refusal.converted, refusal.decimals_needed) == ("0.5", "0.0005", 4)
    assert "Iron per day" in refusal.msg


def test_a_saved_plan_result_keeps_its_own_numbers(client, catalog, db):
    iron, *_ = world(client, catalog)
    schedule(client, days=1, meals=[{"name": "Lunch"}], skips=[], minimums=[], solve_time_limit=10)
    plan_id = solve(client)["plan"]["id"]
    assert client.post(f"/api/plan-results/{plan_id}/save").status_code == 200

    def frozen():
        totals = sorted((t.attribute_id, str(t.day), t.value) for t in db.scalars(select(models.PlanResultTotal)))
        goals = sorted((g.name, g.min, g.max) for g in db.scalars(select(models.PlanResultGoal)))
        units = [a.unit for a in db.scalars(select(models.PlanResultAttribute))]
        return totals, goals, units

    before = frozen()
    assert before[2]
    attribute_change(db, iron, "mg", "µg").apply()
    db.commit()
    db.expire_all()
    assert frozen() == before


def test_convert_number_converts_rounds_and_refuses_the_too_large():
    assert convert_number(Decimal("13.5"), Fraction(1000)) == Decimal("13500")  # g to mg
    assert convert_number(Decimal("2500"), Fraction(1, 1000)) == Decimal("2.5")  # g to kg
    assert convert_number(Decimal("0.0000005"), Fraction(1)) == Decimal("0.000001")  # half up
    assert convert_number(Decimal("1"), Fraction(1, 3)) == Decimal("0.333333")
    assert convert_number(Decimal("-0.0000005"), Fraction(1)) == Decimal("-0.000001")
    assert convert_number(Decimal("1000"), Fraction(10**6)) is None  # 10^9 does not fit
    assert convert_number(Decimal("999"), Fraction(10**6)) == Decimal("999000000")


# Source values: the source's number copied next to an ingredient's value (D4).

def with_source_values(db, iron, **by_ingredient):
    """Set `source_value` of the named ingredients' value for `iron`."""
    for name, number in by_ingredient.items():
        row = db.scalar(
            select(models.IngredientValue)
            .join(models.Ingredient)
            .where(models.IngredientValue.attribute_id == iron, models.Ingredient.name == name)
        )
        row.source_value = D(number)
    db.commit()


def source_values(db, iron):
    rows = db.scalars(select(models.IngredientValue).where(models.IngredientValue.attribute_id == iron))
    return sorted(row.source_value for row in rows if row.source_value is not None)


def test_source_values_are_counted_and_converted_with_the_values(client, catalog, db):
    iron, other, *_ = world(client, catalog)
    with_source_values(db, iron, Oats="11", Seeds="0.4")
    change = attribute_change(db, iron, "mg", "µg")
    assert change.counts == {"ingredient_values": 2, "source_values": 2, "goals": 2}
    change.apply()
    db.commit()
    assert values(db, iron) == [D("500"), D("12000")]
    assert source_values(db, iron) == [D("400"), D("11000")]
    assert source_values(db, other) == []


def test_a_value_without_a_source_value_converts_as_before(client, catalog, db):
    iron, *_ = world(client, catalog)
    with_source_values(db, iron, Oats="11")
    change = attribute_change(db, iron, "mg", "µg")
    assert change.counts["source_values"] == 1
    change.apply()
    db.commit()
    assert values(db, iron) == [D("500"), D("12000")]
    assert source_values(db, iron) == [D("11000")]


def test_a_source_value_that_loses_digits_is_rounded_and_counted(client, catalog, db):
    iron, *_ = world(client, catalog)
    with_source_values(db, iron, Oats="0.0000015")
    assert attribute_change(db, iron, "mg", "g").rounded == 1  # 0.0000000015 g
    attribute_change(db, iron, "mg", "g").apply()
    db.commit()
    assert source_values(db, iron) == [D("0")]


def test_a_source_value_that_is_too_large_is_refused_even_when_the_value_converts(client, catalog, db):
    iron, *_ = world(client, catalog)
    # mg to µg: the value 12 becomes 12000, but the source value 1000000 would be 10^9.
    with_source_values(db, iron, Oats="1000000")
    change = attribute_change(db, iron, "mg", "µg", decimals=4)
    assert change.refusal.type == "conversion_too_large"
    assert (change.refusal.kind, change.refusal.name, change.refusal.field) == ("source_value", "Oats", "source_value")
    change.apply()
    db.commit()
    assert values(db, iron) == [D("0.5"), D("12")]
    assert source_values(db, iron) == [D("1000000")]


def test_no_convert_and_same_count_source_values_and_change_nothing(client, catalog, db):
    iron, *_ = world(client, catalog)
    with_source_values(db, iron, Oats="11", Seeds="0.4")
    for new, kind in (("dl", "no_convert"), ("mg.", "same")):
        change = attribute_change(db, iron, "mg", new)
        assert (change.kind, change.counts["source_values"]) == (kind, 2)
        change.apply()
    db.commit()
    assert source_values(db, iron) == [D("0.4"), D("11")]
