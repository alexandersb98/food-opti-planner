# Slice U3 — Changing a Unit Converts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Changing the unit of a saved attribute (C5) or ingredient (C4)
within its category converts every number stored in that unit, in the
same transaction as the save, after a confirmation dialog that lists what
changes. A change to another category, or to or from free text, converts
nothing and says so. A unit written in another spelling of the same unit
(`g` to `gram`) saves with no dialog. Two new endpoints preview a change
(`POST /api/attributes/{id}/unit-change`,
`POST /api/ingredients/{id}/unit-change`); `PUT` converts with the same
refusals, so a client that skipped the preview cannot lose precision.

**Architecture:** One server module, `server/unit_change.py`, holds the
whole rule: the exact arithmetic, the refusals, and a list of
**converters** per entity. A converter is a named source of stored numbers
(`Converter(key, numbers)`); `plan()` asks each converter for its numbers,
multiplies them all by one exact ratio (a `Fraction` from the catalogue),
and answers a `Change` (kind, factor, counts by converter key, number
rounded, refusal) that either `apply()` writes or a preview reports. The
two routes only build the converters of their entity and call `plan()`.
Slices D4 (copied source values) and R3 (recipe line units, ingredient
conversions) each add one converter to a list and one i18n line; they do
not touch the arithmetic, the endpoints or the dialogs. The app mirrors
this: one `useUnitChange` composable and one `UnitChangeDialog` component
shared by C4 and C5, which render whatever count keys the server sends.

**Tech Stack:** FastAPI, SQLAlchemy, `Fraction`/`Decimal`; Vue 3, Quasar,
vue-i18n, Vitest, Playwright.

**Specs:** the units spec
[`2026-11-03-units-design.md`](../specs/2026-11-03-units-design.md)
("Changing a unit", "Errors", "Testing"); slice U3 and "Overlaps settled
here" in [`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md);
screens C4 and C5 in
[`2026-10-21-gui-wireframes-design.md`](../specs/2026-10-21-gui-wireframes-design.md).
Interfaces of earlier slices:
[`2026-11-08-slice-u1-unit-catalogue.md`](2026-11-08-slice-u1-unit-catalogue.md),
[`2026-11-08-slice-u2-unit-fields.md`](2026-11-08-slice-u2-unit-fields.md).

**Status:** Built, and reviewed task by task, on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed.
- No migration and no schema change: only existing columns are rewritten.
  The migration test stays green untouched.
- All GUI text goes through vue-i18n, English file only
  (`web/src/i18n/en.json`).
- After the API change (Task 2): `npm run gen:api` in `web/` (regenerates
  `web/openapi.json`, `web/src/api/schema.ts`; `web/src/test-units.json`
  should come out unchanged).
