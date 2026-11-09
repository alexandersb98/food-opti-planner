# GUI, first version — Screens and How They Map to the Library

**Status:** Wireframes agreed with the user over several rounds; awaiting
spec review.

**Path:** Architectural (new subsystem: the first user interface).

**Context:** The `meal_planner` library (slice A,
[`2026-10-13-meal-planner-core-design.md`](2026-10-13-meal-planner-core-design.md))
has no UI, CLI or persistence (decision #12). This spec designs the first
GUI on top of it. It covers what the screens show and how each field
becomes part of a `PlanRequest`. It does not choose a web framework,
the server/library boundary or storage; those belong in the
implementation plan.

**Wireframes:** the agreed screens are on a design canvas,
<https://claude.ai/artifact/4aNFTai9BGgF2EgztRvPz9> (private to the
owner). Screen ids below (A1, C2, ...) match the canvas.

## Decisions

1. **Mobile-first web app.** Designed at phone width (390 px). Larger
   screens get the same layout, centred.
2. **Navigation: a hamburger menu** with five pages: Plan, Recipes,
   Ingredients, Attributes, Tags (C0). Each entry shows a count.
   (The units spec adds a sixth, Settings, last, with no count.)
3. **Plan setup is one overview screen with an editor per part**
   (A1), not a step-by-step wizard. The wizard was considered and
   dropped: plans are usually re-run after changing one goal, and the
   overview keeps every setting one tap away.
4. **Constraints are called "goals" in the GUI.** Hard is **Must**, soft
   is **Prefer**.
5. **Technical knobs sit behind an Advanced section** with library
   defaults; the main form stays simple.
6. **English only for now.** All GUI text is kept as translatable
   resources; Swedish comes later (see `future-features.md`).
7. **Some data exists only in the GUI** (see "GUI-only data" below):
   meal names, attribute units, the plan's start date, an ingredient's
   value basis.

## Screens: plan setup

### A1 · Plan overview

Cards, top to bottom, each opening its editor:

- **Schedule:** date range, meals per day, number of skipped meals, and
  a small grid of dots (weekday × meal; filled = planned, dashed =
  skipped).
- **Goals:** one row per goal: attribute, range in words ("at least
  120 g", "1 800–2 200 kcal"), scope ("Each day", "Whole plan · total",
  "Whole plan · daily average"), and a chip: "Must" or "Prefer" with
  its importance as dots. "+ Add goal" at the end.
- **Recipes:** "142 of 200 recipes can be used" plus a chip per active
  tag filter ("Never: contains-nuts", "Only: vegetarian").
- **Max solving time:** default 30 s (`solve_time_limit`).
- A fixed **Make plan** button at the bottom.

### A2 · Schedule

- **Starts:** a calendar date; days are labelled "Mon 21", "Tue 22", ...
- **Number of days:** stepper.
- **Meals each day:** the meal names (default Breakfast, Lunch, Dinner),
  edited on a small sub-screen (add, rename, reorder; not drawn).
- **Grid** of days × meals: tap a cell to switch between *plan* and
  *skip*. An **At least** column per day holds the minimum number of
  meals ("all" by default).

