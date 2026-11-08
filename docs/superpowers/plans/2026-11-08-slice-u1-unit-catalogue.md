# Slice U1 — Unit Catalogue and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** The server knows which unit texts are real units (`g`, `kg`,
`µg`, `dl`, `msk`, `oz`, `kcal`, `st`, ...), what category and exact factor
each has, and sends that catalogue to the app. A new **Settings** page
(S1, the sixth and last menu entry) has a **Preferred units** card: one
drop-down each for mass, volume and energy, saving on change. Nothing
else changes yet: ingredient and attribute unit fields stay as they are
(U2), no unit converts (U3).

**Architecture:** `server/units.py` is a pure module (no database, no
FastAPI) and the only place unit rules live. Later slices import it: the
data import script (D1) to normalise the source's units, the unit-field
refusals (U2), the exact conversion on a unit change (U3) and the recipe
line units (R3). A new `preferences` table (key, value) is read and
written by `server/preferences.py` (defaults, validation, a
`preferred_unit` helper for U2 and D2-D4) and exposed by
`GET/PUT /api/preferences`. `GET /api/units` sends the catalogue. In the
app, two small shared modules, `web/src/units.ts` and
`web/src/preferences.ts`, keep what the server sent (the pattern of
`web/src/solve.ts`: module state, a `use…()` function, a `reset…()` for
tests; there is no Pinia in this project) and the Settings page reads and
writes through them, so U2's unit fields see a changed preference without
a refetch.

**Tech Stack:** as the GUI slices: FastAPI, SQLAlchemy, Alembic; Vue 3,
Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the units spec
[`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
(decisions, "The catalogue", "Preferred units", "Errors", "Testing");
slice U1 and "Overlaps settled here" (points 2 and 3, the catalogue owns
the built-in steps and the known free-text unit `st`) in
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md)
(the "master plan"); the import spec's unit table and aliases
([`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md),
lines on `unit`, "Normalized, e.g. `dl`, `st`, `msk`", "matsked", "msk."
→ `msk`); the data source spec's use of the catalogue and of
`preferences` ([`2026-11-03-ingredient-data-sources-design.md`](../specs/2026-11-03-ingredient-data-sources-design.md),
"Settings and the data source page", `GET/PUT /api/preferences`).

**Status:** Planned; to be built task by task on branch
`claude/implement-remaining-slices-qwrp83`.

## Global Constraints

- `meal_planner/` is not changed.
- One migration (`0009`, the `preferences` table). The migration test
  (`tests/server/test_migrations.py`) stays green. No data migration:
  existing units parse as they are.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set;
  nothing here may be SQLite-only (the preference save uses `merge`, not
  an `INSERT OR REPLACE`).
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API changes: `npm run gen:api` in `web/` (regenerates
  `web/openapi.json` and `web/src/api/schema.ts`; Task 3 also adds the
  units fixture to that script).
- The Playwright flow gets a step (Task 6).
- No test calls the internet or an AI service.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **Canonical spoon spelling is the Swedish one.** The units spec's
   table lists `tsp`/`tbsp` with `tsk`/`msk` as aliases, but the master
   plan (overlap 2, "matsked", "msk." → `msk`; "tesked" → `tsk`) and the
   import spec ("Normalized, e.g. `dl`, `st`, `msk`") use `msk` and `tsk`
   as the stored spelling, and this is a Swedish-first app. So the
   symbols are `krm`, `tsk` (5 ml) and `msk` (15 ml); `tsp`, `teaspoon`,
   `tesked` are aliases of `tsk`, and `tbsp`, `tablespoon`, `matsked`
   are aliases of `msk`. The factors are the spec's. The data source
   spec only cares that D1 stores catalogue spellings.
2. **Display names.** The spec says the catalogue "names each unit for
   the drop-downs" without giving the names. They are English words,
   sent as `name`: microgram, milligram, gram, kilogram, ounce, pound;
   millilitre, centilitre, decilitre, litre, kryddmått, teaspoon,
   tablespoon, fluid ounce, US cup, metric cup; kilojoule, kilocalorie;
   piece for `st`. Understood-but-not-offered prefixed units get a
   generated name (prefix name + base name: "centigram", "kilolitre").
   British spellings (litre), matching the Swedish-first user. The drop-down
   shows `kg (kilogram)`.
