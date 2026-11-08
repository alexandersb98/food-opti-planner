"""Compare AI models on the recipe-import test data (run by hand).

Scores each candidate `provider:model` on amounts, units, matches, servings,
not-an-ingredient flags, "no recipe" and unit factors, and prints a Markdown
report with token counts and cost.
"""

import json
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import units  # noqa: E402
from server.ai.chat import ChatProvider, MeteredChat  # noqa: E402
from server.ai.converter import ProviderFactorSuggester, ProviderRecipeConverter  # noqa: E402
from server.ai.draft import CatalogEntry, Draft, LineDraft  # noqa: E402
from server.ai.errors import AIError, NoRecipeFound  # noqa: E402
from server.ai.schema import parse_draft  # noqa: E402

DEFAULT_DATA = ROOT / "tests" / "data" / "recipe_import"
PAIR_THRESHOLD = 0.6
AMOUNT_TOLERANCE = Decimal("0.01")
METRICS = ("amount", "unit", "match", "not_an_ingredient", "servings", "no_recipe")


@dataclass(frozen=True)
class RecipeCase:
    id: str
    text: str
    expected: Draft


@dataclass(frozen=True)
class FactorCase:
    ingredient: CatalogEntry
    unit: str
    food: str
    expected: Decimal

    @property
    def id(self) -> str:
        return f"factor:{self.ingredient.name}/{self.unit}"


@dataclass(frozen=True)
class Data:
    catalog: list[CatalogEntry]
    recipes: list[RecipeCase]
    factors: list[FactorCase]


def load_data(directory: Path) -> Data:
    directory = Path(directory)
    raw_catalog = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))
    catalog = [
        CatalogEntry(c["name"], c["unit"], tuple(c.get("conversion_units", ()))) for c in raw_catalog
    ]
    by_name = {c.name.lower(): c for c in catalog}
    recipes = []
    for txt in sorted((directory / "recipes").glob("*.txt")):
        expected = parse_draft(txt.with_suffix(".expected.json").read_text(encoding="utf-8"))
        recipes.append(RecipeCase(txt.stem, txt.read_text(encoding="utf-8"), expected))
    raw_factors = json.loads(
        (directory / "factors.json").read_text(encoding="utf-8"), parse_float=Decimal
    )
    factors = [
        FactorCase(by_name[f["ingredient"].lower()], f["unit"], f["food"], Decimal(f["expected"]))
        for f in raw_factors
    ]
    return Data(catalog, recipes, factors)


# --- scoring -----------------------------------------------------------------


def _text_key(text: str) -> str:
    return " ".join(text.lower().split())


def align(
    expected: Sequence[LineDraft], actual: Sequence[LineDraft]
) -> tuple[list[tuple[LineDraft, LineDraft | None]], list[LineDraft]]:
    """Pair lines greedily by similarity of their original text, best pair
    first; pairs below the threshold are not made. Returns the expected lines
    in order with their partner (or None), and the unpaired actual lines."""
    candidates = []
    for i, e in enumerate(expected):
        for j, a in enumerate(actual):
            ratio = SequenceMatcher(None, _text_key(e.original_text), _text_key(a.original_text)).ratio()
            if ratio >= PAIR_THRESHOLD:
                candidates.append((ratio, i, j))
    candidates.sort(key=lambda c: (-c[0], c[1], c[2]))
    partner: dict[int, int] = {}
    taken: set[int] = set()
    for _, i, j in candidates:
        if i not in partner and j not in taken:
            partner[i] = j
            taken.add(j)
    pairs = [(e, actual[partner[i]] if i in partner else None) for i, e in enumerate(expected)]
    extra = [a for j, a in enumerate(actual) if j not in taken]
    return pairs, extra


@dataclass
class Tally:
    checks: dict[str, list[int]] = field(default_factory=dict)  # metric -> [right, total]
    extra_lines: int = 0
    missing_lines: int = 0

    def add(self, metric: str, right: bool, count: int = 1) -> None:
        cell = self.checks.setdefault(metric, [0, 0])
        cell[0] += count if right else 0
        cell[1] += count


