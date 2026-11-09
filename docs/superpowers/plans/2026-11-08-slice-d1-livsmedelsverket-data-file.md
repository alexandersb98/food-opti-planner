# Slice D1 — Livsmedelsverket Data File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** A script, `scripts/import_livsmedelsverket.py`, that the owner runs
by hand to download every food of Livsmedelsverket's food database with its
nutrient values and food group, and writes them to the data file
`server/data_sources/livsmedelsverket.json.gz` in the format of the data
source spec. The script is built and tested here against a recorded-response
fixture; the real file is **not** generated in this session (the API host is
unreachable from the sandbox). Nothing in the app changes in this slice.

**Architecture:** One stand-alone script, standard library only, that never
touches a database and imports only `server/units.py` (U1) for unit spelling.
It is split so that the unreliable parts are small and replaceable:

- a **fetch layer** (`Fetcher`: `get(path, params) -> parsed JSON`) with three
  implementations: `HttpFetcher` (urllib, retries), `ReplayFetcher` (reads a
  recorded `responses.json`) and `RecordingFetcher` (wraps another fetcher and
  writes what it saw in the same `responses.json` format). The tests use the
  replay fetcher on the committed fixture; the owner can use `--record` on the
  first real run and send the file back to replace the fixture with a real
  capture;
- **tolerant readers** for each response (`read_foods`, `read_values`,
  `read_classifications`) that accept the documented field names in a few
  spellings and fail with a message naming what they found when the shape is
  not recognised;
- **`extract_groups`**, the one function that turns a food's classifications
  into its food group names (ruling (a): flat, one group name per food), kept
  alone so a tree can be handled later by changing only it;
- **`build_data_file`**, which pages through the list, fetches values and
  classifications per food, normalises units through `units.normalise`, makes
  column keys, converts values to decimal strings and returns the file's
  dict; **`write_data_file`**, which writes it as deterministic gzip JSON.

**Tech Stack:** Python 3.11+ standard library (`urllib`, `gzip`, `json`,
`decimal`, `argparse`, `concurrent.futures`); pytest.

**Specs:** the data source spec
([`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md),
"The data file and its import", its "First task of the plan", "Testing →
Import script"); slice D1 of the master plan
([`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md));
the units spec for the catalogue spellings; the API research of this slice
(`.superpowers/sdd/2026-11-08-units-sources-import-slices/d1-api-research.md`,
facts from web search only, **not verified against the live API**).

**Status:** Built, and reviewed task by task, on branch
`claude/implement-remaining-slices-qwrp83`. The real data file is not
generated (the API is unreachable from the session); the owner runs the
script (README).

## Global Constraints

- `meal_planner/` is not changed. No migration, no change to `server/` except
  the alias edit in Task 1. No web change except the regenerated
  `web/src/test-units.json` in Task 1.
- No test calls the internet. The script's HTTP code is tested only against a
  local stub (`http.server` on `127.0.0.1`, port 0) or not at all; never
  against `dataportal.livsmedelsverket.se`.
- **Nothing in the repository presents invented numbers as Livsmedelsverket's
  data.** The fixture's foods are named `TEST ...`, carry round made-up
  numbers, and the fixture README says so. The real data file is not created
  or faked in this session (ruling (c)).
- Later slices (D2 onwards) must work when
  `server/data_sources/livsmedelsverket.json.gz` is absent. Nothing in D1
  creates the directory `server/data_sources/` except the script itself when
  the owner runs it (`mkdir(parents=True)`).
- The script has no third-party dependency (the `dev` and `server` extras in
  `pyproject.toml` are unchanged).
- Checks before each commit: `python3 -m pytest -q` at the root. (`npm run
  lint/typecheck/test` only if Task 1 changed `web/src/test-units.json`, and
  then only to confirm they still pass.)
- Another agent works in the same checkout (slice U3, which also edits
  `server/units.py` and `tests/server/test_units.py`). Edit those two files
  with narrow `Edit` calls after re-reading them, stage only your own files by
  path (`git commit <paths>`), and retry on `index.lock`.

## Interpretations made in this plan

