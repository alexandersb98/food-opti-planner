"""A library plan to result rows, without a database."""

from dataclasses import replace
from datetime import date
from decimal import Decimal

from meal_planner import (
    AttributeDef,
    Constraint,
    Day,
    Ingredient,
    IngredientAmount,
    Plan,
    PlanRequest,
    Recipe,
    Slot,
    SlotAssignment,
    SolveStatus,
    Violation,
    ViolationReport,
)
from server import freeze

OATS = Ingredient(name="Oats", unit="g", attributes={"Energy": Decimal("3.89")})
MILK = Ingredient(name="Milk", unit="ml", attributes={"Energy": Decimal("0.64")})
PORRIDGE = Recipe(name="Porridge", items=(IngredientAmount(OATS, Decimal("60")), IngredientAmount(MILK, Decimal("0.333333"))))
ATTRIBUTES = (AttributeDef("Energy", precision=0), AttributeDef("Protein", precision=1))
UNITS = {"Energy": "kcal", "Protein": "g"}
START = date(2026, 10, 26)


def request(days) -> PlanRequest:
    return PlanRequest(attributes=ATTRIBUTES, tags=(), recipes=(PORRIDGE,), days=days)


def totals(energy, protein="0"):
    return {"Energy": Decimal(energy), "Protein": Decimal(protein)}


def served(day, slot, multiplier, energy, protein="0"):
    return SlotAssignment(day, slot, "generated", "Porridge", Decimal(multiplier), totals(energy, protein))


def frozen(slots, day_totals, horizon, days, status=SolveStatus.OPTIMAL, meals=("Breakfast", "Lunch"), stopped=False,
           goals=(), constraints=(), violations=()):
    plan = Plan(status, Decimal(0), tuple(slots), tuple(day_totals), horizon, ViolationReport(tuple(violations)))
    return freeze.freeze(
        replace(request(days), constraints=tuple(constraints)), plan, START, list(meals), UNITS, list(goals), stopped=stopped
    )


TWO_DAYS = (Day((Slot(), Slot("absent"))), Day((Slot(), Slot()), min_meals_per_day=1))
SLOTS = [
    served(0, 0, "1.5", "350.5005", "12.25"),
    SlotAssignment(0, 1, "absent", None, None, totals("0")),
    served(1, 0, "1", "233.667"),
    SlotAssignment(1, 1, "generated", None, None, totals("0")),
]


def test_the_plan_keeps_its_dates_status_and_attributes():
    result = frozen(SLOTS, [totals("350.5005", "12.25"), totals("233.667")], totals("584.1675", "12.25"), TWO_DAYS)
    assert (result.saved, result.start_date, result.days, result.status) == (False, START, 2, "optimal")
    assert [(a.position, a.name, a.unit, a.decimals) for a in result.attributes] == [
        (0, "Energy", "kcal", 0),
        (1, "Protein", "g", 1),
    ]


def test_a_feasible_plan_is_one_where_time_ran_out():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS, SolveStatus.FEASIBLE)
    assert result.status == "time_ran_out"


def test_a_feasible_plan_from_a_cancelled_solve_is_stopped():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS, SolveStatus.FEASIBLE, stopped=True)
    assert result.status == "stopped"


def test_a_best_possible_plan_stays_optimal_when_cancelled_too_late():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS, stopped=True)
    assert result.status == "optimal"


def test_meals_keep_their_names_recipes_and_portions_in_schedule_order():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS)
    assert [(m.day, m.position, m.name, m.planned, m.recipe, m.portion) for m in result.meals] == [
        (0, 0, "Breakfast", True, "Porridge", Decimal("1.5")),
        (0, 1, "Lunch", False, None, None),
        (1, 0, "Breakfast", True, "Porridge", Decimal("1")),
        (1, 1, "Lunch", False, None, None),
    ]


def test_absent_and_unserved_slots_both_come_out_as_not_planned():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS)
    skipped = [m for m in result.meals if not m.planned]
    assert [(m.day, m.items) for m in skipped] == [(0, []), (1, [])]
    assert not [t for t in result.totals if t.meal in skipped]