- The Playwright flow gets a step (Task 6).
- No test calls the internet or an AI service.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run
  lint`, `npm run typecheck`, `npm test` in `web/`.
- **U2 may still change.** U2 is under review and a fix round may touch
  `UnitField.vue`, `IngredientPage.vue`, `AttributesPage.vue` and their
  tests. Tasks 4 and 5 name functions and test cases, never line numbers;
  re-read each file as it is when the task starts.

## Interpretations made in this plan

1. **The arithmetic is exact, in `Fraction`.** The catalogue's unit
   factors are exact `Decimal`s, so the ratio between two units is an
   exact `Fraction`. `units.py` gains `ratio(a, b) -> Fraction | None`
   (the same rule as `factor()`: same unit gives 1, no category or other
   categories give None, same free-text spelling gives 1);
   `factor()` stays as it is for the code that already uses it. A stored
   number times the ratio is exact; "rounded" means the exact result had
   more than 6 decimals, never a 40-digit artefact. A ratio that does not
   terminate (tsk to US cup) is exact too; it rounds ingredient numbers
   to 6 decimals and refuses goal bounds (no number of decimals fits).
2. **Kinds.** `same`: the two texts name the same unit (ratio 1, which
   includes identical text, other spellings, and one free-text unit in
   another case) or are textually equal after the catalogue's cleaning.
   `convert`: a ratio other than 1. `no_convert`: no ratio (other
   category, or to or from free text, or two different free-text units).
   Counts are filled in for every kind, as the no-convert dialog says
   "keep their numbers" with the counts.
3. **The preview takes what the form also sends.** The spec says the
   preview takes `{unit}`. The attribute preview also takes an optional
   `decimals` (default the stored one) and the ingredient preview an
   optional `basis` (default the stored one), because `PUT` uses the
   body's: the goal-bound refusal says "Raise Iron's decimals first", so
   the form raises them in the same edit and asks again, and "the preview
   matches `PUT`" must hold then.
4. **`PUT` converts the body's basis.** The ingredient form shows the
   basis in the old unit ("per 100 g"); on a `convert` change the server
   multiplies the body's `basis` (not the stored one), so a basis edited
   by hand in the same edit is converted too. The form sends the basis as
   typed and does not pre-convert it. For `same` and `no_convert` the
   body's basis is saved as sent. (The form's rule "the basis follows the
   unit unless changed by hand" never changes 100 for a change inside
   mass or volume, so no conflict.)
5. **What converts, exactly** (all multiplied by the ratio):
   - attribute: `ingredient_values.value` of that attribute (count key
     `ingredient_values`, rows counted), the live plan's goals
     `min`, `max` and `zero_reference` of that attribute (key `goals`,
     goals counted, a goal with several bounds counts once). Unit and
     decimals themselves are not converted. Saved results and the unsaved
     plan result keep their own copy of units and numbers (they have
     their own tables and are not touched).
   - ingredient: its `basis` (key `basis`, always 1) and every
     `recipe_items.amount` of it (key `recipe_amounts`, rows counted).
     Ingredient values are per basis and stay as they are.
6. **Rounding.** Ingredient values, basis and recipe amounts round half up
   to 6 decimals (`models.VALUE_DECIMALS`), as `recipes._rounded` rounds.
   `rounded` counts the numbers that lost digits. Goal bounds and
   references never round: a result that does not fit the attribute's
   decimals (the new `decimals` of interpretation 3) is refused.
7. **Refusals, in order.** The first problem found, going through the
   converters in list order and each one's rows by id, is reported; the
   rest are not. Types (all 422 on `unit` for `PUT`, and the `refusal` of
   a preview):
   - `conversion_needs_decimals`: a goal bound or reference would need
     more decimals than the attribute has (spec). Carries `decimals_needed`
     or null when no finite number of decimals fits.
   - `conversion_too_large`: a converted number reaches 10^9 (15 digits
     with 6 decimals) (spec).
   - `conversion_rounds_to_zero` (added here, the spec is silent): a basis
     or recipe amount must be above 0, and the conversion would round it
     to 0 (0.0000004 kg of something). Without it the save would store a
     value the rest of the API rejects.
   - `unit_not_for_ingredient`: the ingredient preview gives this refusal
     for an energy unit, as `PUT` does (U2), so the form can show it
     without first asking the user to confirm a dialog that then fails.
   The message of each (`msg` and `refusal.msg`) is an English sentence
   with the facts; the app composes its own i18n sentence from the
   structured fields, as for U2's refusal.
8. **A refusal names its subject** as `{kind, name, field}` with `kind` one
   of `goal`, `ingredient_value`, `basis`, `recipe_amount`; `name` the
   goal's displayed name (`translate.named_goals`), the ingredient's or
   the recipe's; `field` `min`, `max`, `zero_reference` or `value`, plus
   `number` and `converted` as plain strings. Later converters add their
   kinds.
9. **The app shows a refusal under the unit field,** not in a dialog, and
   keeps the form open. The dialog is only for `convert` and `no_convert`.
10. **`same` saves with no preview dialog;** a preview that fails (network,
    404) shows the form's usual "could not save" message and saves
    nothing, rather than converting without asking.
11. **Counts' wording.** The dialog line is "`{name}`: {counts joined by
    'and'} will be converted from {old} to {new} (× {factor})." for
    `convert`, and "`{name}`: {counts} keep their numbers." for
    `no_convert` with the title "Change unit". One i18n entry per count
    key (`unitChange.counts.ingredient_values`, `.goals`, `.basis`,
    `.recipe_amounts`), each pluralised like `count.goals`; zero counts
    are left out; the ingredient's `basis` entry is "the basis" (count
    always 1) and reads "the basis and 4 recipe amounts". When "rounded"
    is above 0 the dialog adds "{n} values will be rounded." (spec).
    When every count is zero the dialog still shows (the unit changes),
    reading "Nothing stored in {old} needs converting." for `convert`.
12. **The factor is shown to 12 significant digits,** `factor: str` in the
    preview ("0.001", "1000", "0.0295735295625"); it is for display
    only, the arithmetic uses the exact ratio.
13. **Same transaction.** `PUT` computes the `Change` first (no writes);
    a refusal is a 422 before anything is modified; otherwise the
    ingredient or attribute is filled as today, `Change.apply()` writes
    the converted numbers on the same session, and the one commit saves
    all. A name clash (409) rolls the whole thing back, as it does today.
14. **Future-slice seams, designed now but not built:** D4's linked
    ingredient may change only to another mass unit
    (`unit_not_for_source`): a check in the ingredient route before
    `plan()`. R3 refuses a category change while a line in another unit
    or a stored conversion exists: an optional `blocks_no_convert(db) ->
    Refusal | None` on `Converter`, called by `plan()` for kind
    `no_convert`. Neither is added here (YAGNI); the extension is one
    field on `Converter` and one branch in `plan()`.

15. **Decisions made while building.**
    - `mg` to `MG` is `no_convert`, not `same`: a capital M is not milli in the
      catalogue, so `MG` is free text. Tests use `mg.` for a spelling-only change.
    - Ratio 1 between different spellings of one amount (ml to krm) is `same`.
    - The plan's "0.0000004 stays" case cannot be stored (6 decimals); tests use
      0.000001 (stays) and 0.0004 g to kg (refused).
    - The goal converter reads the plan with `db.get`, not `queries.plan`, so a
      preview never creates the default plan.
    - `PUT /api/ingredients` plans before `_fill` (the plan reads the database and
      must not flush the new fields) and raises the refusal after `_fill`, so
      `_fill`'s own 422s win.
    - The app composes refusal sentences from `unitChange.subject.*` and
      `unitChange.refusal.*` with the form's old and new unit and the attribute's
      name; a refusal in a `PUT`'s 422 shows the server's `msg` as is.
    - The dialog answers no when its page unmounts, and Escape cancels.
    - `IngredientPage`'s local `basisFor` fallback stays: `units.basisFor` gives
      `1` for g while the catalogue is empty, the page keeps `100`.

## Tasks

### Task 1: Server: `units.ratio` and the conversion engine

**Files:** modify `server/units.py`, `tests/server/test_units.py`; create
`server/unit_change.py`, `tests/server/test_unit_change.py`.

**Interfaces produced:**

`server/units.py`:

```python
def ratio(a: str, b: str) -> Fraction | None:
    """Exactly what `factor` gives, as a Fraction (the unit factors are exact decimals)."""
