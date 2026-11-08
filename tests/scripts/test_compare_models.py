import importlib.util
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from server.ai.chat import Completion
from server.ai.draft import Draft, LineDraft, SectionDraft
from server.ai.errors import AIServiceError
from server.ai.prompts import FACTOR_SYSTEM

ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "scripts" / "compare_models.py"
DATA_DIR = ROOT / "tests" / "data" / "recipe_import"

spec = importlib.util.spec_from_file_location("compare_models", SCRIPT)
cm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cm)


def line(text, amount=1, unit="dl", match="Mjölk", nai=False, food="x"):
    return LineDraft(text, None if amount is None else Decimal(str(amount)), unit, food, match, nai)


def draft(*lines, servings=4):
    return Draft("R", servings, "step", (SectionDraft("", tuple(lines)),))


BASE = (
    line("3 dl vetemjöl", 3, "dl", "Vetemjöl"),
    line("1 krm salt", 1, "krm", "Salt"),
    line("salt och peppar efter smak", None, "", None, True),
)


def checks(tally):
    return {m: tuple(v) for m, v in tally.checks.items()}


def all_right(tally):
    return all(r == t for r, t in checks(tally).values())


def test_identical_draft_is_all_right():
    t = cm.score_recipe(draft(*BASE), draft(*BASE))
    assert checks(t) == {
        "amount": (3, 3),
        "unit": (3, 3),
        "match": (3, 3),
        "not_an_ingredient": (3, 3),
        "servings": (1, 1),
    }
    assert (t.extra_lines, t.missing_lines) == (0, 0)


def test_amount_tolerance_is_one_percent():
    exp = draft(line("100 g mjöl", 100, "g"))
    assert checks(cm.score_recipe(exp, draft(line("100 g mjöl", "100.5", "g"))))["amount"] == (1, 1)
    assert checks(cm.score_recipe(exp, draft(line("100 g mjöl", 102, "g"))))["amount"] == (0, 1)
    null_vs_number = cm.score_recipe(draft(BASE[2]), draft(line("salt och peppar efter smak", 1, "", None, True)))
    assert checks(null_vs_number)["amount"] == (0, 1)


def test_unit_is_normalised_and_case_folded():
    exp = draft(line("1 msk smör", 1, "msk", "Smör"))
    assert checks(cm.score_recipe(exp, draft(line("1 msk smör", 1, "Msk.", "Smör"))))["unit"] == (1, 1)
    assert checks(cm.score_recipe(exp, draft(line("1 msk smör", 1, "tbsp", "Smör"))))["unit"] == (1, 1)
    egg = draft(line("2 ägg", 2, "st", "Ägg"))
    assert checks(cm.score_recipe(egg, draft(line("2 ägg", 2, "", "Ägg"))))["unit"] == (0, 1)
    none = draft(line("2 ägg", 2, "", "Ägg"))
    assert checks(cm.score_recipe(none, draft(line("2 ägg", 2, "", "Ägg"))))["unit"] == (1, 1)


def test_match_case_and_null():
    exp = draft(line("3 dl vetemjöl", 3, "dl", "Vetemjöl"))
    assert checks(cm.score_recipe(exp, draft(line("3 dl vetemjöl", 3, "dl", "vetemjöl"))))["match"] == (1, 1)
    assert checks(cm.score_recipe(exp, draft(line("3 dl vetemjöl", 3, "dl", None))))["match"] == (0, 1)
    nul = draft(line("saffron", 1, "g", None))
    assert checks(cm.score_recipe(nul, draft(line("saffron", 1, "g", "Salt"))))["match"] == (0, 1)
    assert checks(cm.score_recipe(nul, draft(line("saffron", 1, "g", None))))["match"] == (1, 1)


def test_flag_and_servings():
    exp = draft(*BASE)
    wrong = draft(BASE[0], BASE[1], line("salt och peppar efter smak", None, "", None, False), servings=3)
    t = checks(cm.score_recipe(exp, wrong))
    assert t["not_an_ingredient"] == (2, 3) and t["servings"] == (0, 1)