def merge(tallies: Sequence[Tally]) -> Tally:
    total = Tally()
    for tally in tallies:
        for metric, (right, count) in tally.checks.items():
            cell = total.checks.setdefault(metric, [0, 0])
            cell[0] += right
            cell[1] += count
        total.extra_lines += tally.extra_lines
        total.missing_lines += tally.missing_lines
    return total


def _amount_ok(expected: Decimal | None, actual: Decimal | None) -> bool:
    if expected is None or actual is None:
        return expected is None and actual is None
    return abs(actual - expected) <= AMOUNT_TOLERANCE * abs(expected)


def _unit_ok(expected: str, actual: str) -> bool:
    return units.normalise(expected).casefold() == units.normalise(actual).casefold()


def _match_ok(expected: str | None, actual: str | None) -> bool:
    if expected is None or actual is None:
        return expected is None and actual is None
    return expected.casefold() == actual.casefold()


def score_recipe(expected: Draft, actual: Draft | None) -> Tally:
    """Score one answer. `actual=None` (a failed call) scores zero on every
    check the recipe has. A recipe with no lines is the "no recipe" case: its
    only check is `no_recipe`."""
    tally = Tally()
    expected_lines = expected.lines
    if not expected_lines:
        tally.add("no_recipe", actual is not None and not actual.lines)
        return tally
    if actual is None:
        for metric in ("amount", "unit", "match", "not_an_ingredient"):
            tally.add(metric, False, len(expected_lines))
        tally.add("servings", False)
        tally.missing_lines = len(expected_lines)
        return tally
    pairs, extra = align(expected_lines, actual.lines)
    for e, a in pairs:
        if a is None:
            tally.missing_lines += 1
        tally.add("amount", a is not None and _amount_ok(e.amount, a.amount))
        tally.add("unit", a is not None and _unit_ok(e.unit, a.unit))
        tally.add("match", a is not None and _match_ok(e.match, a.match))
        tally.add("not_an_ingredient", a is not None and e.not_an_ingredient == a.not_an_ingredient)
    tally.extra_lines = len(extra)
    tally.add("servings", expected.servings == actual.servings)
    return tally


def score_factor(
    expected: Decimal, actual: Decimal | None, tolerance: Decimal = Decimal("0.25")
) -> bool:
    return actual is not None and abs(actual - expected) <= tolerance * expected


# --- cost ----------------------------------------------------------------------


@dataclass(frozen=True)
class Price:
    input_per_mtok: Decimal
    output_per_mtok: Decimal


def cost(input_tokens: int, output_tokens: int, price: Price | None) -> Decimal | None:
    if price is None:
        return None
    million = Decimal(1_000_000)
    return (
        Decimal(input_tokens) / million * price.input_per_mtok
        + Decimal(output_tokens) / million * price.output_per_mtok
    )


def load_prices(path: Path) -> dict[str, Price]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"), parse_float=Decimal)
    if not isinstance(raw, dict):
        raise ValueError(f"{path}: expected an object keyed by 'provider:model'")
    prices = {}
    for candidate, entry in raw.items():
        for key in ("input_per_mtok", "output_per_mtok"):
            if not isinstance(entry, dict) or key not in entry:
                raise ValueError(f"{path}: {candidate!r} has no {key!r}")
            if isinstance(entry[key], bool) or not isinstance(entry[key], (int, Decimal)):
                raise ValueError(f"{path}: {candidate!r}.{key} must be a number")
        prices[candidate] = Price(Decimal(entry["input_per_mtok"]), Decimal(entry["output_per_mtok"]))
    return prices


# --- running ---------------------------------------------------------------------


@dataclass
class CandidateResult:
    candidate: str
    tally: Tally
    factors_right: int
    factors_total: int
    failures: list[tuple[str, str]]
    input_tokens: int
    output_tokens: int
    calls: int
    seconds: float
    cost: Decimal | None
    recipes: int


def percent(cell: Sequence[int] | None) -> float | None:
    if not cell or not cell[1]:
        return None
    return 100 * cell[0] / cell[1]


def overall(result: CandidateResult) -> float:
    """Mean of the draft percentages that have checks (a guide, not the decision)."""
    values = [p for m in METRICS if (p := percent(result.tally.checks.get(m))) is not None]
    return sum(values) / len(values) if values else 0.0


