# Slice U1 — Unit Catalogue and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** The server knows units: a catalogue that reads "msk", "Kcal"
or "gram" as known units of a category with an exact factor, sent to
the app by `GET /api/units`. A new Settings page (S1), last in the
menu, lets the user choose a preferred unit for mass, volume and energy.

**Architecture:** `server/units.py` is a pure module (no database): a
table of units built once at import from the base units, prefixes and
listed units, and `parse` / `factor` / `display_units` over it.
`server/api/units.py` serves the catalogue; `server/api/preferences.py`
reads and writes a new `preferences` table (key, value). In the app, a
`SettingsPage.vue` with one card, **Preferred units**, loads both and
saves each drop-down on change.

**Tech Stack:** as GUI slice 11 (FastAPI, SQLAlchemy, Alembic, Vue 3,
Quasar, vue-i18n, openapi-fetch, Vitest, Playwright).

**Specs:** the units spec,
[`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
(sections "The catalogue" and "Preferred units"); slice U1 and
"Overlaps settled here" point 3 (known free-text units such as `st`) in
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md).

**Status:** Built and committed task by task on branch
`claude/blissful-cannon-8xqg3l`. Each task names its files and how it
was checked; the code is in the commits. Each task was reviewed by a
subagent, and the findings fixed.

## Global Constraints

- `meal_planner/` is not changed.
- One Alembic migration (`0009_preferences`); the migration test stays
  green.
- Server tests use SQLite, or Postgres when `TEST_DATABASE_URL` is set.
- All GUI text goes through vue-i18n, English file only.
- `web/openapi.json` and `web/src/api/schema.ts` are regenerated
  (`npm run gen:api` in `web/`) whenever the API changes.
- Checks before each commit: `python -m pytest` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **"Cal" is kcal, "cal" is cal.** The spec compares case-insensitively
   but lists "Cal" as an alias of kcal, while "cal" is the prefixable
   small calorie. Reading tries an exact match first, then a
   case-insensitive one. So "Cal" is kcal, and "cal" and "CAL" are cal.
   No other spelling is affected: no two other catalogue spellings
   differ by case only.
2. **Spellings.** Leading and trailing spaces are dropped and inner runs
   of spaces become one ("US  cup" is "US cup"). The Greek mu (μ) reads
   as the micro sign (µ), which the catalogue uses. "u" stands for µ on
   every base ("ul", "uJ"), not only "ug", as both are common ASCII
   stand-ins; "mcg" stays mass only.
3. **Catalogue spelling.** Each unit has one symbol: the base and
   prefixed units as written in the spec (µg, kcal, dl), the listed ones
   by their table name (tbsp, not msk; US cup). `parse` answers the
   symbol, so "matsked" reads as tbsp.
4. **Swedish recipe spellings come now.** The slices plan adds
   "matsked" and "msk." (tbsp) and "tesked" and "tsk." (tsp) for recipes
   (its overlap point 2). They are added here with the other aliases, as
   the catalogue is built here; nothing uses them before R3.
5. **Known free-text units.** `st` with its aliases (st., stycken,
   styck, pcs, piece, pieces) parses to a unit with no category and no
   factor. `factor` answers 1 between two spellings of the same known
   unit (st and pieces; g and gram), and None for anything that is not
   a known unit, even the same text twice: what to do with an unchanged
   free-text unit is U3's call.
6. **Display order.** Within a category, display units go from small
   to large: mass µg, mg, g, oz, lb, kg; volume ml, krm, tsp, cl,
   tbsp, fl oz, dl, US cup, metric cup, l; energy kJ, kcal. Then the
   free-text `st`. `GET /api/units` answers them in that order, each
   with its category (null for `st`) and its aliases, so the U2 combo
   box can find "msk" typed in. Factors are not sent: the app does not
   convert (spec decision 9, the server owns the catalogue).
7. **Preferences API.** `GET /api/preferences` answers every key with
   its value or its default: `{"unit.mass": "g", "unit.volume": "dl",
   "unit.energy": "kcal"}`. `PUT /api/preferences` takes the keys to
   change (any subset) and answers all of them. A value must be a
   display unit of the key's category, in any spelling the catalogue
   reads ("gram" is stored as g); anything else is refused with 422
   `unit_not_offered` on that key, and an unknown key with Pydantic's
   422 `extra_forbidden`. Nothing is stored for a key never set, so a
   changed default would reach it.
8. **The catalogue store waits for U2.** The slices plan has the app
   keep the catalogue in a store. In U1 only the Settings page uses it,
   so the page loads it with the preferences; U2, with three users
   (C4, C5, Settings), moves it into a shared store.
9. **Saving on change.** Each drop-down saves its own key at once.
   While it saves, that drop-down is disabled. If the save fails, the
   drop-down goes back to the saved unit and the card says "Could not
   save. Try again." The page has no Save button.
10. **The menu.** Settings is the sixth entry, after Tags, icon
    `settings`, path `/settings`; it has no count.

## Tasks

### Task 1: The unit catalogue

**Files:** `server/units.py`, `tests/server/test_units.py`.

**Interfaces produced:**
- `Category = Literal["mass", "volume", "energy"]`, `CATEGORIES` in
  that order.
- `Unit` (frozen dataclass): `symbol: str`, `category: Category | None`,
  `factor: Decimal | None` (to the category's base; None for free text),
  `aliases: tuple[str, ...]`.
- `parse(text: str) -> Unit | None`; `factor(a: str, b: str) -> Decimal
  | None` (multiplier from a to b); `display_units() -> list[Unit]`
  (interpretation 6); `display_units(category)` for one category.

**Tests:** every prefix on g, l, J and cal; each listed unit, alias and
Swedish spelling; case and spaces; Cal vs cal; µ, μ and u; free text
(and "cup") is None; `st` and its aliases; factors both ways, exact
(oz to g, kcal to kJ, tbsp to dl), none across categories or with free
text; display order and that each display unit parses to itself.

### Task 2: Units endpoint, preferences table and API

**Files:** `server/models.py` (`Preference`),
`server/migrations/versions/0009_preferences.py`,
`server/api/units.py`, `server/api/preferences.py`,
`server/api/__init__.py`, `web/openapi.json`, `web/src/api/schema.ts`,
`web/src/api/types.ts`, `tests/server/test_units_api.py`,
`tests/server/test_preferences.py`.

**Interfaces produced:**
- `GET /api/units -> list[UnitInfo]`, `UnitInfo = {symbol, category,
  aliases}`.
- `GET /api/preferences -> Preferences`, `PUT /api/preferences`
  (`PreferencesUpdate`, all keys optional) `-> Preferences`; keys
  `unit.mass`, `unit.volume`, `unit.energy`.
- `preferences` table: `key` String(50) primary key, `value`
  String(100).

**Tests:** the units endpoint's order and fields; needs a session.
Preferences: defaults; a PUT of one key changes only it and is read
back; a spelling is stored as the catalogue symbol; a unit of another
category, a free-text unit, a not-offered unit (cg) and an unknown key
are refused; a second PUT updates the row.

### Task 3: The Settings page

**Files:** `web/src/pages/SettingsPage.vue`,
`web/src/pages/SettingsPage.test.ts`, `web/src/pages.ts`,
`web/src/i18n/en.json`, `web/src/layouts/MainLayout.test.ts`,
`web/src/test-data.ts` (if fixtures help), `web/e2e/catalog.e2e.ts`.

**Tests:** the menu lists six pages, Settings last. The card shows the
three drop-downs with the saved units and the help text; each offers
its category's units in catalogue order; a change sends only that key
and keeps the answer; a failed save goes back and says so; a failed
load offers Try again. Playwright: open Settings and change the
preferred volume unit; it is still chosen after a reload.