1. **The API facts are unverified.** The base URL
   `https://dataportal.livsmedelsverket.se/livsmedel/api/v1`, the endpoints
   `GET /livsmedel`, `GET /livsmedel/{nummer}/naringsvarden`,
   `GET /livsmedel/{nummer}/klassificeringar`, the field names (`nummer`,
   `namn`, `euroFIRkod`, `varde`, `enhet`, `viktGram`) and CC BY 4.0 come from
   web-search summaries. The master plan's "first task" is therefore done as
   far as it can be: its findings go into the data source spec marked
   **unverified** (Task 5), together with what the owner must check on the
   first real run. The "stop and ask if the groups are a tree" rule is
   replaced by controller ruling (a): flat per-food group list, with the
   extraction isolated; recorded as an open point in the spec.
2. **Everything unverified is a default the command line can override, and
   the readers are tolerant.** `--base-url`, `--language` (sent as `sprak`,
   default `1`; sent but tolerated if ignored), `--page-size` (sent as
   `limit`, default 100, with `offset`), `--group-type` (repeatable).
   Readers accept a bare list or an object holding the list under one of the
   usual keys (`livsmedel`, `naringsvarden`, `klassificeringar`, `items`,
   `data`, `results`), and field names case-insensitively in the spellings
   listed in Task 3. An unrecognised shape stops the run with the keys it saw,
   never writes a partial file.
3. **Paging.** Request `offset=0, limit=N`; carry on with `offset += len(page)`
   until: the page is empty, or the page holds no food not already seen
   (a server that ignores `offset` would otherwise loop for ever), or a total
   reported in the response (`_meta.totalRecords`, `totalRecords`, `total`,
   `totalCount`, whichever is present) has been reached. A short page is **not**
   taken as the end (the server may cap `limit` below what was asked). The
   same food seen twice is kept once (first wins).
4. **Food groups: flat, one name per food.** `extract_groups(payload,
   group_types)` picks from the food's classification entries those whose
   type text (field `typ`, `klassificeringstyp`, `typNamn`, `klassificering`
   or `kategori`, case-insensitive) contains one of `GROUP_TYPE_HINTS`
   (`livsmedelsgrupp`, `food group`, `matgrupp`) or one of the `--group-type`
   values, and returns the **first** one's name (field `namn`, `benamning`,
   `klassificeringNamn`) as a one-item list; `[]` when nothing matches. The
   file keeps the spec's `"groups": [...]` list so a later change to several
   groups or a tree needs no format change for single names. The code stays
   in the file's group name only (no hierarchy, no code), as D2 makes one tag
   per distinct name. Safeguards: the summary lists every classification type
   it saw with counts, so the owner can pass `--group-type` if the guess is
   wrong, and the run **fails** (exit 1, no file) when foods exist but none got
   a group, unless `--allow-no-groups`.
5. **Column keys and names.** A column is a nutrient as the source defines it.
   Key = `euroFIRkod`; if that is absent, the nutrient's `namn`. If one key
   appears with more than one normalised unit in the download (energy is
   expected twice, kJ and kcal), every column of that key gets the key
   `"<key>:<unit>"` (`ENERC:kJ`, `ENERC:kcal`) and, where its name is the
   same as another's, the name gets ` (<unit>)` appended unless it already
   contains `(<unit>)`. Spelling variants of one unit (`µg`, `μg`, `ug`) do
   not count as different, as they normalise to one. A key that was unique
   and later gets a second unit would be renamed by the rule; that is
   acceptable (D2 matches by key, the old column is withdrawn, and the
   mapping of D3 would need redoing, which is right as the unit differs).
   Columns are written sorted by key.
6. **Values.** The JSON is parsed with `parse_float=Decimal`, so numbers never
   pass through a float. `varde` may be a number or a string; a string has its
   comma changed to a point and its spaces removed. Written as `format(d,
   "f")` with trailing zeros after the point removed (`"13.50"` → `"13.5"`,
   `"0.0"` → `"0"`), never exponent notation. **A missing, null, empty or
   non-numeric value is left out of the food's `values`, never written as 0**
   (the 2025 vitamin D note). Non-numeric ones are counted and a few examples
   shown in the summary. If an entry has `viktGram` other than 100 (the docs
   say always 100) the value is scaled to per 100 g (`value * 100 /
   viktGram`, rounded to 6 decimals like every stored number); a `viktGram`
   that is zero or non-numeric skips the entry.
