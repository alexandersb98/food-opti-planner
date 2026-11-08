# Slice U2 — Unit Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** The unit field of an ingredient (C4, "Measured in") and of an
attribute (C5, "Unit") becomes a combo box: the catalogue's units grouped
by category, the preferred unit of each category first, and any text can
still be typed. A unit chosen from the list is stored in its catalogue
spelling; typed text is stored as typed. A new ingredient starts in the
preferred mass unit, and its value-basis default comes from the
catalogue (100 for a mass or volume unit, 1 otherwise). The server
refuses an energy unit on an ingredient (422 `unit_not_for_ingredient`).
The attribute form gets the help text under its unit field. Nothing
converts yet (U3).

**Architecture:** One shared component, `web/src/components/UnitField.vue`,
a `q-select` in combo-box mode fed by `useUnits()` (the catalogue, U1)
and `usePreferences()` (the preferred units, U1). It takes the categories
to offer; C4 passes mass and volume plus the piece unit `st`, C5 passes
mass, volume and energy. A small helper `basisFor(unit)` in
`web/src/units.ts` replaces C4's hard-coded `UNITS` buttons and
`defaultBasis`. On the server the refusal is one check in
`server/api/ingredients.py` that uses `units.parse` from U1; the
catalogue stays the only place unit rules live.

**Tech Stack:** as the earlier slices: FastAPI, SQLAlchemy; Vue 3,
Quasar, vue-i18n, Vitest, Playwright.

**Specs:** the units spec
[`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
("Unit fields", "Errors", "Testing"); slice U2 in
[`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
screens C4 and C5 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
U1's interfaces: [`2026-11-08-slice-u1-unit-catalogue.md`](2026-11-08-slice-u1-unit-catalogue.md).

**Status:** Planned; to be built task by task on branch
`claude/implement-remaining-slices-qwrp83`.

## Global Constraints

- `meal_planner/` is not changed.
- No migration and no schema change: stored units stay as they are
  ("existing units parse as they are", units spec). The migration test
  stays green untouched.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API change (Task 1): `npm run gen:api` in `web/` (regenerates
  `web/openapi.json`, `web/src/api/schema.ts` and `web/src/test-units.json`;
  the last should come out unchanged).
- The Playwright flow gets a step (Task 5).
- No test calls the internet or an AI service.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.

## Interpretations made in this plan

1. **The server stores the unit as sent (trimmed), as today.** The units
   spec: "A known unit chosen from the list is stored in its catalogue
   spelling; typed text is stored as typed (and is still understood when
   it parses, e.g. "gram")." The catalogue spelling comes from the combo
   box, which sends the symbol of a chosen option. The server does not
   rewrite "gram" to `g`; U3 and later slices read units through
   `units.parse`, which understands any spelling.
2. **The energy refusal applies to every save of an ingredient** (create
   and update), also when an old ingredient already holds an energy
   unit and the save leaves it unchanged. Such an ingredient cannot be
   saved until its unit is changed. Rationale: the rule is "an
   ingredient is not measured in energy"; the spec makes no exception,
   and an energy unit on an ingredient was never meaningful. Which units
   are energy is decided by `units.parse(unit).category == "energy"`, so
   "Kcal", "Cal", "kJ", "mcal" all count. No data migration.
3. **Only energy is refused.** Free text (`pinch`), `st` and its
   aliases, an understood-but-not-offered unit such as `cg` or `kl`,
   and unknown spellings all stay allowed on an ingredient, as the spec
   says free text is allowed. The refusal's message is the spec's:
   "An ingredient is measured in an amount of food, such as g, dl or
   pieces." (the server's `msg`; the app shows its own i18n copy of the
   same sentence on the field). The check sits with the other 422 checks
   of `_fill`, so one 422 can name the unit and a bad tag id together.
4. **Attributes accept every unit, as today.** The spec lists no refusal
   for an attribute; free text and every category are fine. U2 changes
   only the field and the help text on C5, no server change for
   attributes.
