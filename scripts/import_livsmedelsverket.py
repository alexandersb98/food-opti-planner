"""Build the Livsmedelsverket data file (run by hand, never by the app).

Downloads every food of Livsmedelsverket's food database with its nutrient
values and food group and writes them to
`server/data_sources/livsmedelsverket.json.gz`, the data file the app loads
(data source spec, "The data file and its import"). Standard library only; it
never touches a database and takes its unit spellings from `server/units.py`.

The API details used here (base URL, endpoints, field names, paging and
language parameters) come from documentation and web search, not from a live
capture, so every one of them can be overridden on the command line and the
readers accept a few spellings of each field. First run: see README,
"Refreshing the Livsmedelsverket data file".
"""

import argparse
import gzip
import http.client
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from collections import Counter
from collections.abc import Callable, Iterable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from pathlib import Path
from typing import Any, NamedTuple, Protocol

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.units import normalise  # noqa: E402

SOURCE = {
    "key": "livsmedelsverket",
    "name": "Livsmedelsverket",
    "licence": "CC BY 4.0",
    "attribution": (
        "Source: Livsmedelsverket, Livsmedelsdatabasen (open API, "
        "dataportal.livsmedelsverket.se), licence CC BY 4.0."
    ),
}
GROUP_TYPE_HINTS = ("livsmedelsgrupp", "food group", "matgrupp")

FOOD_LIST_KEYS = ("livsmedel", "items", "data", "results")
VALUE_LIST_KEYS = ("naringsvarden", "items", "data", "results")
CLASSIFICATION_LIST_KEYS = ("klassificeringar", "items", "data", "results")
TOTAL_KEYS = ("totalRecords", "total", "totalCount")

FOOD_KEY_FIELDS = ("nummer", "livsmedelsNummer", "livsmedelsnummer", "id")
FOOD_NAME_FIELDS = ("namn", "livsmedelsNamn")
CODE_FIELDS = ("euroFIRkod", "euroFIRKod", "euroFirKod", "kod")
NUTRIENT_NAME_FIELDS = ("namn", "benamning")
UNIT_FIELDS = ("enhet",)
VALUE_FIELDS = ("varde", "värde")
WEIGHT_FIELDS = ("viktGram",)
TYPE_FIELDS = ("typ", "klassificeringstyp", "typNamn", "klassificering", "kategori")
GROUP_NAME_FIELDS = ("namn", "benamning", "klassificeringNamn")

DEFAULT_OUT = ROOT / "server" / "data_sources" / "livsmedelsverket.json.gz"
DEFAULT_BASE_URL = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1"
DECIMALS = Decimal("0.000001")
EXAMPLES = 5


class ImportError_(Exception):
    """A problem with what the source returned (shape, size) or how."""


class Fetcher(Protocol):
    def get(self, path: str, params: Mapping[str, str | int]) -> Any: ...


class RawValue(NamedTuple):
    code: str
    name: str
    unit: str
    value: Any
    vikt_gram: Any


# ----------------------------------------------------------------- fetchers


def request_key(path: str, params: Mapping[str, str | int]) -> str:
    """`/livsmedel?limit=2&offset=0&sprak=1`: the query sorted by name."""
    query = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return f"{path}?{query}" if query else path


