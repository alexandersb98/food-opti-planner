# Meal Planner

A planner that picks recipes, and how much of each, for the meals of a stretch of days so that goals on what you eat (nutrients, cost and the like) are met as well as possible.

## Planning

**Plan setup**:
Everything a plan is made from apart from the catalogue: the schedule, the goals, the recipe filters and the time allowed. There is one plan setup at a time.
_Avoid_: plan, brief

**Plan**:
One result of planning: a recipe and an amount for each meal of the plan period, with the totals and misses that follow.
_Avoid_: plan result, menu

**Saved plan**:
A plan that has been kept. At most one plan is unsaved at a time.
_Avoid_: archived plan, plan result

**Plan period**:
The consecutive days a plan covers, from one to 31.
_Avoid_: horizon, whole plan, week

**Recipe filter**:
A tag set to Only (keep only recipes with it) or Never (drop recipes with it) for planning.
_Avoid_: rule tag, pantry rule

**Time allowed**:
How long the planner may search for a better plan before it returns the best one found.
_Avoid_: solve time limit, max solving time

**Today's plan**:
The saved plan most recently chosen for use that covers today's date.

## Goals

**Goal**:
A lower and/or upper bound on the total of one attribute: the solver's constraint, as the user states it.
_Avoid_: constraint, target

**Must**:
A goal that has to hold; if it cannot, there is no plan (a hard constraint).
_Avoid_: hard

**Prefer**:
A goal that is weighed against the other Prefer goals; missing it costs, but does not stop a plan (a soft constraint).
_Avoid_: soft

**Importance**:
How much a Prefer goal counts against the others, from 1 to 5, possibly different below and above its bounds (the solver's weight).
_Avoid_: weight, priority

**Applies to**:
What a goal's bounds are measured on: each day, the plan total, or the daily average over the plan period (the solver's scope and aggregate).
_Avoid_: scope, aggregate

**Day guard-rail**:
For a daily-average goal, a Prefer bound that also keeps each single day in range.
_Avoid_: guardrail, day guardrail

**Zero reference**:
The amount a goal's misses are measured as a percentage of, needed when a Prefer bound is zero or below (the solver's normalization reference).
_Avoid_: normalization reference

**Miss**:
How far a plan falls short of or goes over a Prefer goal's bound (the solver's violation).
_Avoid_: violation, deviation

**Clash**:
A smallest set of Must goals and day minimums that cannot all hold at once, shown instead of a plan (the solver's conflict report).
_Avoid_: conflict, infeasibility

## Catalogue

**Attribute**:
A number tracked for every ingredient and summed over recipes and plans, such as protein, energy or cost. Goals are set on attributes.
_Avoid_: nutrient (only one kind of attribute), measure

**Ingredient**:
Something recipes are made of, measured in one unit of its own and holding a value for each attribute.
_Avoid_: food, item

**Value basis**:
The amount of an ingredient that its attribute values are given for, such as 100 g.
_Avoid_: basis amount, reference amount

**Ingredient value**:
An ingredient's number for one attribute, per value basis. A missing value counts as zero.

**Tag**:
A yes/no label on ingredients, which recipes then get from their ingredients.
_Avoid_: label, category

## Recipes

**Recipe**:
A dish with fixed amounts of ingredients for the whole recipe, which serves a number of portions.
_Avoid_: dish

**Section**:
An ordered part of a recipe's lines, with an optional heading such as "For the sauce".

**Line**:
One amount of one ingredient in a recipe, in a unit that converts to the ingredient's. The same ingredient may appear on several lines.
_Avoid_: item, ingredient amount

**Usable recipe**:
A recipe the planner may pick: it passes the recipe filters and all its lines convert.
_Avoid_: eligible recipe, recipe in play

**Portion**:
One person's share of a recipe, as cookbooks count it.

**Serves**:
How many portions the recipe's amounts make, as in "serves 4".
_Avoid_: servings, yield

**Left-out line**:
A line of an imported recipe that is set aside during review and not saved.
_Avoid_: skipped line

## Units

**Unit catalogue**:
The units the app knows, each with an exact factor to its category's base unit. Any other text can still be used as a unit, but converts to nothing.
_Avoid_: catalog

**Unit category**:
A family of units that convert to each other: mass, volume or energy.
_Avoid_: dimension, unit group

**Preferred unit**:
The unit of each category that new ingredients and attributes start in.

**Conversion**:
A per-ingredient equivalence between another unit and the ingredient's own, such as "1 dl = 40 g".
_Avoid_: unit factor, density

## Data sources

**Data source**:
A read-only reference table of numbers per food, such as Livsmedelsverket's, that ingredients can be linked to and copy values from. Always written in full.
_Avoid_: source

**Source value**:
A data source's number for one of a linked ingredient's attributes, as it was when last copied.

**Column**:
One kind of number a data source gives, such as "Protein"; it can be mapped to an attribute.

**Mapping**:
The link from a data source's column to an attribute, which says where that attribute's source values come from.

**Source tag**:
A tag that comes from one of a data source's food groups. It cannot be renamed or deleted.

## Solver terms

The solver library (`meal_planner/`) uses general optimisation words. Each maps to one term above.

| Solver | Glossary term |
|---|---|
| constraint | Goal |
| hard / soft | Must / Prefer |
| weight, weight_below / weight_above | Importance |
| scope (day / horizon), aggregate (total / average_per_day) | Applies to |
| horizon | Plan period |
| guardrail | Day guard-rail |
| require_tags / exclude_tags | Recipe filter (Only / Never) |
| eligible recipes | Usable recipe |
| normalization reference | Zero reference |
| violation | Miss |
| conflict report | Clash |

## UI language

The web app, The Weekly Table, is laid out like a printed weekly. Its words are presentation only; each maps to a term above.

| UI | Glossary term |
|---|---|
| This week's brief | Plan setup |
| The Menu | Plan |
| The archive, Filed | Saved plans, saved |
| Colophon ("How the week turned out") | The plan's goals met and misses, with its totals |
| Editor's note | Clash |
| The recipe index | Recipes |
| spread | One recipe's page |
| rule tag | Recipe filter |