5. **Groups and order of the list.** Groups in this order, each with a
   header: Mass, Volume, Energy (attribute only), then "Other" holding
   the piece unit `st` (ingredient only). Within a category the
   catalogue's offered order (U1 interpretation 8), except that the
   preferred unit of that category (from `usePreferences()`) comes
   first. Entries read `kg (kilogram)` (`useUnits().label`), while the
   field itself shows only the symbol (`kg`), so the input reads as the
   stored text. Group headers are not selectable. The piece unit's
   display is `st (piece)`, as the catalogue names it.
6. **Combo-box behaviour.** The field's model is the text. Choosing an
   option sets it to the option's symbol. Typing sets it to the typed
   text on every keystroke (so a plain Save sees what is in the box,
   with no Enter needed) and filters the list: an entry stays if the
   typed text, case-insensitively, is part of its symbol, name or an
   alias ("tbs" keeps `msk (tablespoon)`; "gra" keeps `g (gram)`). When
   nothing matches the list is simply empty, and the typed text is still
   kept. An empty box shows the whole list. Clearing the box leaves the
   unit empty, which each form already rejects (C4 "Enter a unit.") or
   allows (C5, whose unit may be empty).
7. **The unit buttons on C4 go.** C4's `g` / `ml` / `pcs` quick buttons
   (`.unit-choice`) are replaced by the combo box: `pcs` becomes `st`
   in the list (an ingredient already measured in `pcs` keeps showing
   `pcs`, as typed text). The existing test for the buttons is rewritten
   to choose from the list.
8. **The basis default uses the catalogue.** `basisFor(text)`: `'100'`
   when `findUnit(text)` is a mass or volume unit (any spelling and any
   prefix: kg, dl, oz, "gram"), `'1'` for everything else (`st`, free
   text, an energy unit, an empty text, or while the catalogue has not
   loaded). C4's existing "basis follows the unit unless changed by
   hand" rule stays, now comparing against `basisFor`. This changes one
   existing test: `tbsp` is a volume unit, so its basis is now 100, not
   1.
9. **A new ingredient starts in the preferred mass unit.** The page loads
   the preferences before showing the form and starts the draft in
   `unit.mass` with basis `basisFor` of it (100). If the preferences or
   the catalogue could not load, the page still works: the unit starts
   as `g`, the list is empty (free text only), and the basis defaults
   as `basisFor` can (`g` is not known without the catalogue, so a
   fallback `'100'` is used for the `g` start). Rationale: a failed
   catalogue should not block editing an ingredient, which worked
   before. The unit field's own load retries on the next page visit.
   Editing an existing ingredient keeps its stored unit and basis.
10. **Loading the catalogue and preferences is the field's job, not
    each page's.** `UnitField` calls `useUnits().load()` and
    `usePreferences().load()` on mount (both are once-only, shared and
    retryable, from U1) and ignores failures. C4's page additionally
    awaits `usePreferences().load()` (swallowing a failure) inside its
    own load, because the new ingredient's start unit is decided before
    the form shows (interpretation 9).
11. **Shared fake-server answers for tests.** Page tests that mount C4
    or C5 now trigger `GET /api/units` and `GET /api/preferences`. A
    small helper `unitRoutes()` in `web/src/test-app.ts` returns the two
    routes (the committed fixture and the default preferences) to spread
    into a test's fake server, instead of each file repeating them. A
    test that omits it gets 404s, which the tolerant field accepts, so
    existing tests that do not care keep passing, except where they
    assert the new behaviour.

## Tasks

### Task 1: Server: refuse an energy unit on an ingredient

**Files:** modify `server/api/ingredients.py`, `server/api/catalog.py`;
tests in `tests/server/test_ingredients.py`; regenerate
`web/openapi.json`, `web/src/api/schema.ts`.

**Build:**