```

`server/unit_change.py` (imports `models`, `units`, `translate`; no
FastAPI):

```python
@dataclass
class Number:
    kind: str                  # "ingredient_value" | "goal" | "basis" | "recipe_amount"
    row_id: int                # counted once per (kind, row_id)
    name: str                  # for a refusal: the goal's, ingredient's or recipe's name
    field: str                 # "value" | "min" | "max" | "zero_reference" | "basis" | "amount"
    value: Decimal
    write: Callable[[Decimal], None]
    decimals: int | None = None   # None: round to VALUE_DECIMALS; n: must fit n decimals exactly
    positive: bool = False        # must stay above 0 after rounding

@dataclass(frozen=True)
class Converter:
    key: str                              # the count's key in the answer
    numbers: Callable[[Session], list[Number]]

@dataclass(frozen=True)
class Refusal:                            # facts of the first refused number
    type: str; msg: str; kind: str | None; name: str | None; field: str | None
    number: str | None; converted: str | None; decimals_needed: int | None

@dataclass
class Change:
    kind: Literal["same", "convert", "no_convert"]
    factor: str | None
    counts: dict[str, int]
    rounded: int
    refusal: Refusal | None
    def apply(self) -> None: ...          # writes every converted number; only for "convert" without refusal

def attribute_converters(attribute: models.Attribute, decimals: int) -> list[Converter]: ...
def ingredient_converters(ingredient: models.Ingredient, basis: Decimal) -> list[Converter]: ...
def plan(db: Session, old_unit: str, new_unit: str, converters: list[Converter]) -> Change: ...
```

`attribute_converters`: `[Converter("ingredient_values", ...), Converter("goals", ...)]`;
`ingredient_converters`: `[Converter("basis", ...), Converter("recipe_amounts", ...)]`.
The basis converter yields one `Number` from the `basis` argument that writes
`ingredient.basis` (interpretation 4). Rows come ordered by id. The goal
converter reads `queries.plan(db).goals` for the attribute's id and names
each by `translate.named_goals`. Pure number rule, a private function
`_convert(value, ratio, decimals, positive) -> (new | refusal-kind,
rounded: bool)`, tested directly.

**Tests (write first), `tests/server/test_units.py`:** `ratio` equals
`factor` as an exact value for pairs from the catalogue (g to kg 1/1000,
lb to oz 16, fl oz to US cup 1/8, oz to g 28.349523125, tsk to msk 1/3,
msk to US cup non-terminating), None across categories, for free text
(`pinch` to `g`, `st` to `g`), 1 for `g`/`gram` and `pinch`/`Pinch`.

**Tests (write first), `tests/server/test_unit_change.py`:**

- Pure rule: 12 mg x 1000 is 12000; 0.5 mg x 0.001 to 6 places is exact;
  1.2345675 g x 1 rounds half up to 1.234568 and counts as rounded;
  a goal bound 0.5 x 0.001 with decimals 3 refuses `conversion_needs_decimals`
  with `decimals_needed` 4; with decimals 4 it is accepted; a non-terminating
  ratio refuses a goal bound with `decimals_needed` None; a value that reaches
  10^9 refuses `conversion_too_large` (999999999 x 1 passes; x 2 refuses); an amount
  0.0000004 x 1 stays, 0.0000004 x 0.001 refuses `conversion_rounds_to_zero`, and
  a non-positive field (value 0) never does.
- `plan()` with a database (`db` fixture as `test_preferences_store.py`
  makes one, rows through the `catalog` fixture): kinds for g to gram
  (`same`, factor None), mg to µg (`convert`, factor "1000"), g to kcal
  and g to `st` and `st` to `pcs`... (`st` to `pcs` is `same`),
  g to `pinch` (`no_convert`); counts per key for 2 values, 1 goal with min and
  max, 3 recipe amounts; counts also filled for `no_convert`.
- `apply()` writes only for `convert`: after `apply()` and `commit` the stored
  values, goal bounds and `zero_reference`, basis and amounts read back converted;
  after a `no_convert` plan `apply()` changes nothing.
- The first refusal wins and goes by converter order (a goal problem and a value
  problem: the value converter's comes first as it is first in the list).
- The saved plan result and its goals of the attribute are not touched (create
  a result by the existing freeze helper as `tests/server/test_freeze.py`
  does; its `PlanResultGoal` and `PlanResultTotal` numbers are the same after
  `apply()`).

**Verify:** `python3 -m pytest tests/server/test_units.py tests/server/test_unit_change.py -q`,
then `python3 -m pytest -q`.

**Checked:** both commands, green. Differences from the text: see interpretation 15.

### Task 2: Server: preview endpoints, `PUT` converts, refusals

**Files:** modify `server/api/attributes.py`, `server/api/ingredients.py`;
create `server/api/unit_changes.py`; tests
`tests/server/test_unit_change_api.py`; regenerate `web/openapi.json`,
`web/src/api/schema.ts`.

**Build:**

- `server/api/unit_changes.py` (response models and the 422, shared by both
  routes):

  ```python
  class UnitChangeRefusal(BaseModel):
      type: Literal["conversion_needs_decimals", "conversion_too_large",
                    "conversion_rounds_to_zero", "unit_not_for_ingredient"]
      msg: str
      kind: str | None; name: str | None; field: str | None
      number: str | None; converted: str | None; decimals_needed: int | None

  class UnitChange(BaseModel):
      kind: Literal["same", "convert", "no_convert"]
      factor: str | None            # "1000"; null unless kind is "convert"
      counts: dict[str, int]        # by converter key
      rounded: int
      refusal: UnitChangeRefusal | None

  def answer(change: unit_change.Change) -> UnitChange
  def refuse(change: unit_change.Change) -> None   # raises invalid_fields([FieldError(loc=["body","unit"], type, msg)])
  ```

  `UNIT_CHANGE_REFUSED = {422: {"model": FieldErrors, "description": "..."}}` for the
  routes' `responses`.
- `POST /api/attributes/{attribute_id}/unit-change`, body
  `AttributeUnitChange {unit: <as AttributeFields.unit>, decimals: int | None
  (MIN_PRECISION..MAX_PRECISION)}`: `get_or_404`, then
  `unit_change.plan(db, attribute.unit, body.unit, attribute_converters(attribute,
  body.decimals if given else attribute.decimals))`, answer `UnitChange`. Writes
  nothing.
- `POST /api/ingredients/{ingredient_id}/unit-change`, body `IngredientUnitChange
  {unit: <as IngredientFields.unit>, basis: Number > 0 | None}`: the same with
  `ingredient_converters(ingredient, body.basis or ingredient.basis)`. If
  `units.parse(body.unit)` is energy, `refusal` is `unit_not_for_ingredient` with
  U2's message (reuse `UNIT_NOT_FOR_INGREDIENT`) and kind `no_convert`.
- `PUT /api/attributes/{id}`: before filling, `change = plan(...)` from the stored
  unit to `body.unit` with `body.decimals`; a refusal raises `refuse(change)`
  (422 before any change). After the fields are set, `change.apply()`; the one
  `commit_named` saves everything. `PUT /api/ingredients/{id}` likewise with
  `body.basis` (interpretation 4); `_fill` runs first as today (its own 422s
  win), `apply()` after it so the converted basis overwrites the filled one.
  Both routes' `responses` gain the 422 (the ingredient route's description
  also names the refusals).
- A 404 for the preview of a missing row, as the other routes.

**Tests (write first), `tests/server/test_unit_change_api.py`**, through the
`client` and `catalog` fixtures (the spec's list):

- *Attribute, converts within a category:* Iron in mg with 2 ingredient values
  (12 and 0.5), a goal min 0.5 max 2 and a goal with a zero reference; PUT unit
  `µg` converts values to 12000 and 500, bounds to 500 and 2000, the reference
  to the converted number, unit saved as typed, decimals saved; other
  attributes' numbers untouched.
- *Preview matches PUT:* the preview of that change answers kind `convert`,
  factor "1000", counts `{ingredient_values: 2, goals: 2}`, rounded 0, no
  refusal; after PUT the stored numbers are exactly what the preview implied. A
  parametrised matrix (mg to g, g to kg, oz to g, dl to msk) checks preview and
  PUT agree on counts, rounded and refusal and that a refusal leaves everything
  unchanged.
- *Ingredient converts:* Oats in g, basis 100, with 2 recipes using 60 and 150
  g, PUT unit `kg` gives basis `0.1`, amounts `0.06` and `0.15`, the ingredient
  values unchanged, the unit `kg`; recipe totals (GET `/api/recipes`) are the
  same as before. Counts `{basis: 1, recipe_amounts: 2}`, factor "0.001".
- *Basis edited by hand in the same save:* PUT with basis 50 and unit kg stores
  0.05.
- *Plans untouched:* a saved plan result and the unsaved plan's goals of other
  attributes are not changed; the saved result's `ResultAttribute` unit and
  totals are the same after the unit change (they are a frozen copy); the plan
  setup's goal of the converted attribute IS converted (it is live).
- *Other category converts nothing:* Iron mg to `dl`: kind `no_convert`,
  factor null, counts still listed (`{ingredient_values: 2, goals: 2}`), PUT
  changes the unit only and every number stays. To free text (`IU`) and from
  free text (`IU` to `mg`, `IU` to `IE`) likewise; `same` for `mg` to `MG`,
  `g` to `gram`, `st` to `pcs`: kind `same`, nothing converted, factor null.
- *Rounding:* an ingredient with a recipe amount 1.234567 g to kg: stored
  0.001235, `rounded` 1 in preview and PUT, no refusal; ingredient values
  rounded likewise on an attribute change (value 0.000123 mg to g); `rounded`
  0 when nothing lost digits.
- *Refusals:* a goal min 0.5 mg to g with decimals 3: 422 on `["body","unit"]`
  type `conversion_needs_decimals`, the preview's `refusal` has the same type,
  `kind` `goal`, `name`, `field` `min`, `number` "0.5", `converted` "0.0005",
  `decimals_needed` 4, nothing changed; the same change with `decimals` 4 in the
  body passes (preview too, with `decimals` in the preview body); a zero
  reference refuses the same way (`field` `zero_reference`); a value 999999999 mg
  to µg refuses `conversion_too_large` naming kind `ingredient_value`; a
  recipe amount that would round to 0 refuses `conversion_rounds_to_zero` (kind
  `recipe_amount`, name the recipe); a non-terminating ratio (tsk to US cup)
  with a goal bound refuses with `decimals_needed` null, with only
  ingredient values it rounds.
- *Ingredient preview of an energy unit* gives the `unit_not_for_ingredient`
  refusal; `PUT` keeps U2's 422.
- *Atomic:* a name clash (409) on the same PUT that would convert leaves every
  number as it was; a refusal 422 leaves the unit as it was.
- *Preview writes nothing and 404s* for a missing id; unauthenticated 401 as
  every route (the existing auth test list covers `/api/*`; add the two paths
  if it enumerates routes).

**Verify:** `python3 -m pytest tests/server -q`; then in `web/` `npm run
gen:api` and `git diff --stat` shows `openapi.json` and `schema.ts` changed,
`test-units.json` not; then `python3 -m pytest -q` (the OpenAPI test is green
once regenerated).

**Checked:** `python3 -m pytest -q` green; `gen:api` changed `openapi.json` and
`schema.ts`, not `test-units.json`. Differences: none.

### Task 3: Web: `useUnitChange` and `UnitChangeDialog`

**Files:** create `web/src/composables/useUnitChange.ts`,
`web/src/composables/useUnitChange.test.ts`,
`web/src/components/UnitChangeDialog.vue`,
`web/src/components/UnitChangeDialog.test.ts`; modify `web/src/api/types.ts`
(`UnitChange`, `UnitChangeRefusal`), `web/src/i18n/en.json`,
`web/src/test-data.ts` (`unitChange(fields)` builder).

**Interfaces produced:**

```ts
// useUnitChange.ts
export function useUnitChange() {
  /** Ask the dialog; resolves true on Convert / Change unit, false on Cancel. */
  ask(request: { name: string; from: string; to: string; change: UnitChange }): Promise<boolean>
  state: Readonly<Ref<{ ... } | null>>      // what the dialog shows
  answer(ok: boolean): void                 // called by the dialog
}
export function refusalText(t: Composer['t'], refusal: { type: string, ... }): string
```

`state` is module-level (one dialog open at a time, as one form is open). The
dialog is mounted once by each page with `<UnitChangeDialog />` and reads the
state; no props except none. The per-page code is `const unitChange =
useUnitChange()` and `await unitChange.ask(...)`.

`UnitChangeDialog.vue`: a `q-dialog` (persistent: backdrop click does not
decide). Title "Convert {name}'s numbers?" for `convert`, "Change unit?" for
`no_convert`. Body per interpretation 11, built from `change.counts` through
`unitChange.counts.<key>` entries; the factor line `× 1000`; the rounded line;
buttons **Cancel** and **Convert** / **Change unit**. A count key with no i18n
entry is skipped, never shown raw. `refusalText` composes the sentence from the
refusal's `type` and fields (`unitChange.refusal.<type>`).

`en.json` (new section `unitChange`): `convertTitle`, `changeTitle`,
`convertBody`, `noConvertBody`, `nothingToConvert`, `rounded`, `convert`,
`changeUnit`, `counts.{ingredient_values, goals, basis, recipe_amounts}`,
`refusal.{conversion_needs_decimals, conversion_too_large,
conversion_rounds_to_zero}` (`unit_not_for_ingredient` reuses
`ingredients.unitNotForIngredient`). Examples: "Iron: 12 ingredient values and
2 goals will be converted from mg to µg (× 1000)."; "Oats: the basis and 4 recipe
amounts will be converted from g to kg (× 0.001)."; "Iron: 12 ingredient values
and 2 goals keep their numbers."; "The goal {name} {bound} {number} {unit} would
need {n} decimals as {to}. Raise {attribute}'s decimals first." (the attribute
sentence when `decimals_needed` is null: "...can't be written exactly in {to}.").

**Tests (write first):**

- `UnitChangeDialog.test.ts` (mount with `ask` called, as other dialog tests
  do, `dialog()` helper): `convert` shows the title, the counts sentence with
  plurals ("1 goal", "12 ingredient values"), zero counts left out, the factor,
  the rounded line only when above 0, buttons Cancel and Convert; `no_convert`
  shows "keep their numbers" and the button Change unit; all counts zero shows
  the nothing-to-convert line; an unknown count key (`source_values` with no
  i18n entry) is skipped; Convert resolves `ask` with true, Cancel with false;
  a backdrop click resolves nothing.
- `useUnitChange.test.ts`: `ask` while one is open resolves the first with
  false (cannot happen from the UI; keeps the promise from hanging); `refusalText`
  for each type with its facts, including `decimals_needed` null.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test` in `web/`.