def _dump(value: Any) -> str:
    """JSON text in which a Decimal is written as the number it is."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        items = ",\n".join(f"{json.dumps(str(k), ensure_ascii=False)}: {_dump(v)}" for k, v in value.items())
        return "{\n" + items + "\n}" if items else "{}"
    if isinstance(value, list):
        return "[" + ", ".join(_dump(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


class ReplayFetcher:
    """Answers from a recorded `responses.json` (request key -> body)."""

    def __init__(self, responses: Mapping[str, Any] | Path | str):
        if isinstance(responses, (str, Path)):
            with open(responses, encoding="utf-8") as fh:
                responses = json.load(fh, parse_float=Decimal)
        self.responses = {k: v for k, v in responses.items() if not k.startswith("_")}

    def get(self, path: str, params: Mapping[str, str | int]) -> Any:
        key = request_key(path, params)
        try:
            return self.responses[key]
        except KeyError:
            raise ImportError_(f"no recorded response for {key}") from None


class HttpFetcher:
    """GET base_url + path with JSON back; retries 429, 5xx and network errors."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30,
        retries: int = 3,
        sleep: Callable[[float], Any] = time.sleep,
        user_agent: str = "food-opti-planner data import (manual run)",
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout, self.retries, self.sleep, self.user_agent = timeout, retries, sleep, user_agent

    def get(self, path: str, params: Mapping[str, str | int]) -> Any:
        url = f"{self.base_url}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(
            url, headers={"Accept": "application/json", "User-Agent": self.user_agent}
        )
        delay = 1
        for attempt in range(self.retries + 1):
            wait: float = delay
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    body = response.read()
                try:
                    return json.loads(body, parse_float=Decimal)
                except ValueError as error:
                    raise ImportError_(f"GET {url}: the answer is not JSON ({error})") from None
            except urllib.error.HTTPError as error:
                if error.code != 429 and error.code < 500:
                    raise ImportError_(f"GET {url}: HTTP {error.code}") from None
                problem = f"HTTP {error.code}"
                retry_after = (error.headers.get("Retry-After") or "").strip() if error.headers else ""
                if retry_after.isdigit() and int(retry_after) <= 30:
                    wait = int(retry_after)
            except (http.client.HTTPException, OSError) as error:
                # URLError, timeouts, connection and SSL errors, a truncated body (IncompleteRead)
                problem = f"{type(error).__name__}: {getattr(error, 'reason', error) or error}"
            if attempt == self.retries:
                raise ImportError_(f"GET {url}: {problem} after {attempt + 1} tries")
            self.sleep(wait)
            delay *= 2
        raise AssertionError("unreachable")  # pragma: no cover


class RecordingFetcher:
    """Wraps another fetcher and keeps what it saw, in the replay layout."""

    def __init__(self, inner: Fetcher):
        self.inner = inner
        self.responses: dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, path: str, params: Mapping[str, str | int]) -> Any:
        body = self.inner.get(path, params)
        with self._lock:
            self.responses[request_key(path, params)] = body
        return body

    def save(self, path: Path | str) -> None:
        with self._lock:
            ordered = {k: self.responses[k] for k in sorted(self.responses)}
        Path(path).write_text(_dump(ordered) + "\n", encoding="utf-8")


# ------------------------------------------------------------ tolerant readers


def _pick(entry: Mapping[str, Any], names: Iterable[str]) -> Any:
    """The first present field of `names`, matched case-insensitively."""
    lowered = {str(k).lower(): v for k, v in entry.items()}
    for name in names:
        if lowered.get(name.lower()) is not None:
            return lowered[name.lower()]
    return None


