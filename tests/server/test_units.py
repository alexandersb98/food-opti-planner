from decimal import Context, Decimal
from fractions import Fraction

import pytest

from server import units
from server.units import Unit, factor, normalise, parse, ratio

D = Decimal

PREFIXED = [
    ("µg", "mass", "0.000001"), ("mg", "mass", "0.001"), ("cg", "mass", "0.01"),
    ("dg", "mass", "0.1"), ("g", "mass", "1"), ("kg", "mass", "1000"),
    ("µl", "volume", "0.000001"), ("ml", "volume", "0.001"), ("cl", "volume", "0.01"),
    ("dl", "volume", "0.1"), ("l", "volume", "1"), ("kl", "volume", "1000"),
    ("µJ", "energy", "0.000001"), ("mJ", "energy", "0.001"), ("cJ", "energy", "0.01"),
    ("dJ", "energy", "0.1"), ("J", "energy", "1"), ("kJ", "energy", "1000"),
    ("µcal", "energy", "0.000004184"), ("mcal", "energy", "0.004184"),
    ("ccal", "energy", "0.04184"), ("dcal", "energy", "0.4184"),
    ("cal", "energy", "4.184"), ("kcal", "energy", "4184"),
]

LISTED = [
    ("oz", "mass", "28.349523125"), ("lb", "mass", "453.59237"),
    ("krm", "volume", "0.001"), ("tsk", "volume", "0.005"), ("msk", "volume", "0.015"),
    ("US cup", "volume", "0.2365882365"), ("metric cup", "volume", "0.25"),
    ("fl oz", "volume", "0.0295735295625"),
]

ALIASES = [
    ("ounce", "oz"), ("pound", "lb"), ("tsp", "tsk"), ("teaspoon", "tsk"), ("tesked", "tsk"),
    ("tsk", "tsk"), ("tbsp", "msk"), ("tablespoon", "msk"), ("matsked", "msk"), ("msk", "msk"),
    ("kryddmått", "krm"), ("US fl oz", "fl oz"), ("gram", "g"), ("grams", "g"),
    ("litre", "l"), ("liter", "l"), ("litres", "l"), ("liters", "l"), ("L", "l"),
    ("ug", "µg"), ("mcg", "µg"), ("mikrog", "µg"), ("Mikrogram", "µg"), ("Kcal", "kcal"), ("Cal", "kcal"),
]

PIECE_SPELLINGS = ["st", "st.", "stycken", "styck", "pcs", "piece", "pieces", "ST"]


@pytest.mark.parametrize(("symbol", "category", "base_factor"), PREFIXED + LISTED)
def test_symbol_category_and_factor(symbol, category, base_factor):
    unit = parse(symbol)
    assert unit is not None
    assert (unit.symbol, unit.category, unit.factor) == (symbol, category, D(base_factor))


@pytest.mark.parametrize(("alias", "symbol"), ALIASES)
def test_aliases_parse_to_their_unit(alias, symbol):
    assert parse(alias).symbol == symbol


def test_both_mu_characters_and_ug_are_one_unit():
    micro, greek = "µg", "μg"
    assert parse(micro) is parse(greek) is parse("ug") is parse("mcg") is parse("mikrog")
    assert parse(greek).symbol == micro


@pytest.mark.parametrize(
    ("text", "symbol"),
    [("  KG ", "kg"), ("Dl", "dl"), ("MSK", "msk"), ("US  cup", "US cup"), ("fl   oz", "fl oz"),
     ("msk.", "msk"), ("st.", "st"), ("tsk.", "tsk"), ("dl.", "dl")],
)
def test_case_spaces_and_trailing_period(text, symbol):
    assert parse(text).symbol == symbol


def test_cal_and_Cal_differ():
    assert parse("cal").symbol == "cal"
    assert parse("cal").factor == D("4.184")
    assert not parse("cal").offered
    assert parse("Cal").symbol == "kcal"
    assert parse("CAL").symbol == "cal"


@pytest.mark.parametrize("text", PIECE_SPELLINGS)
def test_known_free_text_unit(text):
    unit = parse(text)
    assert unit is units.parse("st")
    assert unit.category is None and unit.factor is None and unit.offered


@pytest.mark.parametrize("text", ["cup", "IU", "pinch", "", "  ", "dl2", "kgs", "."])
def test_free_text_stays_free(text):
    assert parse(text) is None


@pytest.mark.parametrize(
    ("text", "result"),
    [("gram", "g"), ("MSK.", "msk"), (" IU ", "IU"), ("matsked", "msk"), ("pcs", "st")],
)
def test_normalise(text, result):
    assert normalise(text) == result


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [("kg", "g", "1000"), ("g", "kg", "0.001"), ("mg", "µg", "1000"), ("dl", "ml", "100"),
     ("msk", "ml", "15"), ("oz", "lb", "0.0625"), ("lb", "oz", "16"),
     ("US cup", "ml", "236.5882365"), ("kcal", "kJ", "4.184")],
)
def test_exact_factors(a, b, expected):
    assert factor(a, b) == D(expected)