Maps to: one `Day` per row; each cell a `Slot("generated")` or
`Slot("absent")`; "At least" → `min_meals_per_day` ("all" → `None`,
decision #20).

### A3 · Goal editor (bottom sheet)

Main form:

| Field | Library |
|---|---|
| What to track (list of attributes) | `attribute` |
| Range: Min, Max (either may be empty) | `min`, `max` (at least one required, decision #21) |
| Applies to: Each day / Plan total / Daily average | `scope="day"` / `scope="horizon", aggregate="total"` / `scope="horizon", aggregate="average_per_day"` |
| How strict: Must / Prefer | `hard=True` / `hard=False` |
| Importance 1–5 (Prefer only) | `weight`, see "Importance" below |

**Zero bound (A3c).** When a bound is 0, a highlighted field appears
under Range: "Count a miss as a percentage of [25] g", with a one-line
example. It maps to `normalization_reference`, which the library
requires in that case (decision #17). It is not shown otherwise.

**Advanced (A3b), collapsed by default:**

- **Goal name** → `name`. Filled in from the attribute and *Applies to*
  ("Protein per day", "Cost, plan total", "Energy, daily average") and
  kept in step with them until the user edits it; after that the user's
  text stays. Names must be unique (`request.py`), so a second goal on
  the same thing gets " (2)".
- **Different importance below and above** (Prefer only, and only when
  both Min and Max are set): two importance sliders →
  `weight_below`, `weight_above`.
- **Also keep each day in range** (Daily average only): on by default →
  `add_day_guardrail`; its own importance slider → `guardrail_weight`
  (decision #18).

`relaxable` is not shown (unused until RELAX mode).

### A4 · Recipe filters

One row per tag with three buttons: **Any / Only / Never**. "Only" puts
the tag in `require_tags`, "Never" in `exclude_tags`. A live count shows
how many recipes are left, with a link to the list.

### A5 · Must goals clash

When STRICT mode is infeasible, the overview shows a red **No plan
possible** card at the top, listing each hard constraint in the conflict
report:

- its name and where it clashes ("clashes on Wed 23" for day scope,
  "whole plan" for horizon scope);
- its bound as an editable field, so it can stay Must with a looser
  bound; a goal with both Min and Max shows both (the report does not
  say which side clashed);
- a **Make Prefer** button.

A **Try again** button re-runs the plan. The clashing goals are also
marked red in the goals list. Both limits of the report (no suggested
bound, no side) are in `future-features.md`.

The results screen itself (the meal plan, missed Prefer goals) is not
part of this spec; it is designed in
[`2026-10-25-gui-results-screen-design.md`](2026-10-25-gui-results-screen-design.md).

## Screens: catalog

### C1 · Recipes and C3 · Ingredients (lists)

Search, quick tag filter chips (recipes), one row per item with key
facts (recipes: kcal, protein, cost per portion and tags; ingredients:
values per their basis and how many recipes use them), and a round
**+** button to add.

### C2 · Edit recipe

- **Name.**
- **Ingredients, for 1 portion:** ingredient, amount, its unit, remove.
  "+ Add ingredient" opens a searchable picker (not drawn). → `items`
  (`IngredientAmount`).
- **Per portion:** attribute totals at 1×, worked out live and
  read-only (decision #22).
- **Tags:** on/off buttons, as on the ingredient (C4). Tags from the
  ingredients (derived by each tag's rule) are on and can't be turned
  off; the others are added by hand → `extra_tags`.
- **Portion size:** From ×, To × → `min_multiplier`, `max_multiplier`;
  *Any amount / In steps* with a step → `multiplier_step` (`None` for
  any amount). Advanced: the hard upper limit (`hard_max_multiplier`,
  default 3× the soft one, decision #38) and the over-size penalty
  (`serving_cap_weight`).
- **Delete recipe.**

### C4 · Edit ingredient

- **Name**, **Measured in** (a combo box of units grouped by category,
  preferred first, free text allowed) → `unit`.
- **Values per [100] g:** the value basis (default 100 for a mass or
  volume unit, 1 otherwise), then one row per attribute. The library value is the typed
  value divided by the basis. An empty value counts as 0, as in the
  library.
- **Tags:** on/off buttons → `tags`.
- **Changing the unit** of a saved ingredient asks first: "Oats: the basis
  and 4 recipe amounts will be converted from g to kg (× 0.001)." with
  **Cancel** and **Convert** (**Change unit** when another category or free
  text keeps the numbers; no dialog for another spelling). A refused
  conversion shows under **Measured in** and the form stays open.
- **Used in N recipes · Show.** **Delete** is disabled while any recipe
  uses the ingredient.

### C5 · Attributes

A list; a row opens in place to edit **Name**, **Unit** (GUI-only; the same
combo box, with the help text "The amount per the ingredient's basis, e.g.
g or kcal.") and **Decimals** (→ `precision`). Changing the unit of a saved
attribute asks first, in the same dialog ("Iron: 12 ingredient values and 2
goals will be converted from mg to µg (× 1000)."); a refusal, such as a goal
bound that needs more decimals, shows under **Unit**. Delete warns how many ingredient values
and goals it removes, then removes them. `accrues_on` is not shown (it
has no effect yet, decision #28). "+ New attribute".

### C6 · Tags

A list; a row opens in place to edit **Name** and the rule "A recipe
gets this tag when **all ingredients have it** / **any ingredient has
it**" → `TagDef.derive` `"all"` / `"any"` (decision #37). Tags no
ingredient has are labelled "added by hand". Delete warns, then removes
the tag from ingredients, recipes and plan filters. "+ New tag".
A source tag (made from a data source's food group) shows a dot in its
source's colour and the source's name in its caption; its open form has no
Name input and no Delete, only the rule and Done. Tags made by hand are
listed first, then the source tags.

### S1 · Settings

Cards: **Preferred units** (mass, volume, energy drop-downs, saved on
choosing) and **Data sources**, one row per loaded source with a colour dot,
name and "Version … · N foods", each opening S2; "No data sources loaded."
when there are none. The two cards load independently, so one failing never
hides the other.

### S2 · Data source (read-only until D3)

A full page with a back arrow to Settings. The source's **Version**,
**Imported** time and **Attribution** (when it has one); a **Colour**
picker, saved when the picker closes; and the **Columns**: a count, a search
box and the list (name, unit), withdrawn columns last, greyed and marked "No
longer in the source".

## Importance

The GUI shows importance as 1–5. It maps to a weight by doubling from
the library default in the middle:

| Importance | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Weight | 0.25 | 0.5 | 1.0 | 2.0 | 4.0 |

So the default weight (1.0) is importance 3, and the guard-rail's
default of half the goal's weight is one step lower. A weight entered
outside the GUI that is not on this scale shows as the nearest step.

## GUI-only data

The library does not have these; the GUI stores them next to the
library objects and leaves them out of the `PlanRequest`:

| Data | Used for |
|---|---|
| Meal names, per meal position | Schedule labels |
| Plan start date | Day labels (ready for weekday and date constraints in `future-features.md`) |
| Attribute unit | Labels in forms, lists and goals |
| Ingredient value basis | Turning typed label values into per-unit values |

## Not in this spec

- The results screen (plan, totals, violation report).
- Storage, saving between sessions, and the database (the persistence
  item in `future-features.md`).
- Framework, server and how the GUI calls the library (decided in
  [`2026-10-22-gui-tech-stack-design.md`](2026-10-22-gui-tech-stack-design.md)).
- Visual style: the wireframes are deliberately grey.

## Defaults chosen without a user decision

The user accepted the screens as a first version; these were proposed
and not discussed further:

- Deleting an ingredient in use is blocked; deleting an attribute or a
  tag in use is allowed after a warning and cascades.
- Recipes are entered for one portion; a "serves N" field is a future
  feature.
- The importance scale above.
