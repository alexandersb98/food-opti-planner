# Slice D2 — Reference Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** The server keeps a read-only reference copy of each data file in
`server/data_sources/*.json.gz` (the format D1's script writes). At startup,
after the migrations, a file whose version differs from the stored one is
loaded in one transaction: columns, foods, values and source tags by their own
keys, what the file no longer has marked withdrawn. The Settings page (S1) gets
a **Data sources** card, one row per source; a row opens the read-only source
page (S2) with name, version, imported at, attribution, a **Colour** picker and
a searchable column list (no mapping yet). On Tags (C6) source tags show in
their source's colour with its name, can't be renamed or deleted (422
`source_tag`) and have no rename or delete controls; they default to the
**Any** rule. The app works with zero data sources: when no file is present
startup logs one info line and loads nothing.

**Architecture:** The rules sit in one server module, `server/source_loader.py`
(no FastAPI import): `read_file(path) -> DataFile` validates the file and
raises `DataFileError`; `load_file(session, DataFile) -> Loaded | None` writes
the copy for one file (None when the version is unchanged); `load_all(engine,
directory)` runs every `*.json.gz` of a directory, each in its own transaction,
logging a failure and going on. `server/app.py`'s lifespan calls `load_all`
after `migrate`. Bulk rows go in with SQLAlchemy 2's executemany insert, not one
ORM object per row (about 140 000 value rows for the real file). The API is one
router, `server/api/data_sources.py`; `server/api/tags.py` gains the `source`
field and the `source_tag` refusal. The app mirrors this: `SettingsPage` gets a
`DataSourcesCard` component, a new `DataSourcePage` is S2 (route
`/settings/data-sources/:key`), and `TagsPage` renders source tags differently.
D3 later adds `source_columns.mapped attribute` and D4 the ingredient link; this
slice leaves room for both and adds no converter to `server/unit_change.py`
(there are no stored numbers in attribute units to convert yet; D4 adds the
`source value` converter).

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, `gzip`/`json`/`Decimal`; Vue 3,
Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the data source spec
[`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md)
(decisions 1–3, 5, 6, 12; "Data model"; "The data file and its import";
"Settings and the data source page"; "Tags and tag groups", the C6 part about
source tags; "Errors"; "Testing"); slice D2 and the rules of
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
the file format and its optional `attribution` key from
[`2026-11-08-slice-d1-livsmedelsverket-data-file.md`](2026-11-08-slice-d1-livsmedelsverket-data-file.md);
screen S1 in the units spec, C6 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).

**Status:** Planned; to be built task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- Ships Alembic migration `0010` (five new tables, `tags.source_id`); the
  migration test (`tests/server/test_migrations.py`) stays green.
- API tests run on SQLite and, in CI, on Postgres: no SQLite-only SQL.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API change (Task 4): `npm run gen:api` in `web/` (regenerates
  `web/openapi.json`, `web/src/api/schema.ts`; `web/src/test-units.json` should
  come out unchanged).
- The Playwright flow gets a step (Task 7).
- No test calls the internet. **The real data file is not in the repository**
  (the owner generates it with D1's script), so nothing here may need it: tests
  and e2e use a small fixture file of clearly fake "TEST" foods.
- No `server/unit_change.py` change: D2 adds no converter.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **No file, no problem.** If the data directory is missing or holds no
   `*.json.gz`, startup logs at info level (`no data files in <dir>; no data
   sources loaded`) and goes on. `GET /api/data-sources` then answers `[]`, and
   S1's card says so. Loading is skipped when `migrate_on_startup` is off (the
   tables may not exist then). A file whose load fails (spec: "logged at
   startup; the old copy stays") is logged at error level with its traceback;
   the other files still load and the app starts.
2. **Where the directory comes from.** `Settings.data_sources_dir`, default
   `server/data_sources/` next to the code, environment variable
   `DATA_SOURCES_DIR`. Tests need it to be settable: `settings_with` in
   `tests/server/conftest.py` defaults it to a directory that does not exist,
   so that the real 2 500-food file, once committed, is never loaded by the
   ordinary API tests; tests of loading pass a directory of their own.
3. **Module names.** The loader is `server/source_loader.py`, not
   `server/data_sources.py`, which would sit beside the data directory
   `server/data_sources/` and confuse imports. The router is
   `server/api/data_sources.py` (as `/api/data-sources`).
4. **Two columns the spec's data model does not list.** `data_sources.attribution`
   (text, nullable) holds what S2 shows as "the source's attribution text".
   Its value is the file's `attribution`; if that is absent but `licence` is
   given, `"Licence: <licence>"`; else NULL (D1 makes `attribution` optional).
   The licence itself is not stored. `data_sources.colour` is `String(7)`
   (`#rrggbb`). The data source spec's table is updated in Task 8. The spec's
   `tags.source` is the column `tags.source_id`.
5. **Sizes.** Keys: `String(100)` (`source_columns.key`, `source_foods.key`;
   `data_sources.key` 50). Names of columns and foods: `String(200)`, so a long
   nutrient name never fails a load (D4 enforces the 100 of an ingredient name
   when it copies). `source_columns.unit` uses `UNIT_LENGTH` (20). Values are
   `EXACT_NUMBER` (15 digits, 6 decimals, as every stored number); the file is
   written with at most 6 decimals (D1), more are rounded half up on load, and a
   value that does not fit 15 digits makes the file fail validation.
6. **File validation** (`read_file`), all failures `DataFileError` with a
   message that says what and where: the file is gzip, UTF-8 JSON, an object
   with string `key` (matching `^[a-z0-9][a-z0-9_-]*$`, at most 50), `name` (1–100
   characters), `version` (1–50 characters), optional string `licence` and
   `attribution`; `columns`: list of objects with string `key` (1–100), `name`
   (1–200) and `unit` (0–20, may be empty), keys unique; `foods`: list of objects
   with string `key` (1–100), `name` (1–200), `groups` list of non-empty strings
   of at most 100 characters (D1 writes one name; the loader accepts several),
   `values` an object from a known column key to a decimal string (JSON numbers
   are refused: the format is strings, never floats), keys unique. JSON is parsed
   with `parse_float=Decimal` anyway so a stray number can be named in the error
   rather than crash. A value that is not finite or is out of range fails the
   file.
7. **What a load does** (spec, "Loading at startup"). Per file, in one
   transaction, if the stored version of that key differs or there is no row:
   - the `data_sources` row is made (colour from a fixed palette of 8 distinct
     colours, by how many sources exist, cycling) or updated (`name`, `version`,
     `attribution`, `imported_at = models.now()`); **the colour is never touched
     by a load** (the user may have changed it);
   - columns and foods are matched by `key`: new ones inserted, existing ones get
     the file's name (and unit, for columns) and `withdrawn = false`; those the
     file no longer has get `withdrawn = true`. Ids never change;
   - for every food **in the file** its values and tag links are replaced (delete
     the source's non-withdrawn foods' rows, then bulk insert); **withdrawn foods
     keep their values and tags** ("a food the source drops is marked withdrawn,
     never deleted", and ingredients added from it keep working);
   - a source tag is made per food group the first time it appears (below); a
     group the file no longer has keeps its tag.
   The file is always fully validated first (a broken file is an error whatever
   its version); then, if the version is unchanged, nothing is written.
   The version check does not look at file contents, so a re-generated file with
   the same version is not loaded (D1's version is the download date, so the owner
   changes it by downloading on another day or passing `--version`).
8. **Source tag names.** A tag's name is its group's name. If a name is already
   used by another tag (a user's own tag, or a group of another source), the tag
   is named `"<group> (<source name>)"`. If that is taken too the load fails
   (logged, rolled back); it needs a deliberate clash and is not worth more code.
   On later loads an existing source tag of the source is found by either of the
   two names, so a renamed-by-clash tag is reused. Source tags are made with
   `derive = "any"` and `source_id` set. A user later creating a tag with a
   source tag's name gets the usual 409 `name_in_use`.
9. **Source tags and their rule.** Spec decision 12: users can't rename or delete
   them but can change their rule. So `PUT /api/tags/{id}` on a source tag is
   allowed when the name is unchanged (the rule can change) and refused with 422
   type `source_tag` on `["body","name"]` when the name differs; `DELETE` is
   refused with 422 type `source_tag` on `["path","tag_id"]`. The 422 body has
   the `FieldErrors` shape the app already reads. The app hides both controls, so
   the refusal is the server's second line.
10. **`Tag` response gains `source`:** `{key, name, colour}` or `null`. (`group`
    comes with D6.) `GET /api/tags` orders user tags first, then source tags,
    each by id, so a loaded source's hundred tags don't bury the user's own.
    Other tag pickers (ingredient, recipe, plan filters) are unchanged in this
    slice; they list every tag, and source tags there stay plain. D4 decides how
    source tags appear on an ingredient.
11. **Data source API.** `GET /api/data-sources` answers the summaries ordered by
    name: `key, name, colour, version, imported_at, food_count` (foods not
    withdrawn), `column_count` (columns not withdrawn). D3 adds `mapped_count`
    (S1's "how many columns are mapped"; there is no mapping yet, so D2's row
    shows the version and the food count). `GET /api/data-sources/{key}` answers
    the summary plus `attribution` and all `columns` (`id`, `key`, `name`,
    `unit`, `withdrawn`), active ones by name, then withdrawn ones by name. All
    columns come in one response (about 55) and S2's search filters them in the
    browser. `PATCH /api/data-sources/{key}` takes `{"colour": "#rrggbb"}`
    (`extra="forbid"`; a pattern check, case-insensitive, saved in lower case;
    anything else is the standard 422), answers the same as GET. Unknown key:
    404 "No such data source". Foods are not listed (D4's search).
12. **S1 card is independent.** The Data sources card loads for itself, so a
    failing `/api/data-sources` shows "Could not load the data sources." and
    Retry inside the card and never hides Preferred units. With no sources the
    card shows "No data sources loaded." S2 is a route under the settings path
    (`/settings/data-sources/:key`) rendered full page with a back arrow to
    Settings (like the editors); the menu stays six entries.
13. **Colour editing.** A native colour input (`<input type="color">` through
    `q-input type="color"`), saved on its `change` event (when the picker
    closes), not on every `input`, so dragging does not send requests. A failed
    save shows the common "Could not save" text and the dot returns to the stored
    colour.
14. **Startup time.** The load runs synchronously in the lifespan before the app
    serves, as the migrations do. A benchmark-marked test loads a synthetic
    2 500-food × 55-value file on SQLite and prints the time; it is never part of
    the ordinary run. Cloud Run's startup allowance is far larger than the
    expected seconds; if the Neon load proves slow, moving it to a background
    thread is a later change.
15. **No tag-group, mapping or ingredient columns.** `source_columns` has no
    mapped attribute (D3), `ingredients` no source food (D4), `tags` no group
    (D6). `source_food_values` has no index on its column id (nothing queries by
    column yet; D5's check can add one).

## Tasks

### Task 1: Server: tables, migration, settings

**Files:** modify `server/models.py`, `server/settings.py`,
`tests/server/conftest.py`, `tests/server/test_migrations.py` (only if a new
assertion helps); create `server/migrations/versions/0010_data_sources.py`.

Models (all in `server/models.py`, docstrings in the file's style):

| Model / table | Columns |
|---|---|
| `DataSource` / `data_sources` | `id`, `key` String(50) unique, `name` String(100), `colour` String(7), `version` String(50), `attribution` Text nullable, `imported_at` DateTime |
| `SourceColumn` / `source_columns` | `id`, `source_id` FK `data_sources.id` (cascade), `key` String(100), `name` String(200), `unit` String(UNIT_LENGTH), `withdrawn` Boolean (server default false); unique (`source_id`, `key`) |
| `SourceFood` / `source_foods` | `id`, `source_id` FK (cascade), `key` String(100), `name` String(200), `withdrawn` Boolean (server default false); unique (`source_id`, `key`) |
| `SourceFoodValue` / `source_food_values` | `food_id` FK `source_foods.id` (cascade), `column_id` FK `source_columns.id` (cascade), `value` `EXACT_NUMBER`; primary key (`food_id`, `column_id`) |
| `source_food_tags` (Table, like `ingredient_tags`) | `food_id` FK `source_foods.id` (cascade), `tag_id` FK `tags.id` (cascade); primary key both |
| `Tag.source_id` | nullable FK `data_sources.id`; `Tag.source` relationship (`Mapped[DataSource | None]`, no delete cascade) |

`DataSource` is defined before `Tag` in the file. A comment on `Tag` says
`source_id` set means a source tag (decision 12). `Settings` gets
`data_sources_dir: Path = DEFAULT_DATA_SOURCES_DIR` (`server/data_sources`) and
reads `DATA_SOURCES_DIR` in `from_env`. `server/export_openapi.py` needs no
change (it passes explicit settings; the default dir is never read because
`migrate_on_startup=False`).

Migration `0010` (revision `0010`, down `0009`): `create_table` for the four
tables and the association table in dependency order, with the unique
constraints named; `tags.source_id` through `op.batch_alter_table("tags")`
(`add_column` + `create_foreign_key("fk_tags_source_id_data_sources", ...)`),
as SQLite cannot add a foreign key by `ALTER`; `downgrade` drops in reverse
(batch drop of the constraint and column first).

`tests/server/conftest.py`: `settings_with` passes
`data_sources_dir=Path(__file__).parent / "no_data_sources"` (does not exist) so
no test loads a real file by accident. The package-data line in `pyproject.toml`
gets `"data_sources/*.json.gz"` so an installed package carries the files.

**Tests (first):** the existing `test_migrations_build_the_tables_the_models_describe`
must fail until the migration exists (run it after the models, before the
migration) and pass after; add `test_settings` cases: `data_sources_dir`
default ends with `server/data_sources`, `from_env` reads `DATA_SOURCES_DIR`.

**Verify:** `python3 -m pytest tests/server/test_migrations.py
tests/server/test_settings.py -q`, then the whole root suite; on Postgres if a
`TEST_DATABASE_URL` is available (CI does it otherwise). Commit: "server: tables
for the data source reference copy".

### Task 2: Server: the data file reader and the loader

**Files:** create `server/source_loader.py`, `tests/server/data_source_files.py`
(helper, not a test module), `tests/server/test_source_loader.py`.

**Helper `tests/server/data_source_files.py`:**
`test_source(**changes) -> dict` returns the fixture file as a dict (key
`testsource`, name `TEST Source`, version `2026-01-01`, attribution `TEST data,
not real: for tests only.`, columns `PROT` "TEST Protein" g, `ENERC:kcal` "TEST
Energy" kcal, `VITD` "TEST Vitamin D" µg; foods `1` "TEST Oats" groups
["TEST Grains"], values PROT "13.5", ENERC:kcal "389", VITD "0"; `2` "TEST Milk"
["TEST Dairy"], PROT "3.4", ENERC:kcal "64" (no VITD: missing is not 0); `10`
"TEST Cheese" ["TEST Dairy"], PROT "25", ENERC:kcal "402"); `write(directory,
data, name="testsource.json.gz") -> Path` writes it as D1 does (gzip, `mtime=0`,
UTF-8, compact JSON). Names are obviously fake ("TEST …").

**`server/source_loader.py`:**

```python
class DataFileError(Exception): ...        # message says what and where

@dataclass(frozen=True)
class DataFile:  # validated; values already Decimal
    key: str; name: str; version: str; attribution: str | None
    columns: list[FileColumn]   # key, name, unit
    foods: list[FileFood]       # key, name, groups (list[str]), values (dict[str, Decimal])

def read_file(path: Path) -> DataFile: ...                       # interpretation 6
def load_file(db: Session, file: DataFile) -> bool: ...          # True if it loaded, False if same version
def load_all(engine: Engine, directory: Path) -> list[str]: ...  # keys loaded; never raises DataFileError
```

`load_file` implements interpretation 7 and 8 and commits (the caller's session
is its transaction: on any exception it rolls back and re-raises). Uses
`db.execute(insert(models.X), rows)` in chunks of 5 000, reads existing rows into
dicts by key, re-selects `key -> id` after inserting, deletes with
`delete(SourceFoodValue).where(food_id.in_(select(SourceFood.id).where(source_id
== s, withdrawn.is_(False))))` (same for tags) after the withdrawn flags are set.
`load_all` does nothing but log info when the directory is missing or empty
(interpretation 1); otherwise for each file in sorted order opens its own
`Session`, calls `read_file` then `load_file`, catches `Exception`, logs it with
`logger.exception("could not load data file %s; the earlier copy stays", path)`
and continues. Logger: `logging.getLogger(__name__)`.

**Tests (write first), `tests/server/test_source_loader.py`** (a `db` fixture: a
migrated database from `database_url`, a `Session`; files written into `tmp_path`):

1. **First load:** one `data_sources` row (key, name, version, attribution,
   `imported_at` set, colour a `#rrggbb`); 3 columns with units; 3 foods; the
   values as exact `Decimal` (`"13.5"` reads back `Decimal("13.5")`; food 2 has
   no VITD row); two source tags `TEST Grains`, `TEST Dairy` with `source_id`
   set and `derive == "any"`; `source_food_tags` links food 2 and 10 to Dairy;
   `load_file` returns True.
2. **Same version loads nothing:** load, change a value in the file but keep the
   version, load again: returns False, the stored value is the first one,
   `imported_at` unchanged.
3. **New version adds, updates, withdraws:** version 2 changes Oats' name and
   PROT value, adds food `3` and column `FIBTG`, drops food `10` and column
   `VITD`. After: same ids for the survivors; names and values updated; food 3
   and `FIBTG` present; food 10 and `VITD` `withdrawn`; food 10 **keeps its values
   and its Dairy tag link**; `version` and `imported_at` changed.
4. **Withdrawn comes back:** version 3 has food 10 and `VITD` again: `withdrawn`
   cleared, same ids, values as in version 3's file.
5. **A group's tag survives its group leaving:** version 2 moves every Dairy food
   to a new group `TEST Cheeses`: `TEST Dairy` still exists (and is still the
   same row), `TEST Cheeses` is new, the foods' links are the new ones.
6. **Colour survives:** set `colour` to `#112233` between loads; after version 2
   it is unchanged; a second source (another file key) gets a different default
   colour than the first.
7. **Tag name clash:** a user tag called `TEST Grains` exists before the first
   load: the source tag is `TEST Grains (TEST Source)`; the user's tag is
   untouched; a second load (version 2) reuses that tag (no third tag).
8. **Several groups per food** are all linked (file with `groups: ["A", "B"]`).
9. **Rollback:** version 1 loaded; a version 2 file that fails halfway (a value
   whose column key is unknown is caught by validation, so force a database
   failure instead: a source tag name clash that is also taken, interpretation 8)
   leaves every row as after version 1 (counts, version, a value) and
   `load_file` raised; and `load_all` on a directory with that file plus a good
   second source loads the good one and returns only its key, with an error in
   `caplog` that names the bad file.
10. **`read_file` refuses**, parametrised, each with a message naming the
    problem: not gzip; gzip but not JSON; JSON not an object; missing `key` /
    `version` / `columns` / `foods`; key with a capital letter or space; duplicate
    column key; duplicate food key; a value for an unknown column; a JSON number
    where a decimal string belongs; a non-numeric string (`"abc"`, `"NaN"`,
    `"1e5"`: exponent notation is refused, D1 never writes it); a value past 15 digits; a group name of 101 characters; a
    unit longer than 20 characters. A value with 8 decimals loads rounded to 6.
    A valid file with `attribution` missing: attribution NULL; with only `licence`:
    `"Licence: CC BY 4.0"`.
11. **`load_all` with no file:** a directory that does not exist and an empty one:
    returns `[]`, loads nothing, logs one info record (`caplog`) containing "no
    data files".
12. **Benchmark** (`@pytest.mark.benchmark`): a generated 2 500-food × 55-value
    file, first load then an update load that changes every value; prints both
    times; asserts the row counts only.

**Verify:** `python3 -m pytest tests/server/test_source_loader.py -q`, then the
root suite. Commit: "server: read and load data files into the reference copy".

### Task 3: Server: load at startup, with a committed fixture file

**Files:** modify `server/app.py`; create `tests/data/data_sources/testsource.json.gz`
(generated, see below); create `tests/server/test_data_sources_startup.py`;
modify `tests/server/conftest.py` (a fixture).

- `server/app.py`: `Settings` is already in scope; in `lifespan`, inside
  `if settings.migrate_on_startup:` after `migrate(...)`, call
  `source_loader.load_all(app.state.engine, settings.data_sources_dir)`.
- The committed fixture `tests/data/data_sources/testsource.json.gz` is made once
  from the helper (`python3 -c "from tests.server.data_source_files import *;
  import pathlib; write(pathlib.Path('tests/data/data_sources'), test_source())"`
  with `tests/` on the path; if import is awkward, run it from a throwaway
  script in the scratchpad). It is the e2e's data (Task 7). Its only content is
  the fake TEST foods of the helper, so nothing resembling real data is
  committed.
- `conftest.py` gets a `data_client` fixture: like `client` (logged in) but with
  `data_sources_dir` set to a `tmp_path` directory into which the helper wrote
  `test_source()`. To avoid duplicating `anonymous_client`, factor its app
  construction into a small `logged_in_client(database_url, web_dist, **settings)`
  context manager used by `anonymous_client`, `client` and `data_client`.

**Tests (first), `tests/server/test_data_sources_startup.py`:**
- the app started with a directory holding the fixture file has the source in
  the database (query through the engine or, once Task 4 exists, the API; here
  use the engine so this task stands alone): one source, three columns, three
  foods;
- the app started with a missing directory starts fine and has no source rows
  (the ordinary `client` fixture is that case: assert `GET /api/counts` works
  and the table is empty);
- a broken file in the directory does not stop the app from starting (the health
  endpoint answers), the error is in `caplog`;
- starting the same database twice with the same version leaves `imported_at`
  alone, and starting it with a changed version in the file (rewritten between
  the two starts) updates the rows;
- the committed fixture file equals the helper's `test_source()` after reading
  with `read_file` (keeps the two in step).

**Verify:** the new file, then the root suite. Commit: "server: load data files
at startup".

### Task 4: Server: data source API and source tags

**Files:** create `server/api/data_sources.py`, `tests/server/test_data_sources_api.py`;
modify `server/api/__init__.py` (register the router in `protected`),
`server/api/tags.py`, `tests/server/test_tags.py`, `tests/server/test_openapi.py`
(only if it lists routes).

**`server/api/data_sources.py`** (`APIRouter(prefix="/data-sources", tags=["data sources"])`),
models per interpretation 11:

```python
class DataSourceSummary(BaseModel):
    key: str; name: str; colour: str; version: str
    imported_at: datetime; food_count: int; column_count: int

class SourceColumn(BaseModel):
    id: int; key: str; name: str; unit: str; withdrawn: bool

class DataSource(DataSourceSummary):
    attribution: str | None
    columns: list[SourceColumn]

class DataSourceChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")
    colour: Colour   # Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$"), AfterValidator(str.lower)]
```

`GET ""` -> `list[DataSourceSummary]` ordered by name; counts with grouped
queries (no per-row query). `GET "/{key}"` and `PATCH "/{key}"` -> `DataSource`,
404 `No such data source` (`responses={404: ...}` like the other routers). Colour
type goes in `server/fields.py` if it reads better there.

**`server/api/tags.py`:**
- `class TagSource(BaseModel): key: str; name: str; colour: str`; `Tag` gets
  `source: TagSource | None`; `_response` fills it from `tag.source` (the
  relationship; `selectinload` it in `list_tags` so it is one extra query, not N).
- `list_tags` orders `models.Tag.source_id.is_not(None), models.Tag.id`.
- `update_tag`: if `tag.source_id is not None and body.name != tag.name` raise
  `invalid_fields([FieldError(loc=["body","name"], type="source_tag", msg="A
  source tag can't be renamed")])`; the rule may change. `delete_tag`: refuse a
  source tag with `FieldError(loc=["path","tag_id"], type="source_tag", msg="A
  source tag can't be deleted")`. Both 422s are added to the routes'
  `responses` (model `FieldErrors`) so `schema.ts` knows them.
- `create_tag` unchanged (it can't make a source tag).

**Tests (first), `tests/server/test_data_sources_api.py`** (use `data_client`;
`client` for the empty cases):
- `401` without a session on all three routes;
- empty list `[]` with `client`;
- list with the fixture: one row, `key "testsource"`, `name "TEST Source"`,
  `version "2026-01-01"`, `food_count 3`, `column_count 3`, a `#rrggbb` colour,
  `imported_at` a datetime;
- detail: `attribution` text, the three columns ordered by name; after the file
  is reloaded (a second app start through a rewritten file is Task 3's job; here
  mark a column withdrawn directly in the database through `app.state.engine`)
  the withdrawn column is last and has `withdrawn true`; counts drop to 2;
- 404 for an unknown key on GET and PATCH;
- PATCH colour `#FF8800` is saved as `#ff8800` and answered, a following GET has
  it; refused with 422: `red`, `#fff`, `ff8800`, `#gg0000`, a number, missing
  `colour`, and an extra field `{"colour": "#ff8800", "name": "x"}`; none of the
  refusals changes the colour; the version and the columns are untouched by PATCH.

**Tests added to `tests/server/test_tags.py`:** a user tag answers `source: null`;
with `data_client`: `GET /api/tags` lists user tags first (create `zzz` before and
`aaa` after the load order matters not: assert `zzz` and `aaa` come before the two
source tags) then the source tags `TEST Dairy`, `TEST Grains` with `source ==
{key, name: "TEST Source", colour}` and `derive == "any"`; `PUT` renaming a source
tag is 422 `source_tag` on `["body","name"]` and changes nothing; `PUT` with the
same name and `derive: "all"` is 200 and sticks; `DELETE` is 422 `source_tag` on
`["path","tag_id"]` and the tag is still listed; creating a tag named `TEST Dairy`
is 409 `name_in_use`; a user tag can still be renamed and deleted.

**Then:** `cd web && npm run gen:api`; check `git diff --stat` shows only
`openapi.json` and `schema.ts` changed (and `test-units.json` not).

**Verify:** the two test files, the root suite, `npm run typecheck` (the generated
types must not break existing code: `Tag` now has `source`, which
`web/src/test-data.ts`'s `tag()` defaults must supply: add `source: null`). Commit:
"server: data source API, source tags protected".

### Task 5: Web: S1's Data sources card and S2

**Files:** modify `web/src/api/types.ts`, `web/src/pages/SettingsPage.vue`,
`web/src/router.ts`, `web/src/i18n/en.json`, `web/src/test-data.ts`,
`web/src/pages/SettingsPage.test.ts`; create
`web/src/components/DataSourcesCard.vue` (+ `.test.ts`),
`web/src/pages/DataSourcePage.vue` (+ `.test.ts`).

- `types.ts`: export `DataSourceSummary`, `DataSource`, `SourceColumn`
  (from `Schemas[...]`).
- `test-data.ts`: `dataSourceSummary(fields)` and `dataSource(fields)` factories
  with plain defaults (`key 'testsource'`, `name 'TEST Source'`, colour
  `#1976d2`, version `2026-01-01`, `imported_at '2026-01-01T12:00:00'`, counts),
  `sourceColumn(fields)`.
- **`DataSourcesCard.vue`** (class `data-sources-card`): `useLoad(() =>
  api.GET('/api/data-sources'), [])`; a `q-card` like the preferred-units card
  with title "Data sources"; one `q-item clickable` per source (`:to` the S2
  route) with a colour dot (a small `q-avatar`/span with the source's background
  colour, `aria-hidden`), the name, and the caption "Version 2026-01-01 · 3 foods";
  a chevron. Empty: "No data sources loaded." Failed: the message and Retry
  (via `LoadState`). It is a separate component so its failure is its own.
- `SettingsPage.vue`: render `<DataSourcesCard/>` below the Preferred units card
  (inside the page, outside the preferences `LoadState`, so it shows even if
  preferences fail, and the preferences card shows even if it fails).
- **`DataSourcePage.vue`** (route `{ path: '/settings/data-sources/:key', name:
  'data-source' }` in the editors list of `router.ts`): `EditorHeader` with the
  source's name and back to `/settings`; `useLoad(() => api.GET('/api/data-sources/{key}',
  {params:{path:{key}}}), null)`; a 404 or failure shows `LoadState`'s message
  ("Could not load the data source."). Body, read-only: a definition list with
  **Version**, **Imported** (the date and time, `toLocaleString`), **Attribution**
  (omitted when null); **Colour**: `q-input type="color"` (outlined, dense, label
  "Colour") whose model is the stored colour; on `change` it PATCHes
  `{colour}`, replaces the page's data with the answer; on failure shows
  "Could not save." (`common.saveFailed`) and resets the input; **Columns**: a
  count line "55 columns", a `q-input` search (clearable, label "Search columns",
  the same pattern as the ingredients page), and a `q-list` of rows `name` with
  caption `unit` (the unit omitted when empty); withdrawn rows are listed last
  (the server's order is kept; the search filters with `searchByName`'s rule but
  must **not** re-sort, so write the filter without sorting or add a `sort`
  parameter), greyed (`text-grey-6`), with the caption "No longer in the source".
  No Attribute drop-down yet (D3). "No columns match." when the search finds none.
- `en.json`: `settings.dataSources.{title, empty, loadFailed, version, foods}` (use
  vue-i18n plural for foods like `count.*` do: check `count` keys' style),
  `dataSource.{loadFailed, version, imported, attribution, colour, columns,
  searchColumns, noColumnMatch, withdrawn, saveFailed?}` (reuse `common.saveFailed`).

**Tests (first):**
- `DataSourcesCard.test.ts`: two sources listed with name, "Version … · N foods",
  the dot's colour style; a row links to `/settings/data-sources/<key>`; empty
  state text; a failing request shows the message and Retry reloads.
- `SettingsPage.test.ts`: existing `server()` gets a `GET /api/data-sources`
  route (an empty list); new cases: the card is on the page; with the data
  sources request failing, the Preferred units card still works and the card shows
  its error; with the preferences failing the Data sources card still shows.
- `DataSourcePage.test.ts` (mount through `mountApp('/settings/data-sources/testsource')`):
  heading is the name; version, imported and attribution shown; no attribution
  line when null; columns listed with units in server order, withdrawn last and
  greyed with the caption; the search narrows by name (case-insensitive) and keeps
  order, empty result text; the colour input shows the stored colour; `setValue`
  of `#ff0000` then `trigger('change')` PATCHes `{colour: '#ff0000'}` once and
  shows the answer; a failing PATCH shows "Could not save." and resets the input
  (no PATCH on `input` events alone); a 404 shows the load-failed message; back
  arrow links to `/settings`.
- `MainLayout.test.ts` stays as is (still six menu entries).

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` in `web/`. Commit: "web:
Data sources card on Settings and the read-only source page".

### Task 6: Web: C6 shows source tags

**Files:** modify `web/src/pages/TagsPage.vue`, `web/src/i18n/en.json`,
`web/src/pages/TagsPage.test.ts`.

- A source tag's row (`tag.source != null`) shows its name, a colour dot in
  `tag.source.colour`, and the caption "TEST Source · When any ingredient has it"
  (source name, then the rule; the "added by hand" label is not used for source
  tags). It opens for editing like any row, but the opened form has **no Name
  input** (the name shown as text) and **no Delete button**; the derive radio
  group and Done remain (decision 12: the rule can change). Done sends the same
  `PUT` with the unchanged name. A source tag can't be the "new" row.
- New tags are still listed in server order (user tags, then source tags); the
  "+ New tag" row stays last.
- Handle a `source_tag` 422 on save gracefully (fallback `common.saveFailed`; the
  existing branch already does). No code for the delete refusal beyond the
  existing "Could not delete".
- `en.json`: `tags.sourceRule` ("{source} · {rule}") or reuse `info()` with the
  source; `tags.sourceTagNote` ("From {source}. It can't be renamed or deleted.")
  shown in the open form under the name text.

**Tests (first), `TagsPage.test.ts`** (existing helpers and `tag()` factory;
`tag({id, name, source: {key, name, colour}})`): a source tag row has the dot with
the source's colour, the source name and rule in its caption, not "added by
hand"; opened, it has no `Name` input and no Delete button, shows the note, and
changing the rule to all and Done sends `PUT` with `{name (unchanged), derive:
"all"}`; a user tag still has both controls; the source tags come after user
tags and "+ New tag" is last; a failing `PUT` with a `source_tag` 422 shows
"Could not save.".

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`. Commit: "web: source
tags on the Tags page, in the source's colour and protected".

### Task 7: End-to-end step, CI and run instructions

**Files:** modify `web/e2e/catalog.e2e.ts`, `.github/workflows/ci.yml`, `README.md`
(run instructions only; the status paragraph is Task 8).

- The e2e server needs the fixture: `DATA_SOURCES_DIR` pointing at
  `tests/data/data_sources`. README's end-to-end paragraph says so (`DATA_SOURCES_DIR=$PWD/tests/data/data_sources`
  next to `DATABASE_URL`, `PASSWORD_HASH`, `SESSION_KEY`). In `ci.yml`'s e2e job the
  `docker run` of the app gets `-v "$PWD/tests/data/data_sources:/data_sources:ro"
  -e DATA_SOURCES_DIR=/data_sources`.
- The flow gets a step, after the Settings unit steps (before Attributes): the
  **Data sources** card lists "TEST Source" with "3 foods"; open it; heading
  "TEST Source"; attribution text visible; three columns listed ("TEST Energy",
  "TEST Protein", "TEST Vitamin D"); the search "vit" leaves one; fill the colour
  input with `#ff0000`, reload, the value is still `#ff0000` (saved, not just
  shown); back to Settings. In the Tags step (the flow already opens Tags):
  `TEST Grains` and `TEST Dairy` are listed after the user's tag `vegan` with
  "TEST Source" in their captions and no "added by hand"; opening `TEST Dairy`
  shows no Delete button and no Name field. The existing assertion
  `await expect(page.locator('.tag-row')).toHaveText([/vegan.*added by hand/])`
  after creating the tag must be changed to expect the three rows
  (`vegan`, `TEST Dairy`, `TEST Grains`; source tags sorted by id: Grains first
  or Dairy first depends on the file, so assert with `toHaveCount(3)` and
  `.filter({hasText: ...})` rather than an ordered list). Update the flow's header
  comment.

**Verify (the run is the test):** `cd web && npx vite build`; start the server on
a temp SQLite file in the scratchpad with `DATABASE_URL`, `PASSWORD_HASH`,
`SESSION_KEY` and `DATA_SOURCES_DIR=$PWD/tests/data/data_sources`; run
`E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace off`;
kill the server. Also start it once with `DATA_SOURCES_DIR` unset and the repo's
default directory (absent) to see the log line "no data files" and that
`/api/health` and `/api/data-sources` (logged in) answer. Commit: "e2e, CI: data
source step with the fixture file".

### Task 8: Docs

**Files:** `README.md`, the master plan, the data source spec, the wireframes spec,
this plan.

- `README.md` status paragraph: the server keeps a read-only reference copy of the
  data files in `server/data_sources/` (loaded at startup, by version), Settings
  lists the sources, a source page shows its columns and sets its colour, and
  source tags show in the source's colour and are protected; and one sentence
  that the real Livsmedelsverket file is generated by the owner with
  `scripts/import_livsmedelsverket.py` and without it the app simply has no data
  source. Mention `DATA_SOURCES_DIR` beside the other settings if the README
  lists them.
- Master plan: after the D1 line add "D2 done: see `2026-11-08-slice-d2-reference-copy.md`."
- Data source spec: in "Data model", `data_sources` gains `attribution`
  (nullable text), `tags.source` is `source_id`, source and column name lengths;
  in "The data file and its import" add the optional `attribution` key and the
  loader's file validation, the tag-name clash rule (interpretation 8) and "a
  source tag's rule can be changed, its name not" under C6; under "API" the
  summary and detail shapes and `PATCH` (interpretation 11); in "Errors" `source_tag`
  as `422` on the name (rename) or the path (delete) and "Rename or delete of a
  source tag" row kept.
- Wireframes spec: add S1 (Settings: Preferred units, Data sources) and S2
  (Data source, read-only until D3) short sections after C6, and in C6 a sentence
  about source tags (colour dot, source's name, no rename or delete).
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once
more. Commit: "Docs: slice D2 built, README, data source and wireframes specs".

## Done when

With a data file in the data directory, the app loads it at startup (and loads
nothing when its version is unchanged), keeps withdrawn columns and foods, makes
one tag per food group without disturbing user tags, and shows the source on
Settings and its page with attribution, colour and columns; source tags appear on
C6 in the source's colour with its name and can't be renamed or deleted, while
their rule can change. Without any data file the app starts, logs one info line
and shows an empty Data sources card. Both test suites, lint, typecheck, the
migration test and the end-to-end flow are green; no real data file and no
network were needed.