def _items(payload: Any, keys: Iterable[str], what: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        found = _pick({k: v for k, v in payload.items() if isinstance(v, list)}, keys)
        if found is not None:
            return found
        seen = ", ".join(sorted(map(str, payload))) or "(none)"
        raise ImportError_(f"{what}: no list under any of {', '.join(keys)}; keys seen: {seen}")
    raise ImportError_(f"{what}: expected a list or an object, got {type(payload).__name__}")


def _text(value: Any) -> str:
    return "" if value is None or isinstance(value, (dict, list)) else str(value).strip()


def read_foods(payload: Any) -> list[tuple[str, str]]:
    foods = []
    for entry in _items(payload, FOOD_LIST_KEYS, "food list"):
        if not isinstance(entry, dict):
            continue
        key, name = _text(_pick(entry, FOOD_KEY_FIELDS)), _text(_pick(entry, FOOD_NAME_FIELDS))
        if key and name:
            foods.append((key, name))
    return foods


def page_total(payload: Any) -> int | None:
    if not isinstance(payload, dict):
        return None
    meta = _pick(payload, ("_meta",))
    for source in (meta if isinstance(meta, dict) else {}, payload):
        raw = _pick(source, TOTAL_KEYS)
        if isinstance(raw, bool) or raw is None:
            continue
        try:
            return int(Decimal(str(raw)))
        except (InvalidOperation, ValueError):
            continue
    return None


def read_values(payload: Any) -> list[RawValue]:
    values = []
    for entry in _items(payload, VALUE_LIST_KEYS, "nutrient values"):
        if not isinstance(entry, dict):
            continue
        code = _text(_pick(entry, CODE_FIELDS))
        name = _text(_pick(entry, NUTRIENT_NAME_FIELDS))
        if not code and not name:
            continue
        values.append(RawValue(code, name, _text(_pick(entry, UNIT_FIELDS)),
                               _pick(entry, VALUE_FIELDS), _pick(entry, WEIGHT_FIELDS)))
    return values


def read_classifications(payload: Any) -> list[dict]:
    return [e for e in _items(payload, CLASSIFICATION_LIST_KEYS, "classifications") if isinstance(e, dict)]


def _type_of(entry: Mapping[str, Any]) -> str:
    return _text(_pick(entry, TYPE_FIELDS))


def extract_groups(classifications: Any, group_types: Iterable[str] = ()) -> list[str]:
    """The food's group names. Flat: the first matching classification's name.

    Kept alone so a tree of groups can be handled later by changing only this."""
    if not isinstance(classifications, list):
        return []
    hints = (*GROUP_TYPE_HINTS, *(t.lower() for t in group_types if t))
    for entry in classifications:
        if not isinstance(entry, dict):
            continue
        type_text = _type_of(entry).lower()
        if not type_text or not any(hint in type_text for hint in hints):
            continue
        name = _text(_pick(entry, GROUP_NAME_FIELDS))
        if name:
            return [name]
    return []


# -------------------------------------------------------------------- values


def _to_decimal(raw: Any) -> Decimal | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        if isinstance(raw, Decimal):
            number = raw
        elif isinstance(raw, int):
            number = Decimal(raw)
        elif isinstance(raw, float):
            number = Decimal(repr(raw))
        elif isinstance(raw, str):
            cleaned = "".join(raw.split()).replace(",", ".")
            if not cleaned:
                return None
            number = Decimal(cleaned)
        else:
            return None
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def decimal_string(raw: Any, vikt_gram: Any = None) -> str | None:
    """The value per 100 g as a plain decimal string, or None to leave it out."""
    number = _to_decimal(raw)
    if number is None:
        return None
    with localcontext() as ctx:
        ctx.prec = 60
        if vikt_gram is not None:
            weight = _to_decimal(vikt_gram)
            if weight is None or weight == 0:
                return None
            if weight != 100:
                number = number * 100 / weight
        try:
            number = number.quantize(DECIMALS, rounding=ROUND_HALF_UP)
        except InvalidOperation:  # far too large to be a nutrient value
            return None
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


# ------------------------------------------------------------------- build


@dataclass
class Report:
    foods: int = 0
    columns: int = 0
    foods_without_group: int = 0
    skipped_missing: int = 0
    skipped_non_numeric: int = 0
    skipped_examples: list[str] = field(default_factory=list)
    classification_types: dict[str, int] = field(default_factory=dict)
    units: dict[str, str] = field(default_factory=dict)  # as read -> as written

    def lines(self) -> list[str]:
        types = ", ".join(f"{t} ({n})" for t, n in sorted(self.classification_types.items())) or "none"
        units = ", ".join(f"{read or '(none)'} -> {written or '(none)'}" for read, written in sorted(self.units.items()))
        out = [
            f"foods: {self.foods}, columns: {self.columns}, foods without a group: {self.foods_without_group}",
            f"classification types seen: {types}",
            f"units read -> written: {units or 'none'}",
            f"values left out: {self.skipped_missing} missing, {self.skipped_non_numeric} not a number",
        ]
        out += [f"  e.g. {example}" for example in self.skipped_examples]
        return out


def fetch_food_list(
    fetcher: Fetcher, *, language: int | str, page_size: int, limit_foods: int | None = None
) -> list[tuple[str, str]]:
    """Every (key, name), paging until an empty page, a page with nothing new,
    or the reported total. A short page is not the end (the server may cap)."""
    foods: dict[str, str] = {}
    offset = 0
    while True:
        payload = fetcher.get("/livsmedel", {"limit": page_size, "offset": offset, "sprak": language})
        page = read_foods(payload)
        new = [(k, n) for k, n in page if k not in foods]
        for key, name in new:
            foods.setdefault(key, name)
        if not page or not new:
            break
        offset += len(page)
        if limit_foods is not None and len(foods) >= limit_foods:
            break
        total = page_total(payload)
        if total is not None and offset >= total:
            break
    result = list(foods.items())
    return result[:limit_foods] if limit_foods is not None else result


def _food_sort_key(key: str) -> tuple[int, int, str]:
    return (0, int(key), "") if key.isascii() and key.isdigit() else (1, 0, key)


def build_data_file(
    fetcher: Fetcher,
    *,
    version: str,
    language: int | str = 1,
    page_size: int = 100,
    workers: int = 4,
    group_types: Iterable[str] = (),
    limit_foods: int | None = None,
    min_foods: int = 1000,
    allow_no_groups: bool = False,
    log: Callable[[str], Any] = print,
) -> tuple[dict, Report]:
    group_types = tuple(group_types)
    listed = sorted(fetch_food_list(fetcher, language=language, page_size=page_size,
                                    limit_foods=limit_foods), key=lambda f: _food_sort_key(f[0]))
    log(f"{len(listed)} foods listed")
    if len(listed) < min_foods:
        raise ImportError_(
            f"only {len(listed)} foods found, fewer than the {min_foods} required "
            "(--min-foods); nothing written"
        )

    def fetch_one(food: tuple[str, str]) -> tuple[list[RawValue], list[dict]]:
        key = food[0]
        values = read_values(fetcher.get(f"/livsmedel/{urllib.parse.quote(key, safe='')}/naringsvarden", {"sprak": language}))
        classes = read_classifications(fetcher.get(f"/livsmedel/{urllib.parse.quote(key, safe='')}/klassificeringar", {"sprak": language}))
        return values, classes

    if workers > 1:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            fetched = list(pool.map(fetch_one, listed))
    else:
        fetched = [fetch_one(food) for food in listed]
    log(f"values and classifications fetched for {len(fetched)} foods")

    report = Report(foods=len(listed))
    types: Counter[str] = Counter()
    unit_map: dict[str, str] = {}

    # Pass 1: the numbers, and which (nutrient, unit) pairs exist.
    parsed: list[dict[tuple[str, str], str]] = []
    names: dict[tuple[str, str], str] = {}
    for (food_key, _), (raw_values, _classes) in zip(listed, fetched):
        row: dict[tuple[str, str], str] = {}
        for raw in raw_values:
            base = raw.code or raw.name
            written = normalise(raw.unit) if raw.unit else ""
            unit_map[raw.unit] = written
            text = decimal_string(raw.value, raw.vikt_gram)
            if text is None:
                if raw.value is None or (isinstance(raw.value, str) and not raw.value.strip()):
                    report.skipped_missing += 1
                else:
                    report.skipped_non_numeric += 1
                    if len(report.skipped_examples) < EXAMPLES:
                        report.skipped_examples.append(f"food {food_key}, {base}: {raw.value!r}")
                continue
            ident = (base, written)
            names.setdefault(ident, raw.name or base)
            row.setdefault(ident, text)
        parsed.append(row)
    if not names:
        raise ImportError_("no nutrient values found in the download; nothing written")

    # Column keys: the source's code (or name); `<key>:<unit>` where one key has several units.
    units_per_base: dict[str, set[str]] = {}
    for base, unit in names:
        units_per_base.setdefault(base, set()).add(unit)
    keys = {
        (base, unit): f"{base}:{unit or 'none'}" if len(units_per_base[base]) > 1 else base
        for base, unit in names
    }
    name_count = Counter(names.values())
    display = {}
    for (base, unit), name in names.items():
        if len(units_per_base[base]) > 1 and name_count[name] > 1 and f"({unit})" not in name:
            name = f"{name} ({unit or 'none'})"
        display[(base, unit)] = name
    columns = sorted(
        ({"key": keys[i], "name": display[i], "unit": i[1]} for i in names), key=lambda c: c["key"]
    )
    report.columns = len(columns)

    # Pass 2: foods, groups.
    foods_out = []
    for (food_key, food_name), row, (_values, classes) in zip(listed, parsed, fetched):
        types.update(_type_of(c) or "(no type)" for c in classes)
        groups = extract_groups(classes, group_types)
        if not groups:
            report.foods_without_group += 1
        foods_out.append({
            "key": food_key,
            "name": food_name,
            "groups": groups,
            "values": {keys[i]: row[i] for i in sorted(row, key=lambda i: keys[i])},
        })
    report.classification_types = dict(types)
    report.units = unit_map
    if foods_out and report.foods_without_group == len(foods_out) and not allow_no_groups:
        seen = ", ".join(f"{t} ({n})" for t, n in sorted(types.items())) or "none"
        raise ImportError_(
            f"no food got a food group; classification types seen: {seen}. Pass --group-type "
            "<type> to choose the one that holds the groups, or --allow-no-groups; nothing written"
        )

    data = {
        "key": SOURCE["key"],
        "name": SOURCE["name"],
        "version": version,
        "licence": SOURCE["licence"],
        "attribution": SOURCE["attribution"],
        "columns": columns,
        "foods": foods_out,
    }
    for line in report.lines():
        log(line)
    return data, report


def write_data_file(path: Path, data: dict) -> None:
    """Deterministic gzip JSON (no timestamp, no file name), via a temp file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as zipped:
                zipped.write(payload)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


# ------------------------------------------------------------ command line

HELP_EPILOG = (
    "First run: --limit-foods 5 --out /tmp/lv-trial.json.gz --min-foods 0 "
    "--record /tmp/lv-trial.json, then check the summary (README, "
    "'Refreshing the Livsmedelsverket data file')."
)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download Livsmedelsverket's food database and write the app's data file.",
        epilog=HELP_EPILOG,
    )
    parser.add_argument("--out", type=Path, help="output file (default: server/data_sources/livsmedelsverket.json.gz)")
    parser.add_argument("--base-url", help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--language", default="1", help="value of the sprak parameter (default 1)")
    parser.add_argument("--page-size", type=int, default=100, help="foods per list request (default 100)")
    parser.add_argument("--workers", type=int, default=4, help="parallel per-food requests (default 4)")
    parser.add_argument("--version", help="data version (default: today's date, UTC)")
    parser.add_argument("--group-type", action="append", default=[], metavar="TYPE",
                        help="classification type that holds the food groups (repeatable)")
    parser.add_argument("--allow-no-groups", action="store_true", help="do not fail when no food has a group")
    parser.add_argument("--min-foods", type=int, default=1000,
                        help="refuse to write fewer foods than this (default 1000)")
    parser.add_argument("--limit-foods", type=int, metavar="N", help="only the first N foods (trial run; needs --out)")
    parser.add_argument("--record", type=Path, metavar="FILE", help="also save every response to FILE")
    parser.add_argument("--replay", type=Path, metavar="FILE",
                        help="answer from a recorded file instead of HTTP (not with --base-url)")
    return parser


def _progress(message: str) -> None:
    print(message, file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    try:
        args = parser.parse_args(argv)
        if args.limit_foods is not None and args.out is None:
            parser.error("--limit-foods needs an explicit --out, so a trial run cannot overwrite the real data file")
        if args.replay is not None and args.out is None:
            parser.error("--replay needs an explicit --out, so recorded data cannot land in the real data file")
        if args.replay is not None and args.base_url is not None:
            parser.error("--replay and --base-url cannot be used together")
        if args.limit_foods is not None and args.limit_foods < 1:
            parser.error("--limit-foods must be at least 1")
        if args.page_size < 1 or args.workers < 1:
            parser.error("--page-size and --workers must be at least 1")
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2

    out = args.out or DEFAULT_OUT
    version = args.version or datetime.now(timezone.utc).date().isoformat()
    fetcher: Fetcher = (
        ReplayFetcher(args.replay) if args.replay else HttpFetcher(args.base_url or DEFAULT_BASE_URL)
    )
    recorder = RecordingFetcher(fetcher) if args.record else None
    try:
        try:
            data, _report = build_data_file(
                recorder or fetcher,
                version=version,
                language=args.language,
                page_size=args.page_size,
                workers=args.workers,
                group_types=args.group_type,
                limit_foods=args.limit_foods,
                min_foods=args.min_foods,
                allow_no_groups=args.allow_no_groups,
                log=_progress,
            )
        finally:
            if recorder is not None and recorder.responses:
                recorder.save(args.record)
                _progress(f"responses recorded in {args.record}")
        if out.resolve() == DEFAULT_OUT.resolve() and any(f["name"].startswith("TEST ") for f in data["foods"]):
            raise ImportError_(f"refusing to write test data (foods named 'TEST ...') to {out}")
        write_data_file(out, data)
    except (ImportError_, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    _progress(f"wrote {out} ({out.stat().st_size} bytes, version {version})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
