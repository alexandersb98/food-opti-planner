"""Compare AI models on the recipe-import test data (run by hand).

Scores each candidate `provider:model` on amounts, units, matches, servings,
not-an-ingredient flags, "no recipe" and unit factors, and prints a Markdown
report with token counts and cost.

Needs: `pip install -e ".[server]"` and, per provider tried, an API key in the
environment (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, MISTRAL_API_KEY).
It makes real calls that cost real money: it prints how many it will make
(about 10 conversions and 12 factor suggestions per candidate) and then just
runs, since you start it on purpose. It is never run by the tests.

Example:
  python3 scripts/compare_models.py --models anthropic:<model-id> gemini:<model-id> \\
      --prices prices.json --report /tmp/report.md --record /tmp/recorded

Model ids are the providers' exact ids. Prices, in USD per million tokens, are
copied by you from the providers' pages on the day into a JSON file:
  {"anthropic:<model-id>": {"input_per_mtok": 1.0, "output_per_mtok": 5.0}}
A candidate without a price shows n/a for cost.
--record DIR keeps every request and reply (never the key) so a run can be
repeated without keys by --replay DIR.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, TextIO

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import units  # noqa: E402
from server.ai.chat import ChatProvider, HttpxTransport, MeteredChat, Transport  # noqa: E402
from server.ai.converter import ProviderFactorSuggester, ProviderRecipeConverter  # noqa: E402
from server.ai.draft import CatalogEntry, Draft, LineDraft  # noqa: E402
from server.ai.errors import AIError, AIServiceError, NoRecipeFound  # noqa: E402
from server.ai.providers import ADAPTERS, KEY_ENV, build_chat  # noqa: E402
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


# --- record and replay -------------------------------------------------------------


def request_key(url: str, body: Mapping[str, Any]) -> str:
    """First 16 hex digits of the SHA-256 of the canonical JSON of url and body.
    Headers (so API keys) are not part of it."""
    canonical = json.dumps({"url": url, "body": body}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


class RecordingTransport:
    def __init__(self, inner: Transport, directory: Path):
        self.inner = inner
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def post_json(
        self, url: str, headers: Mapping[str, str], body: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        reply = self.inner.post_json(url, headers, body)
        record = {"url": url, "body": body, "response": reply}
        path = self.directory / f"{request_key(url, body)}.json"
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return reply


class ReplayTransport:
    def __init__(self, directory: Path):
        self.directory = Path(directory)

    def post_json(
        self, url: str, headers: Mapping[str, str], body: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        key = request_key(url, body)
        path = self.directory / f"{key}.json"
        if not path.exists():
            raise AIServiceError(None, f"no recorded reply for {key}")
        return json.loads(path.read_text(encoding="utf-8"))["response"]


# --- command line --------------------------------------------------------------------


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="compare_models.py",
        description="Score AI models on the recipe-import test data.",
        epilog="Needs:" + __doc__.split("Needs:", 1)[1],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--models", nargs="+", required=True, metavar="PROVIDER:MODEL")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="test data directory")
    parser.add_argument("--prices", type=Path, help="JSON file of prices per million tokens")
    parser.add_argument("--skip-factors", action="store_true", help="only convert recipes")
    parser.add_argument("--only", action="append", default=[], metavar="RECIPE_ID")
    parser.add_argument("--report", type=Path, help="also write the Markdown report here")
    parser.add_argument("--record", type=Path, metavar="DIR", help="record requests and replies")
    parser.add_argument("--replay", type=Path, metavar="DIR", help="answer from a recording")
    parser.add_argument("--timeout", type=float, default=60.0, help="seconds per request")
    return parser


def main(
    argv: Sequence[str],
    *,
    transport_factory: Callable[[], Transport] | None = None,
    env: Mapping[str, str] = os.environ,
    out: TextIO | None = None,
    err: TextIO | None = None,
) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    args = _parser().parse_args(list(argv))

    def fail(code: int, message: str) -> int:
        print(f"compare_models: {message}", file=err)
        return code

    if args.record and args.replay:
        return fail(2, "--record and --replay cannot be used together")
    candidates: list[tuple[str, str, str]] = []  # id, provider, model
    for spec in args.models:
        provider, sep, model = spec.partition(":")
        if not sep or not provider or not model:
            return fail(2, f"--models entries look like provider:model, got {spec!r}")
        if provider not in ADAPTERS:
            return fail(2, f"unknown provider {provider!r}; known: {', '.join(sorted(ADAPTERS))}")
        if not args.replay and not env.get(KEY_ENV[provider]):
            return fail(2, f"no key for {provider}: set {KEY_ENV[provider]}")
        candidates.append((spec, provider, model))
    prices: dict[str, Price] = {}
    if args.prices:
        try:
            prices = load_prices(args.prices)
        except (OSError, ValueError) as exc:
            return fail(2, f"prices file: {exc}")
    data = load_data(args.data)
    if args.only:
        known = {r.id for r in data.recipes}
        unknown = [rid for rid in args.only if rid not in known]
        if unknown:
            return fail(1, f"no recipe named {', '.join(unknown)}; known: {', '.join(sorted(known))}")
        data = Data(data.catalog, [r for r in data.recipes if r.id in args.only], data.factors)

    transport: Transport
    if args.replay:
        transport = ReplayTransport(args.replay)
    elif transport_factory is not None:
        transport = transport_factory()
    else:
        transport = HttpxTransport(timeout=args.timeout)
    if args.record:
        transport = RecordingTransport(transport, args.record)

    per_candidate = len(data.recipes) + (0 if args.skip_factors else len(data.factors))
    print(
        f"{per_candidate * len(candidates)} calls to make "
        f"({len(candidates)} candidates x {per_candidate})",
        file=err,
    )

    def progress(candidate: str, case_id: str, status: str, seconds: float) -> None:
        print(f"{candidate} {case_id} {status} {seconds:.1f}s", file=err)

    results = []
    for spec, provider, model in candidates:
        key = "replay" if args.replay else env[KEY_ENV[provider]]
        chat = build_chat(provider, model, key, transport)
        results.append(
            run_candidate(
                spec,
                chat,
                data,
                factors=not args.skip_factors,
                price=prices.get(spec),
                progress=progress,
            )
        )
    report = render_report(results, data)
    out.write(report)
    if args.report:
        args.report.write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