3. **The payload lists every understood unit, with `offered`.** Not only
   the offered ones: the app needs to tell that `cg` is mass (so U2's
   basis default is right for it) without a copy of the prefix rules.
   The server expands the prefixes, so the rules stay in one place. That
   is 5 prefixes x (g, l, J, cal) = 20 prefixed units, the 4 bare bases
   (g, l, J, cal), the 8 listed ones and `st`: 33 entries.
4. **Parsing details the spec leaves open.**
   - Text is normalised by NFKC, trimming, collapsing inner runs of
     spaces ("US  cup" = "US cup"), and dropping one trailing period
     ("msk." and "st." need no alias of their own). NFKC makes the micro
     sign U+00B5 and the Greek mu U+03BC the same; the catalogue's own
     spelling is `µ` U+00B5, as in the spec.
   - Matching is case-insensitive, with one exception: **`Cal` (exactly)
     is kcal**, as the spec lists it, while any other case of "cal" is
     the small calorie (4.184 J, understood, not offered). This is the
     one pair the spec's "no prefix differs by case only" claim misses;
     it is declared as a `case_sensitive_aliases` entry of kcal, which
     the payload carries, so the app's lookup agrees.
   - `parse` returns a `Unit` for known free-text units too (`st` and its
     aliases: "st", "stycken", "styck", "pcs", "piece", "pieces"), with
     `category` and `factor` None. It returns None only for text the
     catalogue does not know at all ("IU", "pinch", "cup").
   - A bare "cup" stays unknown, as the spec says.
5. **`factor(a, b)` takes texts and returns a `Decimal`.** Both ways of
   reading it: the multiplier that turns an amount in `a` into `b`. A
   ratio of two exact factors is not always a finite decimal (tsk to
   US cup), so it is computed at 40 significant digits, far past the 6
   decimals stored; where it is finite (kg to g, oz to lb, msk to ml) it
   is exact. U3 multiplies by it and rounds once, at the end. It
   returns 1 for the same known unit (including `st` to `st`) and for
   two spellings of the same unknown text ("IU", "iu"), and None across
   categories, between a category and free text, between different free
   texts, and for blank text.