- `server/api/catalog.py`: make `References._error` public as
  `References.error(loc, error_type, msg)` (rename; update its three
  callers in this file). Behaviour is unchanged. It lets `_fill` add a
  field error that is not an id check, so one 422 names every problem.
- `server/api/ingredients.py`: import `units`; in `_fill`, before
  `refs.check()`, add

  ```python
  parsed = units.parse(body.unit)
  if parsed is not None and parsed.category == "energy":
      refs.error(["unit"], "unit_not_for_ingredient", UNIT_NOT_FOR_INGREDIENT)
  ```

  with `UNIT_NOT_FOR_INGREDIENT = "An ingredient is measured in an
  amount of food, such as g, dl or pieces."`. Both `POST` and `PUT`
  already go through `_fill`. The answer is the usual 422 body: `{"detail":
  [{"loc": ["body", "unit"], "type": "unit_not_for_ingredient", "msg":
  ...}]}`.
- Both routes' `responses` gain `422: {"description": "An energy unit, or
  an unknown attribute or tag"}` (a description only, as the preferences
  route does), so the OpenAPI file documents it.

**Tests (write first), added to `tests/server/test_ingredients.py`:**

- `test_an_energy_unit_on_an_ingredient_answers_422_on_unit`: parametrised
  over `kcal`, `kJ`, `Kcal`, `Cal`, `cal`, `mcal`: POST answers 422 with
  exactly the one error above (type, `loc`, the spec's message), and
  nothing is created (`GET /api/ingredients` is `[]`).
- `test_an_update_to_an_energy_unit_answers_422_and_changes_nothing`:
  create Oats in `g`, PUT with `kcal`: 422; the stored ingredient is
  unchanged.
- `test_units_other_than_energy_are_accepted_on_an_ingredient`:
  parametrised over `g`, `kg`, `µg`, `dl`, `msk`, `US cup`, `st`, `pcs`,
  `gram`, `pinch`, `cg`, `piece`, `cup`: created, and read back as sent
  (trimmed), so the server does not rewrite the spelling
  (interpretation 1).
- `test_the_unit_refusal_comes_with_other_field_errors`: an energy unit
  and an unknown tag id in one request give two errors in one 422
  (`["body","unit"]` and `["body","tag_ids",0]`).
- `test_attributes_still_accept_every_unit`: the attribute API accepts
  `kcal`, `g`, `dl`, `IU` (add to `tests/server/test_attributes.py`; it
  documents interpretation 4).

**Verify:** `python3 -m pytest tests/server/test_ingredients.py
tests/server/test_attributes.py -q`, then `python3 -m pytest -q` (the
OpenAPI test fails until `npm run gen:api` is run: run it in `web/`,
then `git diff --stat` shows `openapi.json` and `schema.ts` changed,
`test-units.json` not).

### Task 2: `basisFor` and the `UnitField` component

**Files:** modify `web/src/units.ts`, `web/src/units.test.ts`,
`web/src/test-app.ts`, `web/src/i18n/en.json`; create
`web/src/components/UnitField.vue`,
`web/src/components/UnitField.test.ts`.

**Interfaces produced:**

`web/src/units.ts` gains, in `useUnits()`:

```ts
/** The value basis a unit starts with: '100' for a mass or volume unit
 * in any spelling, '1' for anything else. */
basisFor(text: string): '100' | '1'
```

(`findUnit(text)?.category` is `'mass'` or `'volume'` gives `'100'`.)

`UnitField.vue`:

```ts
// props
modelValue: string                       // the unit text
label: string
categories: readonly (Category | 'piece')[]  // groups to offer, in this order
dense?: boolean
error?: boolean; errorMessage?: string; hideBottomSpace?: boolean
// emits
'update:modelValue': [text: string]
```

`'piece'` is the group "Other" with the known free-text units (the
catalogue entries with category null and `offered`: today only `st`).
The component loads the units and preferences on mount (interpretation
10), builds the groups as in interpretation 5 and filters as in
interpretation 6. It is a `q-select` with `use-input`, `hide-selected`,
`fill-input`, `input-debounce="0"`, options as a flat list of
`{ kind: 'header' | 'unit', ... }` rendered through the `#option` slot
(a `q-item-label header` for a header, which is not selectable; a `q-item`
with `symbol` and the name for a unit), `:model-value="modelValue"`,
`@filter` for the typed text, `@input-value` to emit the typed text and
`@update:model-value` to emit a chosen symbol. It passes `label`,
`outlined`, `dense`, `error`, `error-message` and `hide-bottom-space`
through, and the `<input>` carries `aria-label` = the label, so
`field(wrapper, 'Measured in')` finds it as it finds other inputs.
**Pitfall to check in the test:** Quasar fires `input-value` with the
chosen option's text or an empty string when the menu closes; the
component must emit only a text that differs from `modelValue`, and
never emit `''` as a side effect of choosing or blurring.
`en.json`: `units.groups.mass` "Mass", `units.groups.volume` "Volume",
`units.groups.energy` "Energy", `units.groups.piece` "Other".

`web/src/test-app.ts`: `unitRoutes(preferences?)`, returning
`{ 'GET /api/units': { body: unitCatalogue() }, 'GET /api/preferences':
{ body: preferences ?? defaultPreferences() } }` for spreading into a
`fakeServer` (interpretation 11). Use `test-data.ts`'s existing
`unitCatalogue()` and `preferences()` builders.

**Tests (write first):**

- `units.test.ts`: `basisFor` gives `'100'` for `g`, `kg`, `µg`, `dl`,
  `msk`, `US cup`, `oz`, `gram`, `MSK.`; `'1'` for `st`, `pcs`, `kcal`,
  `kJ`, `pinch`, `cup`, `''`, and `'1'` for everything while the
  catalogue is empty.
- `UnitField.test.ts` (mount the component with Quasar and i18n, as
  `RecipesCard.test.ts` does, fake server `unitRoutes()`):
  - opening the list with categories `['mass', 'volume', 'piece']`
    shows headers Mass, Volume, Other in that order, the mass entries
    `g (gram)`, `µg (microgram)`, ... with `g (gram)` first (the
    preferred) then the rest in catalogue order, the volume entries with
    `dl (decilitre)` first, and `st (piece)` under Other; no Energy
    header and no `kcal`;
  - with categories `['mass', 'volume', 'energy']` the Energy group is
    there, `kcal (kilocalorie)` first, and there is no Other group;
  - a changed preference reorders: preferences `unit.mass: 'kg'` put
    `kg (kilogram)` first and `g (gram)` back in catalogue order;
  - choosing `kg (kilogram)` emits `update:modelValue` with exactly `kg`
    (the symbol, not the label), once, and the box shows `kg`;
  - typing `gram` emits `gram` as typed (not `g`), with no Enter; typing
    `tbs` leaves only `msk (tablespoon)`; typing `zzz` leaves an empty
    list and still emits `zzz`; clearing the box emits `''`;
  - headers cannot be chosen (clicking one emits nothing);
  - an existing value that is not in the list (`pcs`, `pinch`) is shown
    as it is;
  - with the units request failing (404) the field still takes typed text
    and shows an empty list.
  - the label is the input's `aria-label`; `error` and `error-message`
    show.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` in `web/`.
Then open it once in a browser at 390 px wide (the build and server as
for the e2e) when Task 3 has put it on a page; record in Task 3's
"Checked".

### Task 3: C4, the ingredient form

**Files:** modify `web/src/pages/IngredientPage.vue`,
`web/src/pages/IngredientPage.test.ts`, `web/src/i18n/en.json`.

**Build:**

- Remove `UNITS`, `defaultBasis`, the `.unit-choice` buttons and the
  plain `q-input` for the unit. Use `<UnitField :model-value="draft.unit"
  :categories="['mass', 'volume', 'piece']" :label="$t('ingredients.measuredIn')"
  :error="!!errors.unit" :error-message="errors.unit" hide-bottom-space
  outlined @update:model-value="setUnit" />`.
- `setUnit(unit)`: as before but `basisFor` from `useUnits()` in place of
  `defaultBasis`: if the typed basis equals `basisFor(draft.unit)`, it
  becomes `basisFor(unit)`.
- The load function also awaits `usePreferences().load()` (failure
  swallowed). For a new ingredient the draft starts with `unit` = the
  preferred mass unit, or `'g'` when preferences did not load, and
  `basis` = `'100'` (interpretation 9: `g`, `kg`, `oz`, ... are mass, so
  `basisFor` gives 100; the fallback is `'100'` for `g`). Editing keeps
  the stored values.
- `showServerErrors`: a `unit` error of type `unit_not_for_ingredient`
  shows `ingredients.unitNotForIngredient` on the unit field and counts as
  shown.
- `en.json`, `ingredients.unitNotForIngredient`: "An ingredient is
  measured in an amount of food, such as g, dl or pieces."

**Tests (write first), in `IngredientPage.test.ts`, with `...unitRoutes()`
in each mounted server:**

- Rewrite "a new ingredient starts in grams per 100, and the basis
  follows the unit": the box starts at `g`, basis `100`; typing `st`
  gives basis `1`, typing `ml` back gives `100`, typing `msk` gives
  `100` (changed from `1`: `msk` is a volume unit); choosing `st (piece)`
  from the list, then Save, sends `unit: 'st'`, `basis: '1'`.
- New: with preferences `unit.mass: 'kg'`, a new ingredient starts in
  `kg` with basis `100`.
- New: with the preferences request failing, a new ingredient starts in
  `g` with basis `100` and the page still works and saves.
- New: choosing `kg (kilogram)` for an existing ingredient sends the
  symbol `kg`; typing `gram` sends `gram` unchanged (interpretation 1).
- New: the list has no `kcal` and offers `st (piece)` (asserted once
  here to show the page passes the right categories).
- New: a 422 `unit_not_for_ingredient` on `unit` (typing `kcal` and
  Save) shows "An ingredient is measured in an amount of food, such as g,
  dl or pieces." under the field and the page stays.
- New: a basis typed by hand stays when the unit changes (the existing
  test, with the box instead of the button).
- "An existing basis is kept when the ingredient is opened": unchanged
  with unit `pcs` (shown as typed).
- The "wrong fields are marked" test still passes: clearing the unit
  gives "Enter a unit.".

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`; open the
form at 390 px in a browser (build `npx vite build`, server as for the
e2e): the list opens inside the viewport, nothing scrolls sideways.

### Task 4: C5, the attribute form

**Files:** modify `web/src/pages/AttributesPage.vue`,
`web/src/pages/AttributesPage.test.ts`, `web/src/i18n/en.json`.

**Build:**

- Replace the unit `q-input` (`col-3`) with `UnitField` with categories
  `['mass', 'volume', 'energy']`, `dense`, label `$t('attributes.unit')`,
  `class="col-3"`, bound to `draft.unit`. The row's `q-col-gutter-sm`
  layout stays; the field must not widen the row at 390 px (check in a
  browser; if the select's width needs it, make the unit and decimals
  fields `col-6` each on a second line below `sm`).
- The existing "Decimals: how precisely ..." hint stays. Under the unit
  field, in the same caption style, add the help text
  `attributes.unitHint`: "The amount per the ingredient's basis, e.g. g
  or kcal." (shown in the open form only, above the decimals hint).
- A new attribute still starts with an empty unit (spec: "starts empty").
- `decimalsExample` already trims `draft.unit`; unchanged.
- `en.json`: `attributes.unitHint`.

**Tests (write first), in `AttributesPage.test.ts`, with `...unitRoutes()`:**

- The open row shows the unit box with the stored value (`g`), the help
  text, and a list with Mass, Volume and Energy groups (no Other group,
  no `st`), `kcal (kilocalorie)` first under Energy.
- Choosing `kJ (kilojoule)` for Energy and Done sends `unit: 'kJ'`
  (update the existing `'kJ'` typed test to keep one typed case: typing
  `IU` sends `IU`).
- Typing `gram` sends `gram` as typed.
- A new attribute opens with an empty unit box and saves with an empty
  unit.
- The existing tests that `setValue` on `field(wrapper, 'Unit')` keep
  passing unchanged, which shows typing works as before.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`; the row in
a browser at 390 px.

### Task 5: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`.

**Build:** in the existing flow:

- Attribute step: instead of `fill('kcal')` on the Unit field, open the
  Unit list (`getByLabel('Unit').click()`), expect the Mass, Volume and
  Energy headers and no `st (piece)`, and choose the option `kcal
  (kilocalorie)`; the row still reads `Energy (kcal)` (the stored
  spelling). The help text "The amount per the ingredient's basis, e.g.
  g or kcal." is visible.
- Ingredient step: after `fill('Oats')`, expect the **Measured in** field
  to have value `g` and **Value basis** `100` (the preferred mass
  default, from U1's Settings); open the list, expect `st (piece)` and no
  `kcal (kilocalorie)` option, and close it with Escape.
- A preferred-unit round trip for a new ingredient: the Settings step of
  U1 ends with the preference as it started, so this flow's Oats stays in
  `g`. Do not change that step; the "starts in the preferred unit" case
  is covered by the Vitest test of Task 3 (changing a preference in this
  flow would need a second ingredient and it adds nothing the unit test
  does not show).
- Update the file's header comment to mention the unit lists.

**Verify (the e2e recipe in the common context):** `cd web && npx vite
build`; start uvicorn on an empty SQLite file in the scratchpad with
`PASSWORD_HASH` and `SESSION_KEY`; `E2E_PASSWORD=...
E2E_BASE_URL=http://localhost:8000 npm run e2e -- --trace off`; kill the
server. If a test-id or role needs the `q-select` option list to be
reached differently from Quasar's rendered menu (`role="option"`), use
`getByRole('option', { name: ... })` as the Settings step does.

### Task 6: Docs

**Files:** `README.md`, the master plan, the units spec, the wireframes
spec, this plan.

- `README.md`: in the status paragraph, say that the unit fields of
  ingredients and attributes are combo boxes over the unit catalogue
  (grouped, preferred first, free text allowed) and that a new
  ingredient starts in the preferred mass unit. Keep the Settings text.
- Master plan: after the line "U1 done: ...", add "U2 done: see
  `2026-11-08-slice-u2-unit-fields.md`." The slice's own section stays
  as written.
- Units spec: under "Unit fields", add that the group "Other" holds the
  piece unit `st`, that the box shows the symbol while the list shows `kg
  (kilogram)`, and that the energy refusal applies to every save of an
  ingredient (interpretations 2 and 5). The decisions stay.
- Wireframes spec: C4's "Measured in (g, ml, pcs, ...)" becomes "a combo
  box of units grouped by category, preferred first, free text allowed";
  the basis default "100 for g and ml, 1 for pcs" becomes "100 for a
  mass or volume unit, 1 otherwise"; C5's description of **Unit** gets
  the same combo box and the help text.
- This plan: set Status to "Built" and add under each task how it was
  checked and any differences from the text, as the earlier slice plans
  do.

**Verify:** the full checks (both test suites, lint, typecheck) once
more, and the e2e run of Task 5 if nothing in Tasks 1-5 changed since.

## Done when

An ingredient's and an attribute's unit field is a combo box with the
catalogue's units grouped by category, the preferred unit first, free
text allowed, and a chosen unit stored in its catalogue spelling; a new
ingredient starts in the preferred mass unit with the basis default from
the catalogue; the server answers 422 `unit_not_for_ingredient` for an
energy unit on an ingredient; the attribute form shows its help text;
both test suites, lint, typecheck, the migration test (untouched) and the
end-to-end flow pass.
