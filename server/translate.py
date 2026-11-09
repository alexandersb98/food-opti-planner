"""Stored data to library objects: the GUI's mapping rules, in one place.

Pure functions of model objects, with no database or HTTP, so each rule has
its own plain test.
"""

from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from meal_planner import (
    AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest, Recipe, Slot, TagDef, recipe_passes,
)

from . import line_units, models


def attribute(row: models.Attribute) -> AttributeDef:
    """`decimals` is the library's precision; `unit` is GUI-only."""
    return AttributeDef(name=row.name, precision=row.decimals)


@dataclass(frozen=True)
class LibraryTags:
    """The tags as the library sees them: every group of equivalent tags
    (decision 13) is one tag. `names` maps a stored tag's name to its library
    name (itself when it is in no group); `defs` are the library's tags: the
    ungrouped ones in tag order, then one per group in group id order."""

    names: Mapping[str, str]
    defs: tuple[TagDef, ...]

    def map(self, names: Iterable[str]) -> frozenset[str]:
        """The library names of a set of stored tag names."""
        return frozenset(self.names.get(name, name) for name in names)


def library_tags(tags: Sequence[models.Tag]) -> LibraryTags:
    """A group's library name is "group {id}", with "*" added while a stored
    tag has that name, so it can never clash. Its rule is its members' rule,
    which `server/tag_groups.py` keeps equal."""
    stored = {row.name for row in tags}
    names = {row.name: row.name for row in tags}
    grouped: dict[int, list[models.Tag]] = {}
    for row in tags:
        if row.group_id is not None:
            grouped.setdefault(row.group_id, []).append(row)
    defs = [tag(row) for row in tags if row.group_id is None]
    for group_id in sorted(grouped):
        name = f"group {group_id}"
        while name in stored:
            name += "*"
        for row in grouped[group_id]:
            names[row.name] = name
        defs.append(TagDef(name=name, derive=grouped[group_id][0].derive))
    return LibraryTags(names, tuple(defs))


def ingredient(row: models.Ingredient, names: Mapping[str, str] | None = None) -> Ingredient:
    """Values are typed per `basis` units ("per 100 g"); the library's are per
    one unit, so each is divided by the basis. An attribute with no value is
    left out, which the library counts as 0. Tag names go through `names`
    (`LibraryTags.names`) when given, else stay as stored."""
    return Ingredient(
        name=row.name,
        unit=row.unit,
        attributes={v.attribute.name: v.value / row.basis for v in row.values},
        tags=frozenset((names or {}).get(tag.name, tag.name) for tag in row.tags),
    )


def tag(row: models.Tag) -> TagDef:
    return TagDef(name=row.name, derive=row.derive)


class UnconvertibleLine(ValueError):
    """A recipe line whose unit does not convert to its ingredient's. Saving a
    recipe and changing an ingredient keep this from happening, so it is a bug
    when it does."""


def own_unit_amount(item: models.RecipeItem) -> Fraction:
    """The line's amount in its ingredient's own unit, exactly: the amount
    times the factor of `line_units.route`."""
    amount = line_amount(item)
    if amount is None:
        ingredient = item.ingredient
        raise UnconvertibleLine(f"{item.amount} {item.unit} of {ingredient.name} does not convert to {ingredient.unit}")
    return amount


def line_amount(item: models.RecipeItem) -> Fraction | None:
    """`own_unit_amount`, or None for a line that does not convert."""
    ingredient = item.ingredient
    found = line_units.route(item.unit, ingredient.unit, [(c.unit, c.factor) for c in ingredient.conversions])
    return None if found is None else Fraction(item.amount) * found.factor


def converts(row: models.Recipe) -> bool:
    """Whether every line of the recipe converts to its ingredient's unit. A
    saved recipe always does; one that does not (a catalogue unit changed in a
    deploy, a restored or hand-edited database) is left out of plans and shown
    as needing attention, instead of failing everything."""
    return all(
        line_units.route(line.unit, line.ingredient.unit, [(c.unit, c.factor) for c in line.ingredient.conversions])
        is not None
        for line in row.lines
    )


def _decimal(exact: Fraction) -> Decimal:
    # Exact for a whole number or a terminating fraction of 28 digits, else
    # the default context's 28 significant digits.
    return Decimal(exact.numerator) / Decimal(exact.denominator)


