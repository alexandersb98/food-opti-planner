from decimal import Decimal
from fractions import Fraction

import pytest

from server import units
from server.line_units import Route, is_own, route

D = Decimal
DL40 = [("dl", D("40"))]


@pytest.mark.parametrize(
    ("unit", "own"),
    [("", "g"), ("g", "g"), ("gram", "g"), ("stycken", "st"), ("Portion", "portion"), (" portion", "Portion")],
)
def test_the_ingredients_own_unit_has_factor_1(unit, own):  # rule 1
    assert route(unit, own, []) == Route(Fraction(1), None)
    assert is_own(unit, own)


def test_own_unit_wins_over_a_conversion_for_it():
    assert route("g", "g", [("g", D("2"))]) == Route(Fraction(1), None)


@pytest.mark.parametrize(
    ("unit", "own", "conversions", "expected"),
    [
        ("DL", "g", DL40, Route(Fraction(40), "dl")),  # the catalogue reads case-insensitively
        ("Pinch", "g", [("pinch", D("0.3"))], Route(Fraction(3, 10), "pinch")),
        ("g", "st", [("g", D("0.01"))], Route(Fraction(1, 100), "g")),
        ("tbsp", "g", [("msk", D("10"))], Route(Fraction(10), "msk")),  # spelling of the stored one is kept
    ],
)
def test_a_stored_conversion_for_the_unit(unit, own, conversions, expected):  # rule 2
    assert route(unit, own, conversions) == expected


def test_a_stored_conversion_wins_over_a_catalogue_step():  # rule 2 before 4
    assert route("msk", "g", [("dl", D("40")), ("msk", D("10"))]) == Route(Fraction(10), "msk")


@pytest.mark.parametrize(
    ("unit", "own", "expected"),
    [
        ("oz", "g", Fraction(28349523125, 10**9)),
        ("kg", "g", Fraction(1000)),
        ("msk", "dl", Fraction(15, 100)),
        ("tsk", "l", Fraction(5, 1000)),
    ],
)
def test_a_catalogue_step_straight_to_the_own_unit(unit, own, expected):  # rule 3
    assert route(unit, own, []) == Route(expected, None)


def test_a_catalogue_step_to_the_own_unit_wins_over_a_conversion_for_another():
    assert route("kg", "g", DL40) == Route(Fraction(1000), None)


def test_a_catalogue_step_through_a_conversion():  # rule 4
    assert route("msk", "g", DL40) == Route(40 * units.ratio("msk", "dl"), "dl")
    assert route("msk", "g", DL40).factor == 6  # 0.15 dl of 40 g per dl
    us_cup = route("US cup", "g", DL40)
    assert us_cup == Route(units.ratio("US cup", "dl") * 40, "dl")
    assert us_cup.factor == Fraction(2365882365, 10**9) * 40  # 2.365882365 dl


def test_the_first_conversion_in_order_wins_in_rule_4():
    assert route("tsk", "g", [("dl", D("40")), ("msk", D("6"))]).via == "dl"
    assert route("tsk", "g", [("msk", D("6")), ("dl", D("40"))]).via == "msk"


@pytest.mark.parametrize(
    ("unit", "own", "conversions"),
    [
        ("dl", "g", []),
        ("g", "dl", []),
        ("cup", "g", []),
        ("kcal", "g", []),
        ("pinch", "st", []),
        ("dl", "g", [("pinch", D("0.3"))]),
        ("pinch", "g", DL40),
    ],
)
def test_a_line_that_does_not_convert(unit, own, conversions):  # rule 5
    assert route(unit, own, conversions) is None


def test_is_own_is_false_for_another_unit():
    assert not is_own("kg", "g")
    assert not is_own("dl", "g")