**Checked:** lint, typecheck, Vitest. Differences: the dialog also resolves no
when its page unmounts; `refusalText` takes a context (old and new unit, attribute
name) besides the refusal; `test-data.ts` also has `unitChangeRefusal`.

### Task 4: C5, the attribute form asks before converting

**Files:** modify `web/src/pages/AttributesPage.vue`,
`web/src/pages/AttributesPage.test.ts`, `web/src/i18n/en.json` (only if
Task 3 left a string out).

**Build** (re-read `done()` first; U2's fix round may have touched it):

- In `done()`, after validation and the "nothing changed" early return, when
  `current` exists and `fields.unit !== current.unit`: `POST
  /api/attributes/{id}/unit-change` with `{unit: fields.unit, decimals:
  fields.decimals}`. No data or a thrown error: `errors.save =
  t('common.saveFailed')`, return false. A `refusal` of the preview: show
  `refusalText(...)` in `errors.unit`, return false (the row stays open). Kind
  `same`: go on to save. Otherwise `await unitChange.ask({name:
  fields.name-or-current.name, from: current.unit, to: fields.unit, change})`;
  false returns false with the row still open.
- Pass `errors.unit` to the `UnitField` (`:error`, `:error-message`), cleared at
  the start of `done()` and when the unit is edited.
- The PUT's 422 of a refusal (the preview raced a change elsewhere) shows the
  same `refusalText` from `fieldErrors`-style data: extend the error handling
  to read `error.detail[0]` when its `type` starts with `conversion_` and show
  `t('unitChange.refusal.<type>')` without facts (the structured facts are the
  preview's; the PUT's message `msg` is shown as is).
- A new attribute (`openId === 'new'`) never asks.
- Mount `<UnitChangeDialog />` once in the template.

**Tests (write first), `AttributesPage.test.ts`:** the fake server gets
`'POST /api/attributes/1/unit-change'` replying with `unitChange({...})` from
`test-data.ts`.

- Changing `mg` to `µg` and pressing Done calls the preview with `{unit: 'µg',
  decimals: 1}`, shows the dialog "...will be converted from mg to µg (× 1000)",
  Convert then sends the PUT and closes the row; Cancel sends no PUT and the
  row stays open with the typed unit.
- A `no_convert` answer shows "keep their numbers" and Change unit, then PUTs.
- A `same` answer (mg to MG) PUTs with no dialog.
- A refusal answer shows the sentence under the unit field, no dialog, no PUT,
  the row stays open; raising Decimals and pressing Done asks again with the new
  `decimals` in the preview body.
- A failing preview (500) shows "could not save" and sends no PUT.
- A new attribute and an unchanged unit never call the preview (assert the
  calls list).
- The existing tests that type a unit on an existing attribute and press Done
  (typed `IU`, `gram`, chosen `kJ`) get the preview route in their fake server
  (kind `no_convert` or `same` as fits) so they still show what they showed;
  say in the test names nothing changes.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`; open the dialog in a
browser at 390 px (`npx vite build`, uvicorn on an empty SQLite file as for the
e2e): the dialog fits the viewport and nothing scrolls sideways; record in
Checked.

**Checked:** lint, typecheck, Vitest. Dialog at 390 px in Chromium (vite build,
uvicorn on an empty SQLite file): 247 px wide, `scrollWidth` 390 = viewport, no
sideways scroll. Differences: a `PUT` 422 of a conversion shows the server's
`msg` (new `conversionRefusal` in `api/errors.ts`).

### Task 5: C4, the ingredient form asks before converting

**Files:** modify `web/src/pages/IngredientPage.vue`,
`web/src/pages/IngredientPage.test.ts`.

**Build** (re-read `save()` first):

- In `save()`, after `checked()` and when `id !== null` and `fields.unit !==
  data.value.ingredient.unit`: `POST /api/ingredients/{id}/unit-change` with
  `{unit: fields.unit, basis: fields.basis}`. As in Task 4: a failing preview
  is `common.saveFailed`; a refusal is `errors.unit = refusalText(...)`
  (including `unit_not_for_ingredient`, which uses the existing text); `same`
  saves; otherwise `ask(...)` with the ingredient's name and its stored unit as
  `from`, false stops.
- The basis sent is the one in the form (old unit), as `PUT` converts it
  (interpretation 4); the form does not rewrite the typed basis.
- A new ingredient never asks. Mount `<UnitChangeDialog />` once.
- `showServerErrors` also shows a `conversion_*` 422 of the PUT under the unit
  field (same fallback text as Task 4).

**Tests (write first), `IngredientPage.test.ts`:** fake route `'POST
/api/ingredients/7/unit-change'`.

- Choosing `kg (kilogram)` and pressing Save calls the preview with `{unit:
  'kg', basis: '100'}`, shows "Oats: the basis and 4 recipe amounts will be
  converted from g to kg (× 0.001)"; Convert PUTs `unit: 'kg', basis: '100'`
  (the form's basis, not converted) and goes to the list; Cancel sends no PUT.
- A basis edited to `50` is sent in the preview and PUT as `50`.
- `no_convert` (g to `ml`... same-category is convert; use `st`): dialog "keep
  their numbers", Change unit PUTs; the U2 behaviour for the basis (`1`) is
  unchanged.
- `same` (typing `gram`) PUTs with no dialog (U2's "typing `gram` sends `gram`
  unchanged" still holds, now with the preview route in the fake server).
- A refusal under the unit field, no dialog, no PUT; energy `kcal`: the preview's
  `unit_not_for_ingredient` refusal shows U2's text under the field and sends no
  PUT (replaces U2's test that relied on the PUT's 422; keep one test with the
  preview failing open and the PUT's 422 showing the same text).
- Rounded: a preview with `rounded: 2` shows "2 values will be rounded."
- New ingredient and unchanged unit never call the preview.
- Existing U2 tests that change the unit of the saved Oats get the preview route.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`; the dialog at 390 px.

**Checked:** lint, typecheck, Vitest; the same dialog at 390 px from the ingredient
form. Differences: none.

### Task 6: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts`.

**Build:** in the existing flow, after the "ingredient is now in use" step
(Porridge opened and back) and before the Tags step:

- Ingredients, open Oats, choose `kg (kilogram)` from the **Measured in** list,
  Save: the dialog says "Oats: the basis and 1 recipe amount will be converted
  from g to kg (× 0.001)." Cancel first (the form stays, still `kg` typed, the
  list row afterwards still says "per 100 g"), then Save again and Convert.
- The list row reads `Oats per 0.1 kg · Energy 389 kcal`. Open the Porridge
  recipe: the amount of Oats reads `0.06` and the portion total still reads
  `Energy 233 kcal` (the unit change converted the basis and the amount
  together). Back to the list.
- Later steps do not mention grams; the plan steps read energy totals only,
  which are unchanged. Update the header comment to mention the unit change.

**Verify (the e2e recipe in the common context):** `cd web && npx vite build`;
uvicorn on an empty SQLite file in the scratchpad with `PASSWORD_HASH` and
`SESSION_KEY`; `E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000 npm run e2e
-- --trace off`; kill the server.

**Checked:** build, uvicorn on an empty SQLite file, the e2e flow passed (1 test).
Differences: none.

### Task 7: Docs

**Files:** `README.md`, the master plan, the units spec, the wireframes spec,
this plan.

- `README.md`: in the status paragraph, say that changing a unit within its
  category converts the stored numbers after a dialog (values, goal bounds,
  basis, recipe amounts), and that another category or free text only changes
  the unit.
- Master plan: after the "U2 done" line add "U3 done: see
  `2026-11-08-slice-u3-unit-change-converts.md`." Also, in the rules at the top,
  the sentence about unit conversion growing slice by slice names the seam:
  "each slice adds a converter in `server/unit_change.py`".
- Units spec: under "Changing a unit", record interpretations 3, 4, 5 (what
  converts is the body's basis; the preview's optional `decimals`/`basis`), 6
  (rounding half up), 7 (the added `conversion_rounds_to_zero` and the preview's
  `unit_not_for_ingredient`), and in "Errors" the new row; keep the decisions.
- Wireframes spec: C4 and C5 describe the Convert / Change unit dialog and the
  refusal text under the unit field.
- This plan: Status "Built"; under each task add how it was checked and the
  differences from the text, as the earlier slice plans do.

**Verify:** the full checks (both suites, lint, typecheck) and the e2e run once
more.

**Checked:** see the report of the slice. Differences: none.

## Done when

Changing the unit of a saved attribute or ingredient within its category
shows a dialog listing what converts, and Convert changes the unit and every
stored number together (attribute values, goal bounds and references;
ingredient basis and recipe amounts), exactly, rounding ingredient numbers to 6
decimals and saying so, while saved plans and the unsaved plan keep their
numbers; another category, or free text, changes only the unit after a dialog
that says so; a spelling-only change saves with no dialog; the server refuses a
goal bound that needs more decimals, a number past 15 digits, and an amount that
would round to 0, with the same answers from the preview and from `PUT`; both
test suites, lint, typecheck, the migration test (untouched) and the end-to-end
flow pass; D4 and R3 can add their numbers by appending one `Converter` to a
list and one i18n line.