def test_order_spacing_and_case_do_not_matter():
    shuffled = draft(BASE[2], BASE[0], BASE[1])
    assert all_right(cm.score_recipe(draft(*BASE), shuffled))
    spaced = draft(
        line("  3   DL  Vetemjöl ", 3, "dl", "Vetemjöl"), BASE[1], BASE[2]
    )
    assert all_right(cm.score_recipe(draft(*BASE), spaced))


def test_missing_and_extra_lines():
    t = cm.score_recipe(draft(*BASE), draft(BASE[0], BASE[2]))
    assert t.missing_lines == 1
    c = checks(t)
    assert c["amount"] == (2, 3) and c["unit"] == (2, 3) and c["match"] == (2, 3)
    assert c["not_an_ingredient"] == (2, 3)
    extra = cm.score_recipe(draft(*BASE), draft(*BASE, line("2 lök på sidan, finhackade", 2, "", "Gul lök")))
    assert extra.extra_lines == 1 and extra.missing_lines == 0
    assert all_right(extra)


def test_best_pair_first():
    a = line("1 tbsp butter, melted", 1, "tbsp", "Smör")
    b = line("1 tbsp butter, softened", 2, "tbsp", "Smör")
    t = cm.score_recipe(draft(a, b), draft(b, a))
    assert all_right(t) and t.missing_lines == 0 and t.extra_lines == 0
    pairs, extra = cm.align([a, b], [b, a])
    assert pairs == [(a, a), (b, b)] and extra == []


def test_dissimilar_lines_are_not_paired():
    pairs, extra = cm.align([line("3 dl vetemjöl")], [line("completely different text")])
    assert pairs[0][1] is None and len(extra) == 1


def test_failed_call_scores_zero_with_right_totals():
    t = cm.score_recipe(draft(*BASE), None)
    assert checks(t) == {
        "amount": (0, 3),
        "unit": (0, 3),
        "match": (0, 3),
        "not_an_ingredient": (0, 3),
        "servings": (0, 1),
    }
    assert checks(cm.score_recipe(Draft("", 1, "", ()), None)) == {"no_recipe": (0, 1)}


def test_no_recipe_case():
    empty = Draft("", 1, "", ())
    assert checks(cm.score_recipe(empty, Draft("", 1, "", ()))) == {"no_recipe": (1, 1)}
    assert checks(cm.score_recipe(empty, draft(*BASE))) == {"no_recipe": (0, 1)}


def test_merge_sums():
    a = cm.score_recipe(draft(*BASE), draft(BASE[0]))
    b = cm.score_recipe(draft(*BASE), draft(*BASE))
    total = cm.merge([a, b])
    assert checks(total)["amount"] == (4, 6) and total.missing_lines == 2


def test_score_factor_edges():
    assert cm.score_factor(Decimal(100), Decimal(125))
    assert cm.score_factor(Decimal(100), Decimal(75))
    assert not cm.score_factor(Decimal(100), Decimal(126))
    assert not cm.score_factor(Decimal(100), None)


def test_cost_and_prices(tmp_path):
    price = cm.Price(Decimal("3"), Decimal("15"))
    assert cm.cost(2_000_000, 100_000, price) == Decimal("7.5")
    assert cm.cost(5, 5, None) is None
    path = tmp_path / "p.json"
    path.write_text('{"anthropic:m": {"input_per_mtok": 0.8, "output_per_mtok": 4}}')
    assert cm.load_prices(path) == {"anthropic:m": cm.Price(Decimal("0.8"), Decimal(4))}
    path.write_text('{"anthropic:m": {"input_per_mtok": 1}}')
    with pytest.raises(ValueError, match="output_per_mtok"):
        cm.load_prices(path)


# --- run_candidate --------------------------------------------------------------


@pytest.fixture(scope="module")
def data():
    return cm.load_data(DATA_DIR)


def test_load_data(data):
    assert len(data.recipes) == 10 and len(data.factors) == 12 and len(data.catalog) == 37
    assert data.factors[0].ingredient.unit


