from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from server import models, recipe_import
from server.ai.draft import Draft, LineDraft, SectionDraft
from server.ai.errors import AIServiceError, BadAnswerError, NoRecipeFound
from server.ai_usage import DailyLimitReached
from server.db import migrate

D = Decimal


def ingredient(id, name, unit="g", conversions=()):
    return models.Ingredient(
        id=id,
        name=name,
        unit=unit,
        basis=D(100),
        values=[],
        tags=[],
        conversions=[models.IngredientConversion(unit=u, factor=D(f), source="user") for u, f in conversions],
    )


def line(food="oats", amount="100", unit="g", match="Oats", skip=False, text=None):
    return LineDraft(text or f"{amount} {unit} {food}", None if amount is None else D(amount), unit, food, match, skip)


def draft(*sections, name="Porridge", servings=2, instructions="Boil."):
    if sections and isinstance(sections[0], LineDraft):
        sections = (SectionDraft("", tuple(sections)),)
    return Draft(name, servings, instructions, tuple(sections))


OATS = ingredient(1, "Oats")
MILK = ingredient(2, "Milk", "g")


def check_one(one, ingredients=(OATS, MILK)):
    return recipe_import.check(draft(one), list(ingredients))[0].lines[0]


# matching ---------------------------------------------------------------


@pytest.mark.parametrize("match", ["oats", " OATS ", "Oats"])
def test_a_match_finds_the_ingredient_ignoring_case_and_spaces(match):
    result = check_one(line(match=match))
    assert result.ingredient_id == 1 and result.status == "own_unit"


def test_a_match_naming_nothing_is_unmatched():
    result = check_one(line(match="Truffle"))
    assert result.ingredient_id is None and result.status == "unmatched"
    assert check_one(line(match=None)).status == "unmatched"


def test_a_not_an_ingredient_line_ignores_its_match():
    result = check_one(line(amount=None, unit="", match="Oats", skip=True))
    assert result.status == "not_an_ingredient" and result.ingredient_id is None and result.amount is None


def test_on_a_name_tie_the_first_ingredient_wins():
    twin = ingredient(9, "oats")
    assert check_one(line(match="OATS"), [OATS, twin]).ingredient_id == 1


# statuses ---------------------------------------------------------------


@pytest.mark.parametrize("unit", ["", "g", "gram", "Grams"])
def test_own_unit_in_any_spelling_is_stored_empty(unit):
    result = check_one(line(unit=unit))
    assert (result.status, result.unit) == ("own_unit", "")


def test_stycken_is_the_own_unit_of_st():
    egg = ingredient(3, "Egg", "st")
    result = check_one(line("egg", "2", "Stycken", "Egg"), [egg])
    assert (result.status, result.unit) == ("own_unit", "")


@pytest.mark.parametrize(
    ("unit", "own", "stored"), [("oz", "g", ()), ("kg", "g", ()), ("msk", "dl", ())]
)
def test_a_catalogue_step_straight_to_the_own_unit(unit, own, stored):
    item = ingredient(4, "Thing", own)
    assert check_one(line("thing", "1", unit, "Thing"), [item]).status == "built_in_step"


def test_a_stored_conversion_is_used():
    cases = [
        ("dl", [("dl", 40)], "dl"),
        ("msk", [("dl", 40)], "msk"),  # a catalogue step to the stored dl
        ("klyfta", [("klyfta", 5)], "klyfta"),
    ]
    for unit, stored, kept in cases:
        item = ingredient(4, "Thing", "g", stored)
        result = check_one(line("thing", "1", unit, "Thing"), [item])
        assert (result.status, result.unit) == ("stored_conversion", kept)


def test_a_unit_without_a_route_needs_a_factor():
    assert check_one(line("oats", "1", "dl")).status == "needs_factor"
    assert check_one(line("oats", "1", "klyfta")).status == "needs_factor"


def test_energy_and_overlong_units_are_bad():
    assert check_one(line(unit="kcal")).status == "bad_unit"
    result = check_one(line(unit="x" * 25))
    assert result.status == "bad_unit" and result.unit == "x" * 20