def recipe(row: models.Recipe, names: Mapping[str, str] | None = None) -> Recipe:
    """Amounts are for one portion, in each ingredient's own unit, as the
    library's: each line converted (`own_unit_amount`) and summed exactly per
    ingredient, divided once by the servings, one amount per ingredient in the
    order of its first line. Tags added by hand become `extra_tags`; the others the library derives.
    No hard upper limit means the library's default, 3 times the soft one.
    Tag names go through `names` as in `ingredient`."""
    totals: dict[models.Ingredient, Fraction] = {}
    for line in row.lines:
        totals[line.ingredient] = totals.get(line.ingredient, Fraction(0)) + own_unit_amount(line)
    servings = Fraction(row.servings)
    return Recipe(
        name=row.name,
        items=tuple(
            IngredientAmount(ingredient(stored, names), _decimal(amount / servings)) for stored, amount in totals.items()
        ),
        extra_tags=frozenset((names or {}).get(tag.name, tag.name) for tag in row.extra_tags),
        multiplier_step=row.step,
        min_multiplier=row.min_multiplier,
        max_multiplier=row.max_multiplier,
        hard_max_multiplier=row.hard_max_multiplier,
        serving_cap_weight=row.serving_cap_weight,
    )


def usable_recipes(
    recipes: Sequence[models.Recipe], tags: Sequence[models.Tag], only: Collection[str], never: Collection[str]
) -> list[models.Recipe]:
    """The recipes left after the filters, in order: those with every tag in
    `only` and none in `never`, tags by name, derived ones too. The library's
    rule (`recipe_passes`), without the whole valid request
    `PlanRequest.eligible_recipes` needs. Equivalent tags count as one
    (`library_tags`)."""
    library = library_tags(tags)
    tag_defs = {d.name: d for d in library.defs}
    only, never = library.map(only), library.map(never)
    return [row for row in recipes if recipe_passes(recipe(row, library.names).tags(tag_defs), only, never)]


def filter_names(plan: models.Plan, mode: str) -> frozenset[str]:
    """The names of the tags the plan's filters set to `mode`."""
    return frozenset(f.tag.name for f in plan.tag_filters if f.mode == mode)


def days(plan: models.Plan) -> tuple[Day, ...]:
    """One `Day` per row of the grid, with a slot per meal in meal order:
    planned is `Slot("generated")`, skipped `Slot("absent")`. A day without
    a minimum serves all its planned meals (`min_meals_per_day=None`)."""
    meals = sorted(plan.meals, key=lambda meal: meal.position)
    skipped = [{skip.day for skip in meal.skips} for meal in meals]
    minimums = {minimum.day: minimum.at_least for minimum in plan.minimums}
    return tuple(
        Day(
            slots=tuple(Slot("absent" if day in cells else "generated") for cells in skipped),
            min_meals_per_day=minimums.get(day),
        )
        for day in range(plan.days)
    )


# A Prefer goal's importance (1-5) as the library's weight.
IMPORTANCE_WEIGHTS = {
    1: Decimal("0.25"),
    2: Decimal("0.5"),
    3: Decimal(1),
    4: Decimal(2),
    5: Decimal(4),
}


# A Must goal's day guard-rail without its own importance. The goal's own
# importance is hidden while it is Must, so it must not set the guard-rail's.
MUST_GUARD_RAIL_IMPORTANCE = 2


def needs_zero_reference(
    applies_to: str, must: bool, day_guard_rail: bool, min: Decimal | None, max: Decimal | None
) -> bool:
    """Whether the library wants a reference: a bound is 0 or below and a soft
    penalty is built from it (without one the library uses the bound itself,
    and a negative bound would give the penalty a negative weight, a reward).
    That is a Prefer goal, or a daily average with its day guard-rail, which
    is soft also for a Must goal."""
    soft = not must or (applies_to == "daily_average" and day_guard_rail)
    return soft and any(bound is not None and bound <= 0 for bound in (min, max))


def _generated_name(goal: models.Goal) -> str:
    attribute = goal.attribute.name
    if goal.applies_to == "plan_total":
        return f"{attribute}, plan total"
    if goal.applies_to == "daily_average":
        return f"{attribute}, daily average"
    return f"{attribute} per day"