6. **Preferences: payload and validation.**
   - `GET /api/preferences` answers `{"unit.mass": "g", "unit.volume":
     "dl", "unit.energy": "kcal"}` (dotted keys, as the spec names them;
     unset keys give the defaults, so the answer is always complete).
     D4 adds `last_data_source` here.
   - `PUT /api/preferences` takes any subset of the keys and answers the
     whole result. It saves nothing if anything is refused. An empty
     body `{}` is a no-op answering the current values.
   - A unit is accepted if it parses to a unit that is *offered* in that
     key's category, in any spelling ("gram" is saved as `g`). Anything
     else (a unit of another category, `st`, free text, an understood
     but not offered unit such as `cg`, a null) is 422 on that field
     with type `invalid_unit`. An unknown key is 422 on that key with
     type `extra_forbidden` (Pydantic's own, from `extra="forbid"`).
7. **No count on the Settings menu entry.** The menu shows counts only
   for pages the counts endpoint knows; `GET /api/counts` is unchanged.
8. **Offered units and their order.** Per category, in this order, as
   `units.offered(category)` and the payload give them (the app puts the
   preferred one first only in U2's unit fields; the Settings drop-downs
   keep this order):
   mass: µg, mg, g, kg, oz, lb; volume: ml, cl, dl, l, krm, tsk, msk,
   fl oz, US cup, metric cup; energy: kJ, kcal. The common prefixed
   units come first in size order, then the listed ones in the spec's
   table order (with `tsk`, `msk` for `tsp`, `tbsp`). `st` is offered
   (U2 puts it in the ingredient list) but has no category, so the
   Settings drop-downs never show it.
9. **Why a fixture file.** `web/src/test-units.json` is the payload of
   `GET /api/units`, committed, regenerated by `gen:api`, and checked by
   a server test. Component tests (this slice's Settings page, U2's
   combo box, later slices) build on it instead of a hand-typed
   catalogue that could drift from the server.
10. **App modules hold the server's answer; `findUnit` in the app is a
    lookup, not a second rule set.** `web/src/units.ts` finds a typed text
    among the payload's symbols and aliases using the same normalisation
    steps as interpretation 4 (it needs these few lines; the prefix and
    factor rules are not repeated). A server test and an app test share
    one list of spellings and expected symbols (the fixture) so the two
    can't drift unseen.

## Tasks

### Task 1: `server/units.py`, the catalogue

**Files:** create `server/units.py`, `tests/server/test_units.py`.

**Build:**

```python
Category = Literal["mass", "volume", "energy"]
CATEGORIES: tuple[Category, ...] = ("mass", "volume", "energy")
BASES: dict[Category, str] = {"mass": "g", "volume": "l", "energy": "J"}
PIECE = "st"                       # the known free-text unit for pieces
FACTOR_PRECISION = 40              # significant digits of a factor() ratio

@dataclass(frozen=True)
class Unit:
    symbol: str                    # the catalogue spelling: "µg", "msk", "US cup"
    name: str                      # "microgram", "tablespoon" (interpretation 2)
    category: Category | None      # None: a known free-text unit (st)
    factor: Decimal | None         # of one unit in the category's base, exact; None iff category is None
    aliases: tuple[str, ...]       # other spellings, matched case-insensitively
    case_sensitive_aliases: tuple[str, ...]  # matched exactly ("Cal")
    offered: bool                  # shown in the drop-downs

def catalogue() -> tuple[Unit, ...]      # every understood unit, offered ones first per
                                         # category in display order, then the rest
def offered(category: Category | None = None) -> tuple[Unit, ...]
def parse(text: str) -> Unit | None      # interpretation 4
def normalise(text: str) -> str          # the symbol if it parses, else the text trimmed
def factor(a: str, b: str) -> Decimal | None   # interpretation 5
```

Build the table at import from three small data tables, not from
copy-pasted rows:

- `PREFIXES`: `µ` 1e-6, `m` 1e-3, `c` 1e-2, `d` 1e-1, `k` 1e3, with their
  names (micro, milli, centi, deci, kilo). Factors are `Decimal` built
  from strings (`Decimal("0.000001")`), never from floats.
- The prefixable bases: `g` (mass, 1), `l` (volume, 1), `J` (energy, 1)
  and `cal` (energy, `Decimal("4.184")` J), with their names and the
  extra aliases from the spec: gram, grams; litre, liter, litres,
  liters (and `L`, which case-insensitive matching already gives);
  `ug`, `mcg` on `µg` only (a table of per-unit extra aliases, keyed by
  the resulting symbol); `Cal` as a case-sensitive alias of `kcal`.
- `LISTED`: `oz` (mass, 28.349523125 g; alias ounce), `lb` (453.59237 g;
  pound), `krm` (volume, 0.001 l; kryddmått), `tsk` (0.005 l; tsp,
  teaspoon, tesked), `msk` (0.015 l; tbsp, tablespoon, matsked),
  `US cup` (0.2365882365 l), `metric cup` (0.25 l), `fl oz`
  (0.0295735295625 l; `US fl oz`). Then `st` with category None.

Display order is interpretation 8's. Lookup tables (lower-cased
normalised spelling to `Unit`, and the exact-case one) are built once;
**building them raises if two units claim one spelling**, so a later
slice that adds an alias cannot silently steal one.

`parse` returns the same `Unit` object for every spelling.
`parse("")` and `parse("   ")` are None.

**Tests (write first), `tests/server/test_units.py`:**

- every prefix on each prefixable base: parametrised table of symbol,
  category, factor to base, e.g. `µg` mass 0.000001, `mg` 0.001, `cg`
  0.01, `dg` 0.1, `kg` 1000; `ml`, `cl`, `dl`, `kl`; `kJ` energy 1000,
  `kcal` 4184, `mcal` 0.004184; bases `g`, `l`, `J`, `cal`.
- listed units and their exact factors (all eight), each alias parses to
  its unit: ounce, pound, tsp, teaspoon, tesked, tsk, tbsp, tablespoon,
  matsked, msk, kryddmått, `US fl oz`, gram, grams, litre, liter, `L`,
  ug, mcg, `Kcal`, `Cal`.
- the two mu characters (U+00B5 and U+03BC) parse to the same unit;
  `ug` too.
- case and spaces: `"  KG "`, `"Dl"`, `"MSK"`, `"US  cup"`, `"fl   oz"`;
  trailing period: `"msk."`, `"st."`, `"tsk."`, `"dl."`.
- `cal` and `Cal` differ: `parse("cal").symbol == "cal"` (4.184 J, not
  offered), `parse("Cal").symbol == "kcal"`, `parse("CAL")` is `cal`.