def test_canonical_unit_forms():
    assert check_one(line(unit="msk.", match="Oats")).unit == "msk"
    item = ingredient(4, "Thing", "g", [("Dl", 40)])
    assert check_one(line("thing", "1", "dl", "Thing"), [item]).unit == "Dl"


def test_needs_you_counts_unmatched_factor_and_bad_unit_only():
    lines = [
        line(match="Truffle"),  # unmatched
        line(unit="dl"),  # needs a factor
        line(unit="kcal"),  # bad unit
        line(),  # ready
        line(amount=None, unit="", skip=True),  # skipped kind
    ]
    sections = recipe_import.check(draft(*lines), [OATS])
    assert [x.status for x in sections[0].lines] == [
        "unmatched", "needs_factor", "bad_unit", "own_unit", "not_an_ingredient"
    ]


# amounts ----------------------------------------------------------------


def test_amounts_round_half_up_to_six_decimals():
    assert check_one(line(amount="0.3333333")).amount == D("0.333333")
    assert check_one(line(amount="0.0000005")).amount == D("0.000001")


@pytest.mark.parametrize("amount", ["0.0000004", str(10**9)])
def test_an_amount_that_rounds_to_zero_or_is_too_big_is_a_bad_answer(amount):
    with pytest.raises(BadAnswerError):
        check_one(line(amount=amount))


# cleaning ---------------------------------------------------------------


def test_the_draft_is_cleaned():
    long = "x" * 600
    result = recipe_import.check(draft(line(text=long, food="f" * 300)), [OATS])[0].lines[0]
    assert len(result.original_text) == 500 and len(result.food) == 200


def test_empty_sections_are_dropped_and_unnamed_ones_numbered():
    sections = recipe_import.check(
        draft(
            SectionDraft("", (line(),)),
            SectionDraft("Empty", ()),
            SectionDraft("  Sauce  ", (line(),)),
            SectionDraft("", (line(),)),
        ),
        [OATS],
    )
    assert [s.name for s in sections] == ["Section 1", "Sauce", "Section 3"]


def test_a_single_unnamed_section_stays_unnamed():
    assert recipe_import.check(draft(line()), [OATS])[0].name == ""


def test_too_many_sections_or_lines_is_a_bad_answer():
    with pytest.raises(BadAnswerError):
        recipe_import.check(draft(*[SectionDraft("s", (line(),))] * 51), [OATS])
    with pytest.raises(BadAnswerError):
        recipe_import.check(draft(SectionDraft("s", tuple(line() for _ in range(201)))), [OATS])


# the service ------------------------------------------------------------


class Converter:
    def __init__(self, *results):
        self.results = list(results)
        self.calls = 0

    def convert(self, text, catalog):
        self.calls += 1
        self.text = text
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class Suggester:
    def __init__(self, *results, default="50"):
        self.results = list(results)
        self.default = default
        self.calls = []

    def suggest(self, entry, unit, food):
        self.calls.append((entry.name, unit, food))
        result = self.results.pop(0) if self.results else D(self.default)
        if isinstance(result, Exception):
            raise result
        return D(result)


@pytest.fixture
def db(database_url):
    migrate(database_url)
    engine = create_engine(database_url)
    with Session(engine) as session:
        session.add_all([models.Ingredient(name="Oats", unit="g", basis=D(100)), models.Ingredient(name="Milk", unit="g", basis=D(100))])
        session.commit()
        yield session
    engine.dispose()


def run(db, converter, suggester=None, text="a recipe"):
    return recipe_import.import_recipe(db, text, converter, suggester or Suggester())


def test_import_ties_it_together(db):
    result = run(db, Converter(draft(line(), line("milk", "3", "dl", "Milk"), line("x", "1", "g", "Nope"))))
    assert [l.status for l in result.sections[0].lines] == ["own_unit", "needs_factor", "unmatched"]
    assert result.sections[0].lines[1].suggested_factor == D("50")
    assert result.needs_you == 2 and result.cut is False and result.source_url == ""
    assert db.query(models.Ingredient).count() == 2


def test_the_name_and_instructions_are_cut(db):
    result = run(db, Converter(draft(line(), name="  " + "n" * 150, instructions="i" * 30000)))
    assert len(result.name) == 100 and len(result.instructions) == 20000