def goal_names(goals: Sequence[models.Goal]) -> list[str]:
    """Each goal's name, in goal order: the one the user typed, or "Protein
    per day", "Protein, plan total", "Protein, daily average". A generated
    name gets " (2)" on its second use, " (3)" on its third, and skips any
    number whose name is taken already, by a typed name or an earlier
    generated one. Typed names differ from each other (the API checks)."""
    taken = {goal.name for goal in goals if goal.name is not None}
    uses: dict[str, int] = {}
    names = []
    for goal in goals:
        if goal.name is not None:
            names.append(goal.name)
            continue
        generated = _generated_name(goal)
        n = uses.get(generated, 0)
        while True:
            n += 1
            name = generated if n == 1 else f"{generated} ({n})"
            if name not in taken:
                break
        uses[generated] = n
        taken.add(name)
        names.append(name)
    return names


def named_goals(goals: Sequence[models.Goal]) -> list[tuple[models.Goal, str]]:
    """Each goal with its name (`goal_names`), in goal order."""
    return list(zip(goals, goal_names(goals), strict=True))


def constraint_key(position: int) -> str:
    """The library's name for the goal at `position` (from 0): "goal 1",
    "goal 2", ... Not the goal's name, so no name a user types can clash
    with the library's own ("goal 1 (day guard-rail)", "serving cap: Oats");
    the key leads a violation back to its goal."""
    return f"goal {position + 1}"


def goal_position(key: str) -> int | None:
    """The place (from 0) of the goal `key` names (`constraint_key`), or None
    for a name that is not a goal's."""
    number = key.removeprefix("goal ")
    if number == key or not number.isdecimal() or number.startswith("0"):
        return None
    return int(number) - 1


# The library's name for a day's meals that must be served, its "At least"
# or all planned meals (`Day.min_meals_per_day`), in a conflict report.
DAY_MINIMUM = "min_meals_per_day"


def guard_rail_importance(goal: models.Goal) -> int:
    """A daily average's day guard-rail importance: its own, or else one step
    below the goal's (the higher side's, with importance below and above),
    at least 1, for a Prefer goal, and 2 for a Must goal. The editor shows the
    same (`guardRailImportance` in the app)."""
    if goal.guard_rail_importance is not None:
        return goal.guard_rail_importance
    if goal.must:
        return MUST_GUARD_RAIL_IMPORTANCE
    sides = [goal.importance if side is None else side for side in (goal.importance_below, goal.importance_above)]
    return max(1, max(sides) - 1)


def _weight(importance: int | None) -> Decimal | None:
    return None if importance is None else IMPORTANCE_WEIGHTS[importance]


def constraint(goal: models.Goal, key: str) -> Constraint:
    """`applies_to` becomes scope and aggregate, Must becomes hard and the
    importance the weight; the importance below and above, when given, the
    weight of each side. A daily average's day guard-rail is on or off, with
    the weight of `guard_rail_importance`. Other goals keep the library's
    defaults, which they don't use."""
    horizon = goal.applies_to != "day"
    aggregate = {"plan_total": "total", "daily_average": "average_per_day"}.get(goal.applies_to)
    guard_rail, guard_rail_weight = True, None
    if goal.applies_to == "daily_average":
        guard_rail = goal.day_guard_rail
        if guard_rail:
            guard_rail_weight = IMPORTANCE_WEIGHTS[guard_rail_importance(goal)]
    return Constraint(
        name=key,
        attribute=goal.attribute.name,
        scope="horizon" if horizon else "day",
        aggregate=aggregate,
        min=goal.min,
        max=goal.max,
        hard=goal.must,
        weight=IMPORTANCE_WEIGHTS[goal.importance],
        weight_below=_weight(goal.importance_below),
        weight_above=_weight(goal.importance_above),
        normalization_reference=goal.zero_reference,
        add_day_guardrail=guard_rail,
        guardrail_weight=guard_rail_weight,
    )


def plan_request(
    plan: models.Plan,
    attributes: Sequence[models.Attribute],
    tags: Sequence[models.Tag],
    recipes: Sequence[models.Recipe],
) -> PlanRequest:
    """The whole catalog, the schedule, the goals, each keyed by its place
    (`constraint_key`), and the recipe filters, Only as `require_tags` and
    Never as `exclude_tags`. Every group of equivalent tags is one library
    tag (`library_tags`), also in the filters."""
    library = library_tags(tags)
    return PlanRequest(
        attributes=tuple(attribute(row) for row in attributes),
        tags=library.defs,
        recipes=tuple(recipe(row, library.names) for row in recipes),
        days=days(plan),
        constraints=tuple(constraint(goal, constraint_key(i)) for i, goal in enumerate(plan.goals)),
        require_tags=library.map(filter_names(plan, "only")),
        exclude_tags=library.map(filter_names(plan, "never")),
        solve_time_limit=plan.solve_time_limit,
    )