def test_ingredients_are_scaled_to_the_portion_and_rounded_to_6_decimals():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS)
    breakfast = result.meals[0]
    # 0.333333 x 1.5 = 0.4999995: half away from zero.
    assert [(i.position, i.ingredient, i.unit, i.amount) for i in breakfast.items] == [
        (0, "Oats", "g", Decimal("90")),
        (1, "Milk", "ml", Decimal("0.500000")),
    ]
    assert breakfast.items[1].amount == Decimal("0.500000")
    assert result.meals[2].items[1].amount == Decimal("0.333333")


def test_totals_are_stored_as_returned_rounded_half_away_from_zero():
    """Meal, day and plan totals each come from the library, rounded to
    each attribute's decimals; none is added up again."""
    result = frozen(
        SLOTS,
        [totals("350.5005", "12.25"), totals("233.667", "-0.05")],
        totals("999.5", "0.45"),
        TWO_DAYS,
    )

    def values(meal=None, day=None):
        return [
            (t.attribute.name, t.value)
            for t in result.totals
            if t.meal is meal and t.day == day
        ]

    breakfast, _, second_breakfast, _ = result.meals
    assert values(meal=breakfast) == [("Energy", Decimal("351")), ("Protein", Decimal("12.3"))]
    assert values(meal=second_breakfast) == [("Energy", Decimal("234")), ("Protein", Decimal("0"))]
    assert values(day=0) == [("Energy", Decimal("351")), ("Protein", Decimal("12.3"))]
    assert values(day=1) == [("Energy", Decimal("234")), ("Protein", Decimal("-0.1"))]
    assert values() == [("Energy", Decimal("1000")), ("Protein", Decimal("0.5"))]
    assert all(t.day is None for t in result.totals if t.meal is not None)


def test_the_average_is_the_rounded_total_over_the_days_rounded_again():
    assert freeze.average(Decimal("1000"), 3, 0) == Decimal("333")
    assert freeze.average(Decimal("5"), 2, 0) == Decimal("3")
    assert freeze.average(Decimal("-5"), 2, 0) == Decimal("-3")
    assert freeze.average(Decimal("0.5"), 3, 1) == Decimal("0.2")


def goal_case(key, name, applies_to, attribute="Protein", must=False, min=None, max=None):
    """A goal and its constraint, as the server makes them: the constraint
    named by the goal's key."""
    scope, aggregate = {
        "day": ("day", None), "plan_total": ("horizon", "total"), "daily_average": ("horizon", "average_per_day"),
    }[applies_to]
    constraint = Constraint(
        name=key, attribute=attribute, scope=scope, aggregate=aggregate, min=min, max=max, hard=must,
        normalization_reference=Decimal(100),
    )
    return freeze.FrozenGoal(key, name, applies_to, must, min, max), constraint


def miss(constraint, day, side, bound, actual, amount, percent):
    return Violation(constraint, day, None, side, Decimal(bound), Decimal(actual), Decimal(amount), Decimal(percent))


def missing(goals_and_constraints, violations):
    goals, constraints = zip(*goals_and_constraints, strict=True)
    return frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS,
                  goals=goals, constraints=constraints, violations=violations)


def stored(result):
    return [
        (g.position, g.name, g.attribute.name, g.applies_to, g.must, g.min, g.max,
         [(m.day, m.side, m.bound, m.actual, m.amount, m.percent) for m in g.misses])
        for g in result.goals
    ]


def test_no_goals_is_no_goals_and_no_misses():
    result = frozen(SLOTS, [totals("0"), totals("0")], totals("0"), TWO_DAYS)
    assert result.goals == []


def test_goals_are_copied_in_order_with_their_attribute_and_name():
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("20")),
         goal_case("goal 2", "Energy cap", "plan_total", "Energy", True, max=Decimal("900"))],
        [],
    )
    assert stored(result) == [
        (0, "Protein per day", "Protein", "day", False, Decimal("20"), None, []),
        (1, "Energy cap", "Energy", "plan_total", True, None, Decimal("900"), []),
    ]
    assert result.goals[1].attribute is result.attributes[0]


def test_misses_are_matched_to_goals_by_key():
    result = missing(
        [goal_case("goal 1", "goal 2", "day", min=Decimal("20")),
         goal_case("goal 2", "goal 1", "day", min=Decimal("30"))],
        [miss("goal 2", 0, "below", "30", "10", "20", "66.7")],
    )
    assert [len(g.misses) for g in result.goals] == [0, 1]
    assert result.goals[1].misses[0].bound == Decimal("30")