class ScriptedChat:
    """Answers each recipe with its expected file and each factor with its
    reference value; `fail` and `no_recipe_only` change that."""

    def __init__(self, data, fail=(), blank=()):
        self.data = data
        self.fail = set(fail)
        self.blank = set(blank)

    def complete(self, system, user, *, max_tokens):
        if system == FACTOR_SYSTEM:
            for fc in self.data.factors:
                if f"Ingredient: {fc.ingredient.name}, counted in {fc.ingredient.unit}. " \
                   f"How many {fc.ingredient.unit} is 1 {fc.unit} of: {fc.food}?" == user:
                    return Completion(json.dumps({"factor": float(fc.expected)}), 100, 10)
            raise AssertionError(user)
        for case in self.data.recipes:
            if case.text.strip() in user:
                if case.id in self.fail:
                    raise AIServiceError(503, "overloaded")
                if case.id in self.blank:
                    text = '{"name": "", "servings": 1, "instructions": "", "sections": []}'
                else:
                    text = (DATA_DIR / "recipes" / f"{case.id}.expected.json").read_text("utf-8")
                return Completion(text, 100, 10)
        raise AssertionError("unknown recipe")


def test_run_candidate_perfect(data):
    price = cm.Price(Decimal(1), Decimal(10))
    result = cm.run_candidate("fake:m", ScriptedChat(data, blank={"en-no-recipe"}), data, price=price)
    assert result.failures == []
    for metric, (right, total) in result.tally.checks.items():
        assert right == total, metric
    assert result.tally.checks["no_recipe"] == [1, 1]
    assert (result.factors_right, result.factors_total) == (12, 12)
    assert result.calls == 22
    assert (result.input_tokens, result.output_tokens) == (2200, 220)
    assert result.cost == Decimal("0.0044")
    assert cm.overall(result) == 100


def test_run_candidate_one_failure_is_isolated(data):
    chat = ScriptedChat(data, fail={"sv-pannkakor"}, blank={"en-no-recipe"})
    result = cm.run_candidate("fake:m", chat, data)
    assert result.failures == [("sv-pannkakor", "503: overloaded")]
    pannkakor = cm.score_recipe(
        next(c.expected for c in data.recipes if c.id == "sv-pannkakor"), None
    )
    assert pannkakor.checks["amount"] == [0, 5]
    amount = result.tally.checks["amount"]
    assert amount[1] - amount[0] == 5  # only that recipe's lines are wrong
    assert result.cost is None


def test_skip_factors_and_expected_no_recipe_answer(data):
    result = cm.run_candidate("fake:m", ScriptedChat(data), data, factors=False)
    # the scripted chat answers en-no-recipe with its expected file, which has no lines
    assert result.tally.checks["no_recipe"] == [1, 1]
    assert result.factors_total == 0


def test_progress_callback(data):
    seen = []
    cm.run_candidate(
        "fake:m", ScriptedChat(data), data, factors=False, progress=lambda *a: seen.append(a)
    )
    assert len(seen) == 10 and seen[0][0] == "fake:m"
    assert {s[2] for s in seen} == {"ok", "no recipe"}


def test_render_report_golden(data):
    good = cm.CandidateResult(
        "anthropic:a",
        cm.Tally(
            {"amount": [9, 10], "unit": [10, 10], "match": [8, 10], "not_an_ingredient": [10, 10],
             "servings": [1, 1], "no_recipe": [1, 1]},
            extra_lines=2,
        ),
        11, 12, [], 3000, 600, 22, 12.34, Decimal("0.0440"), 10,
    )
    bad = cm.CandidateResult(
        "openai:b",
        cm.Tally({"amount": [1, 10], "servings": [0, 1]}),
        0, 0, [("sv-pannkakor", "503: overloaded")], 10, 5, 3, 1.0, None, 10,
    )
    report = cm.render_report([bad, good], data, today=date(2026, 11, 8))
    expected = """# Model comparison

Date: 2026-11-08. 10 recipes, 12 factor cases. Run by hand; scores are a guide, not the decision.

| candidate | overall | amounts | units | matches | not-an-ingredient | servings | no recipe | factors | failures | extra lines | input tokens | output tokens | cost per recipe | cost total | seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| anthropic:a | 95% | 90% | 100% | 80% | 100% | 100% | 100% | 92% | 0 | 2 | 3000 | 600 | $0.0044 | $0.0440 | 12.3 |
| openai:b | 5% | 10% | - | - | - | 0% | - | - | 1 | 0 | 10 | 5 | n/a | n/a | 1.0 |

## Failures: openai:b

- sv-pannkakor: 503: overloaded
"""
    assert report == expected
