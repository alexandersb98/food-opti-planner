# Meal Plan Optimizer — Product Vision: Data Import, Products and Attributes

**Status:** vision notes, not decisions. Written down from the user's
thoughts on 2026-10-26 so they can be designed one at a time later.
Nothing here changes the numbered decisions in
[`2026-09-15-meal-optimizer-design.md`](2026-09-15-meal-optimizer-design.md);
where a theme would revise one, that is called out.

## Summary

1. **Getting data in is the main gap.** Today every recipe, ingredient
   and attribute value is typed in by hand (decision #8). The app should
   be able to import recipes, ingredient data and product data.
2. **Products need to exist in the app.** An ingredient (pasta) is sold
   as many products (Kungsörnen, ICA Basic, ...) at different
   supermarkets. Decision #32 already designs `Product`, but neither the
   library nor the GUI has it yet.
3. **Data sources must be pluggable, per user.** Different users shop at
   different chains (one only has a Coop nearby, another uses ICA or
   Willys), so which sources the app talks to is a per-user choice, not
   built into the app.
4. **Some attributes are functions of others.** Energy follows from
   protein, fat and carbohydrates. The app should model such rules.
5. **Fully configurable attributes may be more than is needed.** In use
   only about 6-7 attributes came up, not the 20-30 imagined at the
   start, so a fixed set defined in code might serve better than
   decision #7's user-defined attributes.

Themes 4 and 5 pull in the same direction: rules like "energy from
macros" are much easier to write, check and import data for when the
attributes are known in code.

## 1. Products

**What exists.** Decision #32 defines `Product` as a fixed purchasable
amount of one ingredient: `(ingredient, amount, price, optional
name/brand, optional sealed_shelf_life_days)`, many products per
ingredient, products referencing ingredients and never the reverse.
Decision #35 picks products after the meal plan is solved. None of this
is implemented: `meal_planner/domain.py` has `Ingredient` only, and a
price can only be entered as an ordinary attribute on the ingredient.

**What the vision adds.**

- A product belongs to a **store or chain** as well as a brand: the same
  Kungsörnen pasta has a different price at ICA and at Coop, and a store
  may not sell it at all. So a product (or a price on it) needs a source:
  which store, chain or data source it came from, and when.
- Products are the natural target for imported data. Supermarket data is
  about products (EAN barcode, brand, pack size, price, nutrition label),
  not about the abstract ingredient "pasta".
- Product-level nutrition and climate values. Decision #32 keeps
  nutrients on the ingredient and leaves brand-specific values out of v1.
  With imports, products will arrive carrying their own values, so there
  needs to be a rule for how an ingredient's values relate to its
  products' (hand-set, average, cheapest product's, the product the user
  prefers).

**Open points.**

- Mapping products to ingredients. An import gives "Kungsörnen Snabbmakaroner
  1 kg"; something has to say that is the ingredient "pasta". Options:
  the user picks, a name match suggests, or AI suggests and the user
  confirms.
- Where price lives once products exist: decision #32 already moves
  price from ingredient to product and derives a per-unit price from the
  cheapest product. With stores, "cheapest" should probably mean
  cheapest at the stores this user shops at.

## 2. Importing data, from pluggable sources

### Kinds of data and where they might come from

| Data | Candidate sources |
|---|---|
| Recipes | AI reading a photo of a cookbook page or a screenshot; recipe web sites and APIs; pasting a recipe's text or URL |
| Products, prices | Supermarket APIs or web shops (ICA, Coop, Willys and others) |
| Nutrition | Product labels via the supermarkets or Open Food Facts; generic values from Livsmedelsverket's food database |
| Climate footprint | A climate database for foods (sources still to be found and checked) |

Which of these have usable, permitted APIs is not checked yet. Swedish
chains are not known to offer open public APIs, so this needs research
per chain (official API, partner access, or none) before any design.

### Extensibility: connectors

The idea is one small interface per kind of source, with one
implementation per source, and each user choosing which ones are active.
A sketch, not a design:

- **Recipe source:** turns some input (an image, a URL, text) into a
  draft recipe: name, ingredient lines ("3 dl vetemjöl"), portions,
  steps.
- **Product source:** searches and fetches products: name, brand, EAN,
  pack size, price, store, and label values when available.
- **Ingredient data source:** fetches per-unit values (nutrition,
  climate) for an ingredient or product.

Shared ideas across all of them:

- **Import is a draft, not a write.** Imported data is shown for review
  and the user accepts, edits or rejects it, especially for AI-read
  recipes, which will sometimes misread an amount or a unit.