def test_a_day_goals_misses_are_stored_per_day():
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("20"))],
        [miss("goal 1", 0, "below", "20", "12.25", "7.75", "7.75"),
         miss("goal 1", 1, "below", "20", "0", "20", "20")],
    )
    assert stored(result)[0][7] == [
        (0, "below", Decimal("20"), Decimal("12.3"), Decimal("7.8"), Decimal("7.8")),
        (1, "below", Decimal("20"), Decimal("0"), Decimal("20"), Decimal("20")),
    ]


def test_a_plan_total_miss_has_no_day():
    result = missing(
        [goal_case("goal 1", "Energy, plan total", "plan_total", "Energy", max=Decimal("500"))],
        [miss("goal 1", None, "above", "500", "584.1675", "84.1675", "16.83")],
    )
    assert stored(result)[0][7] == [(None, "above", Decimal("500"), Decimal("584"), Decimal("84"), Decimal("16.8"))]


def test_a_daily_average_miss_over_the_plan_is_divided_by_the_days():
    result = missing(
        [goal_case("goal 1", "Protein, daily average", "daily_average", min=Decimal("20"))],
        [miss("goal 1", None, "below", "40", "12.25", "27.75", "69.4")],
    )
    # 2 days: bound 20, actual 6.125, amount 13.875, each to 1 decimal; percent as it is.
    assert stored(result)[0][7] == [
        (None, "below", Decimal("20"), Decimal("6.1"), Decimal("13.9"), Decimal("69.4"))
    ]


def test_a_day_guard_rail_miss_is_the_goals_miss_on_its_day():
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("20")),
         goal_case("goal 2", "Protein, daily average", "daily_average", min=Decimal("20"))],
        [miss("goal 2 (day guard-rail)", 1, "below", "20", "5", "15", "75")],
    )
    # A day's numbers are per day already.
    assert [g[7] for g in stored(result)] == [[], [(1, "below", Decimal("20"), Decimal("5"), Decimal("15"), Decimal("75"))]]


def test_serving_cap_violations_are_not_misses():
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("20"))],
        [miss("serving cap: Porridge", None, "above", "3", "4", "1", "33.3")],
    )
    assert stored(result)[0][7] == []


def test_misses_are_rounded_half_away_from_zero_and_percent_to_one_decimal():
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("20"))],
        [miss("goal 1", 0, "below", "20", "0.25", "19.75", "98.75"),
         miss("goal 1", 1, "below", "20", "0.05", "19.95", "99.25")],
    )
    assert [m[2:] for m in stored(result)[0][7]] == [
        (Decimal("20"), Decimal("0.3"), Decimal("19.8"), Decimal("98.8")),
        (Decimal("20"), Decimal("0.1"), Decimal("20"), Decimal("99.3")),
    ]


def test_a_miss_that_rounds_to_nothing_at_the_attributes_decimals_is_dropped():
    # Protein has 1 decimal here; the library's totals carry more.
    result = missing(
        [goal_case("goal 1", "Protein per day", "day", min=Decimal("120"))],
        [miss("goal 1", 0, "below", "120", "119.96", "0.04", "0.03"),
         miss("goal 1", 1, "below", "120", "119.95", "0.05", "0.04")],
    )
    assert [(m[0], m[4]) for m in stored(result)[0][7]] == [(1, Decimal("0.1"))]


def test_a_goal_named_like_a_guard_rail_or_a_serving_cap_gets_no_others_misses():
    result = missing(
        [goal_case("goal 1", "X", "daily_average", min=Decimal("20")),
         goal_case("goal 2", "X (day guard-rail)", "day", min=Decimal("20")),
         goal_case("goal 3", "serving cap: Porridge", "day", min=Decimal("20"))],
        [miss("goal 1 (day guard-rail)", 0, "below", "20", "5", "15", "75"),
         miss("serving cap: Porridge", None, "above", "3", "4", "1", "33.3")],
    )
    assert [len(g.misses) for g in result.goals] == [1, 0, 0]