- known free text: "st", "st.", "stycken", "styck", "pcs", "piece",
  "pieces", "ST" all parse to the `st` unit with category None and
  factor None; `offered` is True for it.
- free text stays free: "cup", "IU", "pinch", "", "  ", "dl2", "kgs"
  parse to None.
- `normalise`: "gram" gives "g", "MSK." gives "msk", " IU " gives "IU",
  "matsked" gives "msk", "pcs" gives "st".
- factors both ways: kg to g is 1000 and g to kg is 0.001; mg to µg
  1000; dl to ml 100; msk to ml 15 and ml to msk is within 1e-30 of 1/15;
  oz to lb exactly 0.0625 and lb to oz exactly 16; US cup to ml exactly
  236.5882365; kcal to kJ 4.184; kJ to kcal within 1e-30 of 1/4.184 (a
  non-finite ratio is accepted, a finite one must be exact: compare with
  `==` for the exact ones).
- no factor: g to ml, ml to kcal, g to kcal, st to g, g to st, "IU" to
  g, "IU" to "pinch", blank to blank, "cup" to "dl". Factor 1: st to
  pcs, "IU" to "iu", g to gram, "dl" to "dl".
- catalogue invariants: symbols unique; `category is None` exactly when
  `factor is None`; factors are `Decimal`; `st` is the only unit without
  a category; every alias and symbol parses back to its own unit;
  no spelling claimed by two units (build raises: test the check with
  a small helper that is given a clashing table).
- `offered(category)`: exactly the lists of interpretation 8 as symbols,
  in order; `offered()` is the three lists then `st`.

**Verify:** `python3 -m pytest tests/server/test_units.py -q`, then the
whole suite.

### Task 2: The `preferences` table and `server/preferences.py`

**Files:** `server/models.py` (`Preference`), create
`server/migrations/versions/0009_preferences.py`, create
`server/preferences.py`, create `tests/server/test_preferences_store.py`.

**Build:**

- `models.Preference`: `key: String(PREFERENCE_KEY_LENGTH=50)` primary
  key, `value: String(PREFERENCE_VALUE_LENGTH=100)`. Both lengths named
  beside `UNIT_LENGTH` (a later key such as `last_data_source` holds a
  data source key). Docstring: one row per preference that was ever set.
- Migration `0009`, revision `0009`, down revision `0008`, docstring in
  the style of the others ("The preferences table (slice U1)."), creating
  the table, `downgrade` dropping it.
- `server/preferences.py` (no FastAPI import):
  - `UNIT_KEYS: dict[str, Category]` = `{"unit.mass": "mass",
    "unit.volume": "volume", "unit.energy": "energy"}`;
  - `DEFAULTS = {"unit.mass": "g", "unit.volume": "dl", "unit.energy":
    "kcal"}`; a module-load check (or test) that each default is offered
    in its category;
  - `read(db) -> dict[str, str]`: the defaults, overridden by stored
    rows for known keys (rows for keys it does not know are ignored, as a
    newer version may have written them);
  - `preferred_unit(db, category) -> str`: for U2, D2 and D4;
  - `save(db, changes: dict[str, str]) -> None`: `db.merge` per key then
    one `commit`; it does not validate (the API does).

**Tests (write first), `test_preferences_store.py`, on the `client`
fixture's database via a session on `app.state.engine` or a small
`Session` fixture:** unset reads the defaults; a saved key reads back and
the others keep their defaults; saving twice keeps one row; an unknown
stored key is ignored by `read`; `preferred_unit` for each category; the
defaults are offered units of their categories (this one needs Task 1).
`test_migrations.py` already compares the models to the migrated schema
and covers the table; add no second copy of that.

**Verify:** `python3 -m pytest tests/server -q` (the migration test
included).

### Task 3: The API: `GET /api/units`, `GET/PUT /api/preferences`

**Files:** create `server/api/units.py`, `server/api/preferences.py`;
modify `server/api/__init__.py` (both routers into `protected`, after
`counts`); create `server/export_units.py`; create
`web/src/test-units.json` (generated); modify `web/package.json`
(`gen:api` also runs the units export); regenerate `web/openapi.json`
and `web/src/api/schema.ts`; modify `web/src/api/types.ts`; tests
`tests/server/test_units_api.py`, `tests/server/test_preferences.py`.