- **Matching to the catalog.** Ingredient lines in an imported recipe
  must be matched to existing ingredients, or new ones created. The
  unit conversion table (decision #36) handles "3 dl" for an ingredient
  kept in grams, and an import will often need a conversion added.
- **Provenance.** Each imported value remembers its source and date, so
  it can be refreshed (prices change weekly) and so a hand edit is not
  silently overwritten by the next refresh.
- **Per-user settings.** A user's chosen stores and their credentials,
  if a source needs them, are user settings. Today the app has one
  owner login (GUI slice 1), so per-user sources also raise when the app
  gets real multi-user accounts.
- **The optimizer stays untouched.** As decision #8 already requires,
  importers only fill the catalog; the solver never knows where data
  came from.

### AI recipe reading

The most self-contained first step, as it needs no third-party
agreement: the user uploads a photo, a vision-capable model returns the
recipe as structured data, the GUI shows it in the recipe editor as a
draft, and ingredient lines are matched to the catalog. Open points:
which model and where it runs (cost, API key handling on the server),
recipes that serve several portions (the "serves N" item in
[`future-features.md`](future-features.md)), and what to do with
ingredients that are not in the catalog yet.

## 3. Derived attributes (attributes as functions of others)

Some attributes follow from others by a rule. The main example:

- **Energy:** kcal ≈ 4 × protein + 4 × carbohydrate + 9 × fat
  (+ 7 × alcohol, + 2 × fibre under EU labelling rules).

Other likely rules: energy in kJ from kcal; salt from sodium
(salt = 2.5 × sodium); cost per unit from a product's price and pack
size; climate footprint per portion.

**Useful property.** Every attribute is linear in the solver: a recipe's
total is a sum of per-unit value × quantity (the reason decision #13
uses a MILP). A rule that is a weighted sum of other attributes, like
energy, stays linear, so it costs the solver nothing: it can be worked
out per ingredient before solving. Rules that are not sums, like
"protein as a share of energy", cannot be a per-ingredient value that is
summed, but such goals can often still be written as linear constraints
on plan totals (protein × 4 ≥ 0.2 × energy).

**Open points.**

- **Computed, or a default?** When a label states 360 kcal and the
  formula gives 352, which wins? Options: always computed (no input
  field), computed when missing, or computed and a warning when an
  entered value is far off.
- **Where rules live:** in code next to fixed attributes (theme 4), or
  as user-written formulas if attributes stay configurable. User-written
  formulas need a small expression language, cycle checks and error
  reporting, which is a lot of machinery for a handful of rules.

## 4. Fixed attributes in code instead of configuration

**Today.** Decision #7 makes attributes fully user-defined: an
`AttributeDef(name, precision, accrues_on)` in the library, and an
attributes screen in the GUI (slice 3) where the user creates them with
a unit and decimals. Constraints refer to attributes by name.

**Observation.** In real use about 6-7 attributes came up, for example
energy, protein, fat, carbohydrate, fibre, cost and climate footprint.
The flexibility costs screens, validation and storage, and makes imports
and rules harder: an importer cannot know that the user's attribute
"Protein (g)" is the protein in an Open Food Facts record.

**Direction to consider.** A fixed set of attributes defined in code
(a typed nutrition/cost/climate record on the ingredient), each with a
known unit, precision, `accrues_on` (decision #28) and, where it applies,
a derive rule. This would:

- let importers fill known fields directly;
- make derived attributes plain code;
- allow a fixed, well-designed ingredient form instead of a generic
  list of attribute rows;
- remove the attributes screen, or reduce it to choosing which of the
  known attributes to show.

**What it would revise:** decision #7 (attributes fully user-definable)
and the GUI's attributes screen (slice 3). The library's engine probably
need not change: it can keep working on named attribute totals, with the
fixed set supplying the names. That keeps the change mostly at the edges
(GUI, server storage, importers).

**Open points.**

- Whether to keep an escape hatch for a rare extra attribute (say
  caffeine), or accept that a new attribute means a code change.
- Migration of existing attributes in the database onto the fixed set.
- Tags (decision #37) are a separate question; they may still be worth
  keeping user-defined, since labels vary more between users than
  nutrients do.

## Possible order

A suggestion for discussion, each step needing its own design pass:

1. Decide theme 4 (fixed attributes), since importers and derived rules
   both depend on it, and add the energy rule (theme 3).
2. Implement products in the library and GUI as decision #32 designs
   them, plus a store/chain on the product or its price.
3. AI recipe import from images, as the first importer and the one with
   no third-party dependency.
4. Research which supermarket and nutrition/climate sources are usable,
   then design the connector interface around one real source rather
   than in the abstract.