7. **Units.** Each nutrient's `enhet` goes through `units.normalise`; a unit
   the catalogue does not know stays as written, trimmed (spec). The micro
   spellings µ U+00B5, μ U+03BC and `ug` and `mcg` are already catalogue
   aliases; `mikrog` and `mikrogram` are **added to the catalogue** in Task 1
   (the catalogue is the only place unit rules live), not handled in the
   script. Values are not converted, only the unit's spelling is. The summary
   lists every distinct unit as read and as written, so unknown ones are seen.
8. **Version, licence, attribution.** `version` is the download date in UTC
   (`YYYY-MM-DD`), as no source version endpoint is confirmed (the spec allows
   this); `--version` overrides it. `licence` is `"CC BY 4.0"`. The file gets
   one more key than the spec's example, `attribution`: `"Source:
   Livsmedelsverket, Livsmedelsdatabasen (open API,
   dataportal.livsmedelsverket.se), licence CC BY 4.0."`, which S2 shows as
   "the source's attribution text" (spec, S2). The exact wording Livsmedelsverket
   requires was not retrieved; the owner checks it (Task 5). D2's loader treats
   `attribution` as optional text.
9. **Deterministic output.** Foods sorted by key (numeric keys numerically,
   others after, alphabetically); each food's `values` sorted by column key;
   JSON written with `ensure_ascii=False`, compact separators, UTF-8; gzip
   with `mtime=0` and a fixed (empty) file name, so the same input gives the
   same bytes and an update PR shows only real changes. Written to a temporary
   file next to the target and renamed over it, so a failed run never leaves a
   half file.
10. **Safety rails.** The default output is the committed path. The run
    refuses to write fewer than `--min-foods` foods (default 1000; the source
    has about 2 500) and `--limit-foods N` (for a trial run) requires an
    explicit `--out`, so a trial can't overwrite the real file by accident.
    Any HTTP failure after three retries (429, 5xx, timeouts, 1 s then 2 s
    then 4 s) stops the run; nothing is written.
11. **Concurrency.** Per-food requests run on a small thread pool
    (`--workers`, default 4, polite to a public API); results are collected
    and sorted afterwards, so the order of completion changes nothing.
12. **Tests live in `tests/scripts/`** (new directory, no `__init__.py`, like
    the others) and load the script with `importlib.util.spec_from_file_location`,
    since `scripts/` is not a package. The script puts the repository root on
    `sys.path` itself so `python3 scripts/import_livsmedelsverket.py` finds
    `server.units`.
13. **The fixture is documentation-shaped, not a live capture.** Its layout
    is one file, `responses.json`, a JSON object from request key to response
    body, where the request key is `"<path>?<query sorted by name>"` (for
    example `/livsmedel?limit=2&offset=0&sprak=1`). `RecordingFetcher` writes
    the same layout, so a real capture can replace the fixture without
    changing the tests' mechanics (the assertions that depend on the made-up
    foods would then be updated by whoever replaces it).

14. **Where the plan and the code differed** (recorded under each task):
    the spec's "kg CO2e" → "kg" example is dropped in favour of "unknown units
    stay as written" (the plan's rule); the e2e and full checks were run once
    before the first commit and were green after U3's last fix.

## Tasks

### Task 1: Swedish micro spellings in the unit catalogue

**Files:** modify `server/units.py`, `tests/server/test_units.py`, regenerate
`web/src/test-units.json`.

**Build:** in `EXTRA_ALIASES`, change the `"µg"` entry to
`("ug", "mcg", "mikrog", "mikrogram")`. Nothing else in `units.py`.
The catalogue's build already raises on a spelling claimed twice.

**Tests (first):** add `("mikrog", "µg")`, `("Mikrogram", "µg")` to the
alias list in `test_units.py` (the parametrised table that holds `("ug",
"µg")`) and a line in the mu test that U+03BC `μg`, U+00B5 `µg`, `ug`,
`mcg`, `mikrog` all parse to the same `Unit` object. Run: they fail before the
alias is added.

**Checked:** `tests/server/test_units.py` (the new rows failed before the alias
was added), `tests/server/test_units_api.py`, `npm test` (447 passed) after
regenerating `web/src/test-units.json`. Differences: none.

**Verify:** `python3 -m pytest tests/server/test_units.py tests/server/test_units_api.py -q`;
regenerate the fixture with `python3 -m server.export_units
web/src/test-units.json` (the server test that compares the file to the
endpoint is `tests/server/test_units_api.py`; it must pass), then `cd web &&
npm test` to confirm the app tests still pass. Commit the four files.