def test_a_long_text_is_cut_and_says_so(db):
    converter = Converter(draft(line()))
    result = run(db, converter, text="q" * 20001)
    assert result.cut is True and len(converter.text) == 20000
    assert run(db, Converter(draft(line())), text="q" * 20000).cut is False


def test_a_bad_answer_is_retried_once(db):
    converter = Converter(BadAnswerError("x"), draft(line()))
    run(db, converter)
    assert converter.calls == 2
    converter = Converter(BadAnswerError("x"), BadAnswerError("y"))
    with pytest.raises(BadAnswerError):
        run(db, converter)
    assert converter.calls == 2


def test_an_amount_out_of_range_is_retried(db):
    converter = Converter(draft(line(amount="0.0000004")), draft(line()))
    run(db, converter)
    assert converter.calls == 2


@pytest.mark.parametrize("error", [AIServiceError(500, "x"), NoRecipeFound("x"), DailyLimitReached()])
def test_other_errors_are_not_retried(db, error):
    converter = Converter(error, draft(line()))
    with pytest.raises(type(error)):
        run(db, converter)
    assert converter.calls == 1


def milk(unit, n=1):
    return [line("milk", "1", unit, "Milk") for _ in range(n)]


def test_two_lines_of_one_pair_make_one_call_and_both_carry_it(db):
    suggester = Suggester()
    result = run(db, Converter(draft(*milk("dl", 2))), suggester)
    assert len(suggester.calls) == 1
    assert [l.suggested_factor for l in result.sections[0].lines] == [D(50), D(50)]


def test_two_units_make_two_calls(db):
    suggester = Suggester()
    run(db, Converter(draft(*milk("dl"), *milk("klyfta"))), suggester)
    assert len(suggester.calls) == 2


def test_at_most_fifteen_suggestions(db):
    suggester = Suggester()
    result = run(db, Converter(draft(*[l for i in range(16) for l in milk(f"unit{i}")])), suggester)
    lines = result.sections[0].lines
    assert len(suggester.calls) == 15
    assert lines[15].suggested_factor is None and lines[14].suggested_factor == D(50)


def test_a_pair_that_stays_bad_is_empty_and_the_others_run(db):
    suggester = Suggester(BadAnswerError("a"), BadAnswerError("b"), "7")
    result = run(db, Converter(draft(*milk("dl"), *milk("klyfta"))), suggester)
    assert [l.suggested_factor for l in result.sections[0].lines] == [None, D(7)]


@pytest.mark.parametrize("error", [AIServiceError(None, "x"), DailyLimitReached()])
def test_an_outage_or_the_limit_stops_the_rest(db, error):
    suggester = Suggester(error)
    result = run(db, Converter(draft(*milk("dl"), *milk("klyfta"))), suggester)
    assert len(suggester.calls) == 1
    assert [l.suggested_factor for l in result.sections[0].lines] == [None, None]


@pytest.mark.parametrize("value", ["0.0000004", str(10**9)])
def test_a_factor_out_of_range_is_empty(db, value):
    result = run(db, Converter(draft(*milk("dl"))), Suggester(value, value))
    assert result.sections[0].lines[0].suggested_factor is None


def test_ready_lines_never_ask(db):
    suggester = Suggester()
    run(db, Converter(draft(line(), line(unit="kg"), line(match="Truffle"))), suggester)
    assert suggester.calls == []


def test_suggest_one(db):
    milk_id = db.query(models.Ingredient).filter_by(name="Milk").one().id
    suggester = Suggester(BadAnswerError("a"), "0.3333333")
    assert recipe_import.suggest_one(db, milk_id, "dl", "milk", suggester) == D("0.333333")
    assert len(suggester.calls) == 2
    with pytest.raises(BadAnswerError):
        recipe_import.suggest_one(db, milk_id, "dl", "milk", Suggester(BadAnswerError("a"), BadAnswerError("b")))
    once = Suggester(AIServiceError(500, "x"))
    with pytest.raises(AIServiceError):
        recipe_import.suggest_one(db, milk_id, "dl", "milk", once)
    assert len(once.calls) == 1