@pytest.mark.parametrize(
    ("a", "b", "reciprocal"), [("ml", "msk", "15"), ("kJ", "kcal", "4.184")]
)
def test_inexact_factors_are_within_1e30(a, b, reciprocal):
    assert abs(factor(a, b) - Context(prec=60).divide(1, D(reciprocal))) < D("1e-30")


@pytest.mark.parametrize(
    ("a", "b"),
    [("g", "ml"), ("ml", "kcal"), ("g", "kcal"), ("st", "g"), ("g", "st"), ("IU", "g"),
     ("IU", "pinch"), ("", ""), ("  ", "  "), ("cup", "dl"), ("", "g"), ("g", "")],
)
def test_no_factor(a, b):
    assert factor(a, b) is None


@pytest.mark.parametrize(
    ("a", "b"), [("st", "pcs"), ("IU", "iu"), ("g", "gram"), ("dl", "dl"), ("cup", "cup")]
)
def test_factor_one(a, b):
    assert factor(a, b) == 1


def test_catalogue_invariants():
    catalogue = units.catalogue()
    assert len(catalogue) == 33
    symbols = [u.symbol for u in catalogue]
    assert len(set(symbols)) == len(symbols)
    for unit in catalogue:
        assert (unit.category is None) == (unit.factor is None)
        assert unit.factor is None or isinstance(unit.factor, Decimal)
        for spelling in (unit.symbol, *unit.aliases, *unit.case_sensitive_aliases):
            assert parse(spelling) is unit, spelling
    assert [u.symbol for u in catalogue if u.category is None] == ["st"]


def test_clashing_spelling_raises():
    def unit(symbol, aliases=()):
        return Unit(symbol, symbol, "mass", D(1), tuple(aliases), (), True)

    with pytest.raises(ValueError, match="gram"):
        units._build_lookups([unit("g", ["gram"]), unit("kg", ["Gram"])])
    with pytest.raises(ValueError, match="x"):
        units._build_lookups([unit("x"), unit("X")])


def test_offered_lists():
    def symbols(category):
        return [u.symbol for u in units.offered(category)]

    assert symbols("mass") == ["µg", "mg", "g", "kg", "oz", "lb"]
    assert symbols("volume") == [
        "ml", "cl", "dl", "l", "krm", "tsk", "msk", "fl oz", "US cup", "metric cup",
    ]
    assert symbols("energy") == ["kJ", "kcal"]
    assert symbols(None) == symbols("mass") + symbols("volume") + symbols("energy") + ["st"]
    assert [u.symbol for u in units.catalogue() if u.offered] == symbols(None)


@pytest.mark.parametrize(
    ("text", "symbol"),
    [("mJ", "mJ"), ("KCAL", "kcal"), ("Kg", "kg"), ("mL", "ml"), ("MCG", "µg"), ("MSK", "msk"), ("mcal", "mcal")],
)
def test_milli_is_lower_case_m_only(text, symbol):
    assert parse(text).symbol == symbol


@pytest.mark.parametrize("text", ["MJ", "Ml", "ML", "Mg", "MG", "Mcal", "MCAL"])
def test_capital_m_is_mega_which_is_not_known(text):
    assert parse(text) is None
    assert factor(text, "J") is None


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("g", "kg", Fraction(1, 1000)), ("lb", "oz", Fraction(16)), ("fl oz", "US cup", Fraction(1, 8)),
        ("oz", "g", Fraction("28.349523125")), ("tsk", "msk", Fraction(1, 3)),
        ("g", "gram", 1), ("pinch", "Pinch", 1), ("st", "pcs", 1),
    ],
)
def test_ratio_is_exact(a, b, expected):
    assert ratio(a, b) == expected


def test_ratio_that_has_no_decimal_is_still_exact():
    assert ratio("msk", "US cup") == Fraction("0.015") / Fraction("0.2365882365")
    assert ratio("msk", "US cup") * ratio("US cup", "msk") == 1


@pytest.mark.parametrize(("a", "b"), [("g", "ml"), ("g", "kcal"), ("pinch", "g"), ("g", "pinch"), ("st", "g"), ("pinch", "dash"), ("", "")])
def test_no_ratio(a, b):
    assert ratio(a, b) is None


@pytest.mark.parametrize(
    ("a", "b"),
    [("g", "kg"), ("kg", "g"), ("ml", "dl"), ("oz", "lb"), ("tsk", "msk"), ("g", "g"), ("pinch", "pinch"), ("g", "ml"), ("kcal", "kJ")],
)
def test_ratio_agrees_with_factor(a, b):
    f, r = factor(a, b), ratio(a, b)
    assert (f is None) == (r is None)
    if f is not None:
        assert abs(Fraction(f) - r) < Fraction(1, 10**30)
