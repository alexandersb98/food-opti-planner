# Units and Unit Conversion

**Status:** Approved by the user.

**Path:** Architectural (a unit catalogue shared by the server and the
app, a new table, a new page, conversions on save).

**Context:** Units are free text today: an attribute's unit
(`attributes.unit`, GUI-only) and an ingredient's unit
(`ingredients.unit`, which recipe amounts and the value basis are in).
Nothing converts, so changing Iron from mg to µg leaves every value off
by 1000. Importing foods from external data sources
([`2026-11-03-ingredient-data-sources-design.md`](2026-11-03-ingredient-data-sources-design.md))
needs to convert, as a source's units need not be the user's. This spec
is built first; the data source spec relies on it.

Screen ids follow the GUI spec
([`2026-10-21-gui-wireframes-design.md`](2026-10-21-gui-wireframes-design.md)).

## Decisions

1. **Three categories:** mass (base g), volume (base l) and energy
   (base J). A unit in a category has a fixed factor to its base.
2. **SI prefixes are understood, not listed.** µ, m, c, d and k on a
   base unit (and on cal) give a known unit: mg, kg, ml, dl, cl, kJ,
   kcal.
3. **Other known units are listed with their factor** (table below),
   with aliases for other spellings, Swedish kitchen units among them.
4. **Any other text is a free-text unit** ("piece", "IU", "pinch"). It
   belongs to no category and converts to nothing, as today.
5. **One catalogue for attributes and ingredients,** with the
   categories each may use:

   | Category | Ingredient unit | Attribute unit |
   |---|---|---|
   | Mass | yes (pasta) | yes (protein) |
   | Volume | yes (milk) | yes (rare) |
   | Energy | no | yes (energy) |
   | Free text | yes ("piece") | yes ("IU") |

6. **An attribute's unit is an amount, never a ratio.** Its values are
   per the ingredient's basis, so "per 100 g" comes from the
   ingredient. A carbon footprint is an attribute "CO2e" in g or kg,
   not "kg CO2e/kg". CO2 equivalents are therefore plain mass, with no
   category of their own.
7. **A preferred unit per category,** set on a new Settings page. It is
   the default for new things only: a new ingredient, an attribute
   created from a data source column, values copied from a data source.
   Things already saved keep their unit.
8. **Changing a unit within its category converts** what is stored in
   it, after a confirmation listing what changes. A change to another
   category or to or from free text converts nothing and warns so.
9. **The server owns the catalogue.** `GET /api/units` sends it to the
   app, so the rules live once (as for tag derivation; compare code
   health finding 3, the guard-rail rule kept in both Python and TS).

Later, in `future-features.md`: showing and typing every amount in the
preferred unit; mass ↔ volume per ingredient from its density.

## The catalogue

`server/units.py`, a pure module with no database access.

**Base units and prefixes:**

| Category | Base | Prefixable | Prefixes |
|---|---|---|---|
| Mass | g | g | µ (10⁻⁶), m (10⁻³), c (10⁻²), d (10⁻¹), k (10³) |
| Volume | l | l | same |
| Energy | J | J, cal (4.184 J) | same |

**Listed units** (exact factors):

| Unit | Category | Factor | Aliases |
|---|---|---|---|
| oz | mass | 28.349523125 g | ounce |
| lb | mass | 453.59237 g | pound |
| tsp | volume | 5 ml | tsk, teaspoon |
| tbsp | volume | 15 ml | msk, tablespoon |
| krm | volume | 1 ml | kryddmått |
| US cup | volume | 236.5882365 ml | |
| metric cup | volume | 250 ml | |
| fl oz | volume | 29.5735295625 ml | US fl oz |

tbsp and tsp are the metric ones (15 and 5 ml); the US tablespoon is
not listed. A bare "cup" is not known, as it means different amounts in
different countries; it stays free text.

**Aliases for base and prefixed units:** gram, grams for g; litre,
liter, L for l; µg also as ug and mcg; Kcal, kcal and Cal for kcal.

**Reading a unit.** `parse(text) -> Unit | None` trims spaces and
compares case-insensitively (safe, as no supported prefix differs from
another by case only). It returns the category and the factor to the
base, or None for free text. `factor(a, b)` gives the multiplier from
`a` to `b`, or None when they don't convert.

**Display names.** The catalogue names each unit for the drop-downs:
common prefixed units (µg, mg, g, kg; ml, cl, dl, l; kJ, kcal) and the
listed ones. Other prefixed units (cg of mass, kl) are understood but
not offered.

## Preferred units

A new table `preferences` (key, value), one row per preference. The data
source spec adds its own keys (the last data source chosen). Keys here:
`unit.mass`, `unit.volume`, `unit.energy`; values are unit symbols from
the catalogue. Unset keys mean g, dl and kcal.