### Task 2: The recorded-response fixture

**Files:** create `tests/scripts/fixtures/livsmedelsverket/responses.json`,
`tests/scripts/fixtures/livsmedelsverket/README.md`.

**Build:** `responses.json` is the layout of interpretation 13, shaped like
the documented API (field names from the research file), for three made-up
foods and page size 2. All names start with `TEST`; all numbers are round
and made up. Requests (all with `sprak=1`):

| Request key | Body |
|---|---|
| `/livsmedel?limit=2&offset=0&sprak=1` | `{"_meta": {"totalRecords": 3, "offset": 0, "limit": 2, "count": 2}, "livsmedel": [{"nummer": 1, "namn": "TEST Oat flakes"}, {"nummer": 2, "namn": "TEST Salmon"}]}` |
| `/livsmedel?limit=2&offset=2&sprak=1` | the same wrapper with `offset` 2, `count` 1 and `[{"nummer": 10, "namn": "TEST Plant drink"}]` |
| `/livsmedel/1/naringsvarden?sprak=1` | a bare JSON list of nutrient entries: ENERC kJ 1500 (number), ENERC kcal 360, PROT 13.5 `g`, VITD `"1,5"` (string with a comma) in `µg` U+00B5, FE 4.2 `mg`; each with `viktGram` 100, `namn` `"Energi"` for both energy rows |
| `/livsmedel/2/naringsvarden?sprak=1` | ENERC kJ 900, ENERC kcal 215, PROT 20 `g`, VITD 12 in `μg` U+03BC, FE `null`, CO2E 1.2 with unit `kg CO2e` (an unknown unit) |
| `/livsmedel/10/naringsvarden?sprak=1` | the wrapper form `{"naringsvarden": [...]}`: ENERC kJ 100, ENERC kcal 24, PROT 3.3 `g`, VITD 0.1 in `ug`, VITB12 0.4 in `mikrog` |
| `/livsmedel/1/klassificeringar?sprak=1` | list: `{"typ": "Livsmedelsgrupp", "namn": "TEST Grains", "kod": "G1"}`, `{"typ": "LanguaL", "namn": "TEST CEREAL GRAIN", "kod": "A0148"}` |
| `/livsmedel/2/klassificeringar?sprak=1` | a Livsmedelsgrupp `TEST Fish and shellfish` and a `FoodEx2` entry |
| `/livsmedel/10/klassificeringar?sprak=1` | only a `LanguaL` entry (so this food gets no group) |

The three foods exercise: both list wrappers (object with `livsmedel` here, the
bare list in unit tests), two pages with the total reached after the second
(no third request exists in the file, so asking for one makes the replay
fetcher raise), the energy duplicate, three micro spellings in one column,
a comma string, a null, an unknown unit, a food without a group. Include a
top-level `"_note"` key in the JSON saying the file is hand-made from the
API documentation; the replay fetcher ignores keys starting with `_`.

`README.md` (short): what the file is; **the shape is from documentation and
a web search, not from a live capture; the foods and numbers are made up and
must never be copied into the real data file or presented as Livsmedelsverket's**;
the request-key layout; how to replace it with a real capture
(`python3 scripts/import_livsmedelsverket.py --limit-foods 3 --out /tmp/x.json.gz
--min-foods 0 --record tests/scripts/fixtures/livsmedelsverket/responses.json`
and then update the assertions that name the made-up foods).

**Checked:** valid JSON; used by every test of Tasks 3 and 4. Differences:
committed together with Task 3; the `_note` key and the made-up names are as
planned; food 10 has VITB12 in `mikrog` as listed.