Progress = Callable[[str, str, str, float], None]


def run_candidate(
    candidate_id: str,
    chat: ChatProvider,
    data: Data,
    *,
    factors: bool = True,
    price: Price | None = None,
    progress: Progress | None = None,
) -> CandidateResult:
    metered = MeteredChat(chat)
    converter = ProviderRecipeConverter(metered)
    suggester = ProviderFactorSuggester(metered)
    tallies = []
    failures: list[tuple[str, str]] = []
    started = time.monotonic()

    def note(case_id: str, status: str, since: float) -> None:
        if progress:
            progress(candidate_id, case_id, status, time.monotonic() - since)

    for case in data.recipes:
        t0 = time.monotonic()
        actual: Draft | None
        try:
            actual = converter.convert(case.text, data.catalog)
            note(case.id, "ok", t0)
        except NoRecipeFound:
            actual = Draft("", 1, "", ())
            note(case.id, "no recipe", t0)
        except AIError as exc:
            actual = None
            failures.append((case.id, str(exc)))
            note(case.id, "failed", t0)
        tallies.append(score_recipe(case.expected, actual))
    right = total = 0
    if factors:
        for fc in data.factors:
            t0 = time.monotonic()
            value: Decimal | None
            try:
                value = suggester.suggest(fc.ingredient, fc.unit, fc.food)
                note(fc.id, "ok", t0)
            except AIError as exc:
                value = None
                failures.append((fc.id, str(exc)))
                note(fc.id, "failed", t0)
            total += 1
            right += score_factor(fc.expected, value)
    return CandidateResult(
        candidate=candidate_id,
        tally=merge(tallies),
        factors_right=right,
        factors_total=total,
        failures=failures,
        input_tokens=metered.input_tokens,
        output_tokens=metered.output_tokens,
        calls=metered.calls,
        seconds=time.monotonic() - started,
        cost=cost(metered.input_tokens, metered.output_tokens, price),
        recipes=len(data.recipes),
    )


# --- report ------------------------------------------------------------------------

COLUMNS = (
    "candidate",
    "overall",
    "amounts",
    "units",
    "matches",
    "not-an-ingredient",
    "servings",
    "no recipe",
    "factors",
    "failures",
    "extra lines",
    "input tokens",
    "output tokens",
    "cost per recipe",
    "cost total",
    "seconds",
)


def _pct(cell: Sequence[int] | None) -> str:
    value = percent(cell)
    return "-" if value is None else f"{value:.0f}%"


def _money(value: Decimal | None) -> str:
    return "n/a" if value is None else f"${value:.4f}"


def render_report(results: Sequence[CandidateResult], data: Data, today: date | None = None) -> str:
    today = today or date.today()
    lines = [
        "# Model comparison",
        "",
        f"Date: {today.isoformat()}. {len(data.recipes)} recipes, {len(data.factors)} factor "
        "cases. Run by hand; scores are a guide, not the decision.",
        "",
        "| " + " | ".join(COLUMNS) + " |",
        "|" + "|".join(["---"] + ["---:"] * (len(COLUMNS) - 1)) + "|",
    ]
    for r in sorted(results, key=overall, reverse=True):
        checks = r.tally.checks
        per_recipe = None if r.cost is None or not r.recipes else r.cost / r.recipes
        row = [
            r.candidate,
            f"{overall(r):.0f}%",
            _pct(checks.get("amount")),
            _pct(checks.get("unit")),
            _pct(checks.get("match")),
            _pct(checks.get("not_an_ingredient")),
            _pct(checks.get("servings")),
            _pct(checks.get("no_recipe")),
            _pct([r.factors_right, r.factors_total]),
            str(len(r.failures)),
            str(r.tally.extra_lines),
            str(r.input_tokens),
            str(r.output_tokens),
            _money(per_recipe),
            _money(r.cost),
            f"{r.seconds:.1f}",
        ]
        lines.append("| " + " | ".join(row) + " |")
    for r in sorted(results, key=overall, reverse=True):
        if r.failures:
            lines += ["", f"## Failures: {r.candidate}", ""]
            lines += [f"- {case_id}: {message}" for case_id, message in r.failures]
    return "\n".join(lines) + "\n"