**Settings page (S1),** a sixth menu entry, last. Its first card is
**Preferred units**: one drop-down per category, offering that
category's display units. A change saves at once. The card says:
"Used for new ingredients and attributes, and for values copied from
data sources. Changing it converts nothing already saved." (The data
source spec adds a Data sources card here.)

## Unit fields

The unit field of attributes (C5) and ingredients (C4) becomes a combo
box: a list of known units grouped by category, the preferred unit of
each category first, and the user can still type any text. A known unit
chosen from the list is stored in its catalogue spelling; typed text is
stored as typed (and is still understood when it parses, e.g. "gram").

- **Ingredient:** the list offers mass and volume units. A new
  ingredient starts with the preferred mass unit; its basis default
  stays as in C4 (100 for mass and volume units, 1 otherwise). An
  energy unit typed in is refused: "An ingredient is measured in an
  amount of food, such as g, dl or pieces."
- **Attribute:** the list offers mass, volume and energy units. A new
  attribute starts empty, as its category isn't known. Under the field:
  "The amount per the ingredient's basis, e.g. g or kcal."

## Changing a unit

When a saved attribute's or ingredient's unit changes, the server works
out the factor from the old unit to the new.

| Old → new | What happens |
|---|---|
| Same unit, other spelling (g → gram) | Saved; nothing to convert, no dialog. |
| Same category (mg → µg) | A dialog lists what will be converted; on **Convert**, the unit and those numbers change together. |
| Other category, or to or from free text | A dialog says "Values are not converted. Iron's 12 ingredient values and 2 goals keep their numbers." On **Change unit** only the unit changes, as today. |

**What converts:**

- **Attribute:** every number stored in its unit, multiplied by the
  factor: ingredient values (and their copied source values, from the
  data source spec), goal Min and Max, and the zero-bound reference.
  The dialog says, e.g., "Iron: 12 ingredient values and 2 goals will
  be converted from mg to µg (× 1000)."
- **Ingredient:** its basis and every recipe amount of it, multiplied by
  the factor. The values stay as they are, as they are per the basis:
  oats from g to kg makes "per 100 g" "per 0.1 kg", and a recipe's
  150 g becomes 0.15 kg. The dialog: "Oats: the basis and 4 recipe
  amounts will be converted from g to kg (× 0.001)."
- **Never:** saved plans and the unsaved plan. They keep their own copy
  of units and numbers (results spec decision 2, a saved plan is a
  frozen copy).

**Precision.** Conversion is exact (Decimal). Numbers are stored with 6
decimals and 15 digits (`EXACT_NUMBER`).

- A converted ingredient value, basis or amount with more than 6
  decimals is rounded to 6. The dialog says so when it happens:
  "3 values will be rounded."
- A converted goal bound or reference with more decimals than the
  attribute allows refuses the change: "The goal Iron at least 0.5 mg
  would need 4 decimals as g. Raise Iron's decimals first."
- A number past 15 digits refuses the change, naming the first one.

**API.** `POST /api/attributes/{id}/unit-change` and
`POST /api/ingredients/{id}/unit-change` take `{unit}` and answer what a
save with it would do: `{kind: "same" | "convert" | "no_convert",
factor, counts, rounded, refusal}`. The edit forms call it before
saving and show the dialog. The `PUT` itself converts when the unit
changes within a category; it refuses with the same refusal codes, so a
client that skipped the check can't lose precision.

## Errors

| Case | Answer |
|---|---|
| Energy unit on an ingredient | 422 `unit_not_for_ingredient` on `unit` |
| Converted goal bound needs more decimals | 422 `conversion_needs_decimals` on `unit`, with the goal |
| Converted number past 15 digits | 422 `conversion_too_large` on `unit` |
| Unknown preference key or a unit of the wrong category | 422 on that field |

## Testing

- `units.py`: prefixes on each base; listed units and aliases; case and
  spaces; free text; factors both ways; no factor across categories;
  "cup" stays free text.
- API: a unit change within a category converts values, goal bounds
  and references (attribute) or basis and recipe amounts (ingredient),
  and leaves saved plans alone; another category converts nothing;
  rounding past 6 decimals; refusals for decimals and size; the
  unit-change preview matches what `PUT` does; preferences read and
  written; the units endpoint.
- App: the combo box groups units with the preferred first and still
  takes typed text; the dialogs for convert and no-convert; the
  Settings page saves a preferred unit; a new ingredient starts with
  the preferred mass unit.
- End-to-end: change an ingredient from g to kg; its recipe amount is
  converted.

No migration of data: existing units parse as they are, and free text
stays free text.