**Tests:** none of its own (Task 3's tests use it). Check it is valid JSON
(`python3 -c "import json; json.load(open(...))"`).

**Verify/commit:** commit the two files with the Task 3 test file when that
is written, or alone with message "tests: recorded-response fixture for the
Livsmedelsverket import".

### Task 3: The script's core: readers, units, columns, values, groups, build

**Files:** create `scripts/import_livsmedelsverket.py` (core only; the CLI and
HTTP are Task 4), `tests/scripts/test_import_livsmedelsverket.py`.

**Build (public names the tests rely on):**

```python
SOURCE = {"key": "livsmedelsverket", "name": "Livsmedelsverket",
          "licence": "CC BY 4.0", "attribution": "Source: Livsmedelsverket, ..."}
GROUP_TYPE_HINTS = ("livsmedelsgrupp", "food group", "matgrupp")

class ImportError_(Exception): ...        # shape/size problems; message names what was seen

class Fetcher(Protocol):
    def get(self, path: str, params: dict[str, str | int]) -> Any: ...

def request_key(path, params) -> str      # "/livsmedel?limit=2&offset=0&sprak=1"
class ReplayFetcher:  def __init__(self, responses: dict | Path); get(...)   # KeyError -> ImportError_("no recorded response for <key>")
class RecordingFetcher: def __init__(self, inner: Fetcher); get(...); save(path)  # thread-safe

def read_foods(payload) -> list[tuple[str, str]]      # (key as str, name); skips entries without both
def page_total(payload) -> int | None
def read_values(payload) -> list[RawValue]            # code, name, unit, value(raw), viktGram
def read_classifications(payload) -> list[dict]
def extract_groups(classifications, group_types=()) -> list[str]     # interpretation 4
def decimal_string(raw, vikt_gram=None) -> str | None                # interpretation 6; None = skip
def fetch_food_list(fetcher, *, language, page_size, limit_foods=None) -> list[tuple[str, str]]
def build_data_file(fetcher, *, version, language=1, page_size=100, workers=4,
                    group_types=(), limit_foods=None, min_foods=1000,
                    allow_no_groups=False, log=print) -> tuple[dict, Report]
def write_data_file(path: Path, data: dict) -> None                  # interpretation 9
```

Field spellings the readers accept (case-insensitive, first present wins):
food key `nummer`, `livsmedelsNummer`, `livsmedelsnummer`, `id`; food name
`namn`, `livsmedelsNamn`; nutrient code `euroFIRkod`, `euroFIRKod`,
`euroFirKod`, `kod`; nutrient name `namn`, `benamning`; unit `enhet`;
value `varde`, `värde`; weight `viktGram`. The food key is turned into text
with `str()` (a JSON `1` and `"1"` both give `"1"`). `Report` holds the
counts and lists interpretation 4, 6 and 7 promise (foods, columns, foods
without a group, skipped values with up to 5 examples, classification types
seen, units read → written); `build_data_file` prints it through `log`.

`build_data_file` raises `ImportError_` for: fewer than `min_foods` foods;
foods but no group at all (unless `allow_no_groups`); no nutrient values at
all; any unrecognised shape. Output dict is exactly:

```json
{"key": "livsmedelsverket", "name": "Livsmedelsverket", "version": "2026-11-08",
 "licence": "CC BY 4.0", "attribution": "...",
 "columns": [{"key": "PROT", "name": "Protein", "unit": "g"}],
 "foods": [{"key": "1", "name": "...", "groups": ["..."], "values": {"PROT": "13.5"}}]}
```

**Tests (write first), `tests/scripts/test_import_livsmedelsverket.py`**
(module loaded with `importlib`, fixture via `ReplayFetcher`), with
`min_foods=0`, `workers=1` unless stated:

- **File shape on the fixture:** top-level keys exactly as above;
  `version` equals the one passed; three foods sorted `1, 2, 10` (numeric
  order, not text order); each food has `key` (a string), `name`, `groups`
  (list of str), `values` (dict of str → str); columns have `key`, `name`,
  `unit`, sorted by key; no column or value references a missing column.
- **Decimal strings:** every value is a `str`; `"13.5"` for the number 13.5;
  `"1.5"` for the comma string `"1,5"`; `"1500"` for 1500; no value
  contains `e`, `E` or `inf`; a JSON number such as `0.1` stays `"0.1"`
  (no float noise: also test `decimal_string` with the raw text `0.30000000000000004`
  not appearing, by feeding `Decimal("0.3")` parsed from JSON `0.3`).
  `decimal_string` unit cases: `"13.50"` → `"13.5"`, `0` / `"0,0"` → `"0"`,
  `None`, `""`, `"  "`, `"spår"`, `"<0.1"`, `True` → `None`; `viktGram` 50 doubles
  the value, 100 leaves it, 0 and `"x"` → `None`.
- **Missing is not zero:** food 2's null FE is absent from its `values`
  (key not present), and the report counts it.
- **Unit normalisation:** the VITD column's unit is `µg` (U+00B5) although
  the foods use U+00B5, U+03BC and `ug`; the VITB12 column from `mikrog` is
  `µg`; both micro characters in the test source are written as escapes
  (`"µg"`, `"μg"`) so the file's bytes are unambiguous; the
  unknown unit `kg CO2e` stays exactly `kg CO2e`; `g`, `mg`, `kJ`, `kcal`
  stay as they are.
- **Columns:** `ENERC` appears with two units, so the keys are `ENERC:kJ` and
  `ENERC:kcal`, names `Energi (kJ)` and `Energi (kcal)`; `PROT` (one unit)
  keeps the key `PROT`; VITD with three spellings is one column with the key
  `VITD`; a nutrient with no code uses its name as key (unit test on
  `read_values` plus the key rule with a hand-made payload).
- **Groups:** `groups` of foods 1 and 2 are `["TEST Grains"]` and `["TEST Fish
  and shellfish"]`, food 10's is `[]`; `extract_groups` unit cases: first
  match wins, matching is case-insensitive and by substring (`"Livsmedelsgrupper"`),
  `group_types=("LanguaL",)` selects the LanguaL name, no match gives `[]`, an
  empty or malformed list gives `[]`, an entry with a type but no name is
  skipped.
- **Group failure:** a fetcher over the fixture with every Livsmedelsgrupp
  entry removed raises `ImportError_` mentioning the classification types
  seen (`LanguaL`, `FoodEx2`) and `--group-type`; with `allow_no_groups=True`
  it succeeds with all `groups` empty.
- **Reader tolerance:** `read_foods` on a bare list, on `{"livsmedel": [...]}`,
  on `{"items": [...]}`, on entries keyed `Nummer`/`Namn` (case) and with an
  integer or string key; on a dict with no list inside raises `ImportError_`
  whose message lists the keys it saw; `read_values` the same for
  `naringsvarden` with `euroFIRkod` and `euroFirKod`; `page_total` from `_meta.totalRecords`,
  `totalRecords`, `total`, and `None` when absent.
- **Paging** (small in-test `FakeFetcher` serving 5 foods): reaches all 5 with
  page sizes 2, 5 and 100; stops on a reported total without asking for
  another page (assert the requests made); stops on an **empty page** when no
  total is reported; **terminates when the server ignores `offset`** (every
  call returns the same page: result is that page once, and the call count is
  2); a server that returns fewer than `limit` but not the end (cap at 2 when
  asked 100) still gets all foods; a food repeated across pages is kept once;
  `limit_foods=3` stops fetching the list early and the result has 3 foods.
- **Failure paths:** a food whose `naringsvarden` request raises propagates
  (nothing partial returned); `min_foods=1000` on the 3-food fixture raises
  `ImportError_` saying how many were found; zero values anywhere raises;
  `ReplayFetcher` asking for a request that is not recorded raises
  `ImportError_` naming the request key.
- **Determinism:** `workers=4` and `workers=1` give equal dicts; building
  twice and `write_data_file` twice give byte-identical files.
- **`write_data_file`:** the output is gzip, reads back with `gzip.open` and
  `json.load` to the same dict; the JSON text contains `µ` as itself, not as
  `µ`; the gzip header mtime is 0; it creates the parent directory;
  a failure while writing (monkeypatched) leaves no `.tmp` file and an
  existing target untouched.
- **`RecordingFetcher`:** wraps the replay fetcher, a build through it, `save`,
  and then a `ReplayFetcher` on the saved file gives an equal data dict
  (the record/replay round trip).
- **Catalogue is the unit authority:** a test that the script has no unit
  table of its own: `grep`-style check that it imports `normalise` from
  `server.units` and that `build_data_file`'s unit for a hand-made
  `"Mikrog"` entry equals `server.units.normalise("Mikrog")`.

**Checked:** `python3 -m pytest tests/scripts -q` (the file's tests were written
first and failed on the missing script), then the whole suite. Differences: a
column is only created from an entry that has a number (a nutrient with no
number anywhere makes no column); a key with several units whose names already
differ keeps its names (the unit is appended only when names clash);
`ReplayFetcher` exposes the recorded dict as `.responses`; `Report` fields are
`foods`, `columns`, `foods_without_group`, `skipped_missing`,
`skipped_non_numeric`, `skipped_examples`, `classification_types`, `units`;
`RecordingFetcher.save` writes one key per line.

**Verify:** `python3 -m pytest tests/scripts -q`, then the whole suite
`python3 -m pytest -q`.

### Task 4: The command line and the HTTP fetcher

**Files:** modify `scripts/import_livsmedelsverket.py`,
`tests/scripts/test_import_livsmedelsverket.py`.

**Build:**

- `HttpFetcher(base_url, *, timeout=30, retries=3, sleep=time.sleep,
  user_agent="food-opti-planner data import (manual run)")`: `GET base +
  path` with the query string, `Accept: application/json`, JSON parsed with
  `parse_float=Decimal`; retries 429, 5xx and network timeouts / connection
  errors at 1, 2, 4 seconds (`sleep` injectable), raises `ImportError_` with
  the URL and status after the last try, and at once on other 4xx (no
  retry for 404); honours `Retry-After` if it is a whole number of seconds
  up to 30. `ReplayFetcher` and `RecordingFetcher` parse and store bodies the
  same way (the recorded file is read with `parse_float=Decimal` too, so
  `RecordingFetcher` writes numbers back unchanged; Decimals serialise via a
  `default=` that emits the number's text through `json.JSONEncoder`-safe
  `float`-free means: a small custom encoder writing `Decimal` as a bare
  number literal).
- `main(argv=None) -> int`: options `--out` (default
  `server/data_sources/livsmedelsverket.json.gz`, resolved from the repository
  root), `--base-url` (default the research URL), `--language` (1), `--page-size`
  (100), `--workers` (4), `--version`, `--group-type` (repeatable),
  `--allow-no-groups`, `--min-foods` (1000), `--limit-foods N`, `--record
  FILE`, `--replay FILE` (use a recorded file instead of HTTP; mutually
  exclusive with `--base-url`). Rules: `--limit-foods` without `--out` is an
  error (message explains why); the repository root is put on `sys.path` at the
  top of the script; progress lines go to stderr; a summary at the end (the
  Report) lists counts, the classification types seen, skipped values, units
  read → written and the output path and size; exit code 0 on success, 1 on
  `ImportError_` (message to stderr, no file written), 2 for argparse errors.
  A `--help` text names the first-run checklist of Task 5 in one line.
- The default `--out` file is never written by the tests.

**Tests (first):**

- `main(["--replay", fixture, "--out", tmp, "--min-foods", "0", "--page-size", "2",
  "--version", "2026-11-08"])` returns 0, writes a gzip file whose JSON equals
  `build_data_file`'s dict for the fixture; stdout/stderr summary contains the
  food count and the classification types.
- `--limit-foods 2` without `--out` returns 2 (argparse error) and writes
  nothing; with `--out` and `--min-foods 0` it works and has 2 foods.
- default `--min-foods` on the fixture returns 1 and writes no file; the
  message says 3 foods were found.
- `--record FILE` with `--replay`: round trip as in Task 3 through `main`.
- `--allow-no-groups` and `--group-type` are passed through (a fixture copy
  without Livsmedelsgrupp entries: exit 1 without the flag, 0 with it, and
  `--group-type LanguaL` gives LanguaL names as groups).
- `HttpFetcher` against a local `http.server.ThreadingHTTPServer` on
  `127.0.0.1` port 0, in a thread, serving the fixture's bodies: a normal
  build through it equals the replay build; the server answers 503 twice then
  200 (retries succeed; `sleep` recorded as 1, 2); 503 forever raises
  `ImportError_` after 4 requests; 404 raises after 1 request; a `Retry-After:
  1` header is honoured through `sleep`; the request carries the `sprak`,
  `limit`, `offset` query and the `User-Agent`. No other network is touched
  (the base URL is always the local one).

**Checked:** tests as planned, the dry run on the fixture (output eyeballed with
`gzip -dc`, exit 0), `--help`, and `git status` shows no `server/data_sources/`.
Differences: the `Retry-After` test uses 3 seconds so it differs from the
default first delay of 1; a refused connection is also tested (retried, then
`ImportError_`); `--record` saves what was seen even when the run fails, so a
failed trial still shows the shapes; `--limit-foods` below 1 and `--page-size`
or `--workers` below 1 are argparse errors; the summary goes to stderr.

**Verify:** `python3 -m pytest tests/scripts -q`; `python3
scripts/import_livsmedelsverket.py --help` prints the options; the whole suite
`python3 -m pytest -q`. A manual dry run on the fixture:
`python3 scripts/import_livsmedelsverket.py --replay
tests/scripts/fixtures/livsmedelsverket/responses.json --out
<scratchpad>/x.json.gz --min-foods 0 --page-size 2`, then `gzip -dc` the output
and eyeball it. Make sure `git status` shows no new `server/data_sources/`.

### Task 5: Docs

**Files:** `docs/superpowers/specs/2026-11-03-ingredient-data-sources-design.md`,
`README.md`, `docs/superpowers/plans/2026-11-08-units-sources-import-slices.md`,
the units spec (one line), this plan.

- **Data source spec:** under "First task of the plan" add a subsection
  **"API check findings (D1)"**, dated 2026-11-08, saying first that the
  dataportal host could not be reached from the session, so everything below
  is from web search summaries and **unverified**, then: base URL and
  endpoints; the field names; per 100 g (`viktGram`); CC BY 4.0 with the
  credit line used; units come per nutrient (`enhet`), energy expected as two
  rows; the vitamin D change of 2025 (a missing value is not zero). Then an
  **Open points (unverified)** list the owner closes on the first real run:
  (1) food groups: treated as a flat list, one name per food, from the
  classification whose type matches "livsmedelsgrupp"; whether the API
  exposes a tree (LanguaL / FoodEx2 hierarchy, parent links) is not known,
  and if it does the change is confined to `extract_groups` and the
  tag mapping in D2; (2) paging parameters (`offset`/`limit`) and the
  language parameter (`sprak`); (3) the unit strings as the source writes
  them (micro spelling) and the energy rows' codes; (4) the exact attribution
  wording; (5) whether a source version exists (the file uses the download
  date). Update the file-format example to show the `attribution` key and
  the column-key rule (interpretation 5), and the "Testing → Import script"
  line to say the recorded response is hand-made from the documentation until
  a real capture replaces it.
- **README:** add to the status paragraph that a script to build
  Livsmedelsverket's data file exists (not yet generated). Add a short
  section **"Refreshing the Livsmedelsverket data file"** with the exact
  commands: first run with `--limit-foods 5 --out /tmp/lv-trial.json.gz
  --min-foods 0 --record /tmp/lv-trial.json` and what to check in the summary
  (classification types, units written, groups found, no skipped values that
  look like data); send `/tmp/lv-trial.json` back to replace the fixture with a
  real capture; then the real run `python3 scripts/import_livsmedelsverket.py`
  (needs network access to `dataportal.livsmedelsverket.se`, a few minutes),
  check the summary again, `git add server/data_sources/livsmedelsverket.json.gz`,
  commit (`data: Livsmedelsverket <version>`) and open a PR. Say the app works
  without the file (the data source simply is not loaded) and the licence
  credit line must stay visible in the app (S2).
- **Master plan:** add under the overview table, after the U-slice lines:
  "D1 script done: see `2026-11-08-slice-d1-livsmedelsverket-data-file.md`.
  The data file itself is generated and committed by the owner (README)."
  In the D1 section, note the first task's outcome (findings unverified,
  groups treated as flat) in one sentence. Leave "Proposed" status.
- **Units spec:** the alias list for `µg` gains `mikrog` and `mikrogram`.
- **This plan:** set Status to "Built" and add under each task how it was
  checked and the differences from this text, as the earlier slice plans do.

**Checked:** the whole suite, `git status`, no `server/data_sources/`.
Differences: the spec's example "kg CO2e" → "kg" is replaced by "ug" → "µg",
as unknown units stay as written (the catalogue has no CO2e unit).

**Verify:** the whole suite once more, `git status` clean apart from the
plan's own files, and that no file under `server/data_sources/` exists.

## Done when

`python3 scripts/import_livsmedelsverket.py --help` works; on the recorded
fixture the script writes a deterministic `.json.gz` in the data source spec's
format (decimal strings, catalogue unit spellings, one group per food, no
value for a missing one); the failure cases (unrecognised shape, no groups,
too few foods, HTTP errors) stop without writing; `micro` spellings including
`mikrog` normalise to `µg`; the spec records the API findings and open
points as unverified; the README tells the owner how to run the script and
commit the data file; the whole test suite passes and no data file or
invented Livsmedelsverket numbers are in the repository.