**Interfaces produced:**

`GET /api/units`: `UnitCatalogue = {"units": [CatalogueUnit, ...]}`, in
`units.catalogue()` order.

```
CatalogueUnit = {
  symbol: str, name: str,
  category: "mass" | "volume" | "energy" | null,
  factor: str | null,          # of one unit in the category's base unit (g, l, J), exact, plain decimal
  aliases: [str],
  case_sensitive_aliases: [str],
  offered: bool
}
```

`factor` is written with `fields.plain` (so `0.000001`, `4184`,
`0.0295735295625`, never `1E-6`). The schema's description says what the
base units are.

`GET /api/preferences`: `Preferences = {"unit.mass": str, "unit.volume":
str, "unit.energy": str}`, a Pydantic model with aliased fields
(`populate_by_name`, serialised by alias; FastAPI's default).
`PUT /api/preferences`: body `PreferenceChanges`, the same keys, each
optional, `model_config = ConfigDict(extra="forbid")`; answers
`Preferences`. Errors as interpretation 6, as `FieldError`s through
`invalid_fields` (`server/api/errors.py`), `loc: ["body", "unit.mass"]`.
An explicit null is refused with the same `invalid_unit`. Validation
lives in `server/preferences.py` beside the keys (a `refusals(changes)`
function that returns the field errors) so D4 adds its own key in one
place; the route calls it, then `save`.

`server/export_units.py`: like `export_openapi.py`, `python3 -m
server.export_units web/src/test-units.json` writes the `GET /api/units`
body (built from the same function the route uses, with `indent=2,
sort_keys=True` and a trailing newline). `gen:api` in `web/package.json`
runs it after the OpenAPI export.

`web/src/api/types.ts`: `UnitCatalogue`, `CatalogueUnit`, `Preferences`.

**Tests (write first):**

- `test_units_api.py`: needs a session (401 without); the answer equals
  `{"units": [...]}` for `units.catalogue()`; contains `msk` with factor
  `"0.015"`, category volume, aliases including `matsked` and `tbsp`;
  `µg` with factor `"0.000001"`; `kcal` with case-sensitive alias
  `Cal`; `st` with null category and factor and `offered` true; factors
  are plain strings; every spelling in the answer (symbol and aliases)
  parses on the server to its own symbol (the list the app test shares);
  **the committed `web/src/test-units.json` equals the answer** (message:
  "Regenerate with: npm --prefix web run gen:api", as `test_openapi.py`).
- `test_preferences.py`: a fresh database answers the three defaults;
  PUT one key answers all three and a later GET agrees; PUT two keys at
  once; PUT `{}` changes nothing; an alias is saved as the catalogue
  spelling (`"gram"` answers `"g"`, `"matsked"` for volume answers
  `"msk"`); a unit of the wrong category (`"dl"` for mass, `"g"` for
  volume, `"g"` for energy) answers 422 on `unit.mass` etc. with type
  `invalid_unit` and saves nothing, also when another key in the same
  request was valid; `st`, `"cup"`, `"cg"` (understood, not offered),
  `""` and null answer 422 `invalid_unit`; an unknown key answers 422
  on that key with type `extra_forbidden`; a number as value is 422;
  every route needs a session; the answers round-trip through a restart
  of the app on the same database (a second `create_app` on the same
  URL reads the saved value).
- Existing: `test_openapi.py` passes after `npm run gen:api`.

**Verify:** `python3 -m pytest -q`; in `web/`: `npm run gen:api`, then
`git diff --stat` shows `openapi.json`, `schema.ts` and `test-units.json`
changed, `npm run typecheck` and `npm test` (the schema test) pass.

### Task 4: The app's unit and preference modules

**Files:** create `web/src/units.ts`, `web/src/units.test.ts`,
`web/src/preferences.ts`, `web/src/preferences.test.ts`; modify
`web/src/test-data.ts` (a `unitCatalogue()` that returns the committed
fixture, typed `components['schemas']['UnitCatalogue']`, and a
`preferences()` builder with the defaults).

**Interfaces produced:**

`web/src/units.ts`:

```ts
export type Category = 'mass' | 'volume' | 'energy'
export function useUnits(): {
  units: Readonly<Ref<CatalogueUnit[]>>   // [] until loaded
  loading: Readonly<Ref<boolean>>
  failed: Readonly<Ref<boolean>>
  load(): Promise<void>                    // once; a failed load can be retried
  offered(category: Category): CatalogueUnit[]   // in the server's order
  findUnit(text: string): CatalogueUnit | undefined  // interpretation 10
  label(unit: CatalogueUnit): string       // "kg (kilogram)"
}
export function resetUnits(): void         // for tests
```

`findUnit`: normalise as the server does (NFKC, trim, collapse spaces,
drop one trailing period), try each unit's `case_sensitive_aliases`
exactly, then symbols and aliases lower-cased. `load` calls
`GET /api/units` once; later calls return at once; a failure sets
`failed` and the next `load()` tries again.

`web/src/preferences.ts`:

```ts
export function usePreferences(): {
  preferences: Readonly<Ref<Preferences | null>>  // null until loaded
  loading, failed
  load(): Promise<void>
  set(key: keyof Preferences, unit: string): Promise<boolean>  // PUT {key: unit}; true if saved
}
export function resetPreferences(): void
```

`set` sends only the changed key, updates the shared state from the
answer (the whole preferences), and returns false (state unchanged) on a
refusal or a network error. It never throws.

**Tests (write first):**

- `units.test.ts`: `load` fetches once for two calls; a failed load sets
  `failed` and a second `load()` succeeds; `offered('mass')` gives
  `['µg','mg','g','kg','oz','lb']`, volume and energy as in
  interpretation 8, built from the fixture; `findUnit` for every
  spelling in the fixture gives its own unit (the same sweep as the
  server's test); `"gram"`, `"MSK."`, `"US  cup"`, `"matsked"`, the Greek
  mu, `"Cal"` (kcal) against `"cal"` (the small calorie), `"pcs"` (`st`);
  `findUnit('cup')` and `findUnit('')` undefined; `label` gives
  `"kg (kilogram)"` and `"msk (tablespoon)"`.
- `preferences.test.ts`: `load` once; `set('unit.mass','kg')` sends
  exactly `{ 'unit.mass': 'kg' }` and updates the state to the answer
  (which has the alias normalised); a 422 returns false and leaves the
  state; a thrown fetch returns false; two stores in two components see
  one state.
- Both `reset…()` functions are called in `afterEach` of the tests that
  use the modules (the pattern of `PlanPage.test.ts`).

**Verify:** `npm test`, `npm run lint`, `npm run typecheck` in `web/`.

### Task 5: The Settings page and the menu

**Files:** create `web/src/pages/SettingsPage.vue`,
`web/src/pages/SettingsPage.test.ts`; modify `web/src/pages.ts` (a sixth
entry), `web/src/layouts/MainLayout.test.ts`, `web/src/i18n/en.json`.

**Build:**

- `pages.ts`: append `{ path: '/settings', name: 'settings', icon:
  'settings', component: SettingsPage }`; update the comment to six
  pages. The router and the menu already iterate `pages`, so the route
  and the entry follow (last, before Log out's separator). The menu
  needs no change; it shows no count for Settings (interpretation 7).
- `SettingsPage.vue`, in the style of the list pages: `<q-page padding>`,
  `<h1 class="text-h5">` "Settings", then a `q-card` (class
  `preferred-units-card`) titled **Preferred units** with the intro
  sentence (spec text, verbatim): "Used for new ingredients and
  attributes, and for values copied from data sources. Changing it
  converts nothing already saved." Inside, one outlined `q-select` per
  category, labelled "Mass", "Volume", "Energy" (labels from i18n),
  `emit-value`, `map-options`, options `{value: symbol, label:
  label(unit)}` from `offered(category)` in the server's order, value
  from `preferences['unit.mass']` etc. Loading goes through
  `LoadState` with the message "Could not load the settings." (both
  the units and the preferences must have loaded; the Try again button
  retries both). On `update:model-value`: call `set(key, symbol)`; the
  select's own `loading` is on while that call runs; if it returns
  false the page shows `common.saveFailed` ("Could not save. Try
  again.") with `role="alert"` under the card and the select shows the
  stored value again (it is bound to the store's state, so a failed
  `set` needs no extra code beyond not changing it); a later success
  clears the message. Nothing else on the page: S2's Data sources card
  comes in D2.
- `en.json`: `pages.settings` "Settings"; a `settings` block: `loadFailed`,
  `preferredUnits.title` ("Preferred units"), `preferredUnits.intro`
  (the sentence above), `preferredUnits.mass|volume|energy`.

**Tests (write first):**

- `MainLayout.test.ts`: the menu test's title and list change to six
  pages in order, then Log out: `Plan, Recipes, Ingredients,
  Attributes, Tags, Settings, Log out`. The counts test still passes
  unchanged (Settings has no count element).
- `SettingsPage.test.ts` (fake server: `GET /api/session` 204, `GET
  /api/units` the fixture, `GET /api/preferences` the defaults, `PUT
  /api/preferences` echoing a merge): the heading is Settings; the card
  title and the intro text; three selects whose current values show
  `g (gram)`, `dl (decilitre)`, `kcal (kilocalorie)`; opening Mass offers
  exactly the six mass units in order and no volume, energy or `st`;
  choosing `kg` PUTs exactly `{"unit.mass": "kg"}` once and the select
  shows kg; choosing in volume and energy does the same for those keys;
  a refused PUT (422) shows "Could not save. Try again." and the select
  shows the old value; a PUT that never answers (rejects) too; a failed
  load shows "Could not load the settings." and Try again loads;
  `/settings` is reachable from the menu entry. A second mount in the
  same file reads the changed value from the store without a second
  `GET /api/preferences` call.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`; then look
at the page in a browser at 390 px wide (build, start the server as the
e2e does) and check nothing scrolls sideways.

### Task 6: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`.

**Build:** a step early in the one flow, right after logging in and
before the attribute is created: open **Settings** from the menu;
the Preferred units card shows `g (gram)`, `dl (decilitre)` and `kcal
(kilocalorie)`; choose `kg (kilogram)` for Mass; reload; it still
shows kg (saved, not just shown); choose `g (gram)` again. The flow
ends with the preference as it started, because U2 makes a new
ingredient start in the preferred mass unit and this flow's Oats
assertion expects g. Update the file's header comment line ("log in,
set a preferred unit, build ...").

**Verify (the e2e recipe in the common context):** `cd web && npx vite
build`; start uvicorn on an empty SQLite file in the scratchpad with
`PASSWORD_HASH` and `SESSION_KEY`; `E2E_PASSWORD=... E2E_BASE_URL=
http://localhost:8000 npm run e2e -- --trace off`; kill the server.

### Task 7: Docs

**Files:** `README.md`, the master plan, the units spec, the import spec,
this plan.

- `README.md`: add to the status paragraph that the app has a Settings
  page with preferred units for mass, volume and energy, and a unit
  catalogue on the server (`server/units.py`) that later slices build
  on. Mention `gen:api` now also writes `web/src/test-units.json`.
- Master plan: its status stays "Proposed" for the other slices, but add
  a line under "Overview" or the U1 section: "U1 done: see
  `2026-11-08-slice-u1-unit-catalogue.md`", and mark U1 in the overview
  table (a "Done" column is not used elsewhere; add the sentence under
  the table instead of a column). The "Overlaps settled here" points 2
  and 3 stay.
- Units spec: in "The listed units" table, show `tsk`/`msk` as the
  catalogue spellings with `tsp`/`tbsp` and the English names as
  aliases (interpretation 1), and add the `Cal`/`cal` rule, the
  trailing period and space rules and that known free-text units exist
  (`st`, with its aliases), under "Reading a unit". Add the display
  names and offered order (interpretations 2 and 8) under "Display
  names", and the preference API (interpretation 6) under "Preferred
  units". Keep the decisions as they are.
- Import spec: in the line on normalisation ("matsked", "msk." → `msk`),
  point to the catalogue (`server/units.py`) as the one place, as
  overlap 2 of the master plan already says. Only if the text still
  describes its own table.
- This plan: set Status to "Built", and add under each task how it was
  checked and the differences from this text, as the earlier slice plans
  do.

**Verify:** the full checks (both test suites, lint, typecheck) once more
and the e2e run of Task 6 if nothing in Tasks 1-6 changed since.

## Done when

`server/units.py` parses every unit and alias of the units spec (and `st`
and its aliases) into a category and an exact factor, tells free text from
known units, and gives factors between units; `GET /api/units` sends it;
`GET/PUT /api/preferences` read and save the three preferred units with
the refusals above; the app has a Settings page, the menu's sixth and
last entry, whose Preferred units card saves on change; the migration
test, both test suites, lint, typecheck and the end-to-end flow pass.
