from decimal import Decimal

import pytest

from server import units
from server.units import display_units, factor, parse

PREFIXES = {"µ": Decimal("0.000001"), "m": Decimal("0.001"), "c": Decimal("0.01"), "d": Decimal("0.1"), "k": Decimal(1000)}
BASES = {"g": ("mass", Decimal(1)), "l": ("volume", Decimal(1)), "J": ("energy", Decimal(1)), "cal": ("energy", Decimal("4.184"))}


@pytest.mark.parametrize("base", BASES)
def test_a_base_unit_is_known(base):
    category, base_factor = BASES[base]
    unit = parse(base)
    assert (unit.symbol, unit.category, unit.factor) == (base, category, base_factor)


@pytest.mark.parametrize("prefix", PREFIXES)
@pytest.mark.parametrize("base", BASES)
def test_every_prefix_on_every_base_is_understood(prefix, base):
    category, base_factor = BASES[base]
    unit = parse(prefix + base)
    assert (unit.symbol, unit.category, unit.factor) == (prefix + base, category, PREFIXES[prefix] * base_factor)


@pytest.mark.parametrize(
    ("text", "symbol", "category", "unit_factor"),
    [
        ("oz", "oz", "mass", "28.349523125"),
        ("ounce", "oz", "mass", "28.349523125"),
        ("lb", "lb", "mass", "453.59237"),
        ("pound", "lb", "mass", "453.59237"),
        ("tsp", "tsp", "volume", "0.005"),
        ("tsk", "tsp", "volume", "0.005"),
        ("teaspoon", "tsp", "volume", "0.005"),
        ("tbsp", "tbsp", "volume", "0.015"),
        ("msk", "tbsp", "volume", "0.015"),
        ("tablespoon", "tbsp", "volume", "0.015"),
        ("krm", "krm", "volume", "0.001"),
        ("kryddmått", "krm", "volume", "0.001"),
        ("US cup", "US cup", "volume", "0.2365882365"),
        ("metric cup", "metric cup", "volume", "0.25"),
        ("fl oz", "fl oz", "volume", "0.0295735295625"),
        ("US fl oz", "fl oz", "volume", "0.0295735295625"),
        # Swedish recipe spellings (slices plan, overlap point 2).
        ("matsked", "tbsp", "volume", "0.015"),
        ("msk.", "tbsp", "volume", "0.015"),
        ("tesked", "tsp", "volume", "0.005"),
        ("tsk.", "tsp", "volume", "0.005"),
        # Aliases of base and prefixed units.
        ("gram", "g", "mass", "1"),
        ("grams", "g", "mass", "1"),
        ("litre", "l", "volume", "1"),
        ("liter", "l", "volume", "1"),
        ("L", "l", "volume", "1"),
        ("ug", "µg", "mass", "0.000001"),
        ("mcg", "µg", "mass", "0.000001"),
        ("Kcal", "kcal", "energy", "4184"),
        ("kcal", "kcal", "energy", "4184"),
        ("Cal", "kcal", "energy", "4184"),
    ],
)
def test_listed_units_and_aliases(text, symbol, category, unit_factor):
    unit = parse(text)
    assert (unit.symbol, unit.category, unit.factor) == (symbol, category, Decimal(unit_factor))


@pytest.mark.parametrize(
    ("text", "symbol"),
    [
        ("  g ", "g"),
        ("KG", "kg"),
        ("Mg", "mg"),
        ("dL", "dl"),
        ("mL", "ml"),
        ("kj", "kJ"),
        ("KCAL", "kcal"),
        ("MSK", "tbsp"),
        ("us   cup", "US cup"),
        ("Metric Cup", "metric cup"),
        ("FL OZ", "fl oz"),
    ],
)
def test_case_and_spaces_do_not_matter(text, symbol):
    assert parse(text).symbol == symbol


def test_cal_is_the_small_calorie_and_Cal_the_kilocalorie():
    assert parse("cal").symbol == "cal"
    assert parse("CAL").symbol == "cal"
    assert parse("Cal").symbol == "kcal"


@pytest.mark.parametrize("text", ["µg", "μg", "ug", "UG"])
def test_micro_is_the_micro_sign_the_greek_mu_or_u(text):
    assert parse(text).symbol == "µg"


@pytest.mark.parametrize("text", ["ul", "μl", "uJ"])
def test_u_stands_for_micro_on_every_base(text):
    assert parse(text).symbol in {"µl", "µJ"}


@pytest.mark.parametrize("text", ["slice", "IU", "pinch", "cup", "", "  ", "dag", "mcl", "kkg"])
def test_other_text_is_free_text(text):
    assert parse(text) is None


@pytest.mark.parametrize("text", ["st", "st.", "stycken", "styck", "pcs", "piece", "pieces", "ST", " St "])
def test_pieces_are_a_known_free_text_unit(text):
    unit = parse(text)
    assert (unit.symbol, unit.category, unit.factor) == ("st", None, None)


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("g", "kg", "0.001"),
        ("kg", "g", "1000"),
        ("mg", "µg", "1000"),
        ("oz", "g", "28.349523125"),
        ("lb", "oz", "16"),
        ("kcal", "kJ", "4.184"),
        ("tbsp", "tsp", "3"),
        ("tbsp", "dl", "0.15"),
        ("dl", "ml", "100"),
        ("g", "gram", "1"),
        ("st", "pieces", "1"),
    ],
)
def test_factor_within_a_category_is_exact(a, b, expected):
    assert factor(a, b) == Decimal(expected)


def test_a_factor_that_does_not_end_is_cut_at_28_digits():
    there, back = factor("metric cup", "US cup"), factor("US cup", "metric cup")
    assert back == Decimal("0.946352946")
    assert len(there.as_tuple().digits) == 28
    assert abs(there * back - 1) < Decimal("1e-26")


@pytest.mark.parametrize(
    ("a", "b"),
    [("g", "dl"), ("kcal", "g"), ("st", "g"), ("g", "st"), ("slice", "slice"), ("IU", "mg"), ("cup", "dl")],
)
def test_no_factor_across_categories_or_with_free_text(a, b):
    assert factor(a, b) is None


def test_display_units_go_from_small_to_large_per_category_then_pieces():
    assert [unit.symbol for unit in display_units()] == [
        "µg", "mg", "g", "oz", "lb", "kg",
        "ml", "krm", "tsp", "cl", "tbsp", "fl oz", "dl", "US cup", "metric cup", "l",
        "kJ", "kcal",
        "st",
    ]  # fmt: skip


def test_display_units_of_one_category():
    assert [unit.symbol for unit in display_units("energy")] == ["kJ", "kcal"]


def test_each_display_unit_reads_as_itself_with_its_aliases():
    for unit in display_units():
        assert parse(unit.symbol) == unit
        for alias in unit.aliases:
            assert parse(alias) == unit


def test_the_categories_are_in_order():
    assert units.CATEGORIES == ("mass", "volume", "energy")
