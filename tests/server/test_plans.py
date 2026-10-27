"""The plan setup's checks and update, without a database or HTTP. The
routes' own tests (`test_plan`) cover each rule through the API."""

from datetime import date
from decimal import Decimal

from server import models, plans

ENERGY = models.Attribute(id=1, name="Energy", unit="kcal", decimals=0)
VEGAN = models.Tag(id=1, name="vegan", derive="all")
ATTRIBUTES = {ENERGY.id: ENERGY}
TAGS = {VEGAN.id: VEGAN}


def stored_plan(goals=()) -> models.Plan:
    return models.Plan(
        id=1,
        start_date=date(2026, 10, 27),
        days=7,
        meals=[models.PlanMeal(id=10, position=0, name="Lunch"), models.PlanMeal(id=11, position=1, name="Dinner")],
        minimums=[],
        goals=list(goals),
        tag_filters=[],
        solve_time_limit=30,
    )


def setup(**changes) -> plans.PlanFields:
    fields = {
        "start_date": date(2026, 10, 27),
        "days": 7,
        "meals": [{"id": 10, "name": "Lunch"}, {"id": 11, "name": "Dinner"}],
        "skips": [],
        "minimums": [],
        "goals": [],
        "tag_filters": [],
        "solve_time_limit": 30,
    }
    return plans.PlanFields.model_validate({**fields, **changes})


def goal(**changes) -> dict:
    return {"attribute_id": ENERGY.id, "min": "1800", "applies_to": "day", "must": False, "importance": 3, **changes}


def errors(plan: models.Plan, fields: plans.PlanFields) -> list[tuple[list, str]]:
    return [(e.loc, e.type) for e in plans.errors(plan, fields, ATTRIBUTES, TAGS)]


def test_a_valid_setup_has_no_errors():
    fields = setup(skips=[{"day": 0, "meal": 1}], minimums=[{"day": 0, "at_least": 1}], goals=[goal()],
                   tag_filters=[{"tag_id": VEGAN.id, "mode": "only"}])
    assert errors(stored_plan(), fields) == []


def test_every_error_is_reported_at_once_in_the_body():
    fields = setup(
        meals=[{"id": 99, "name": "Lunch"}, {"name": "Lunch"}],
        minimums=[{"day": 0, "at_least": 3}],
        goals=[goal(attribute_id=99)],
        tag_filters=[{"tag_id": 99, "mode": "never"}],
    )
    assert errors(stored_plan(), fields) == [
        (["body", "meals", 0, "id"], "unknown_meal"),
        (["body", "meals", 1, "name"], "duplicate"),
        (["body", "minimums", 0, "at_least"], "above_planned"),
        (["body", "goals", 0, "attribute_id"], "unknown_attribute"),
        (["body", "tag_filters", 0, "tag_id"], "unknown_tag"),
    ]


def test_a_stored_goal_is_not_held_to_a_later_cut_in_its_attributes_decimals():
    stored = models.Goal(id=5, attribute_id=ENERGY.id, min=Decimal("1800.5"), max=None)
    plan = stored_plan(goals=[stored])
    assert errors(plan, setup(goals=[goal(id=5, min="1800.5")])) == []
    assert errors(plan, setup(goals=[goal(id=5, min="1800.25")])) == [
        (["body", "goals", 0, "min"], "too_many_decimals")
    ]


def test_filter_errors_name_unknown_and_repeated_tags():
    filters = [plans.TagFilter(tag_id=VEGAN.id, mode="only"), plans.TagFilter(tag_id=VEGAN.id, mode="never")]
    assert [(e.loc, e.type) for e in plans.filter_errors(filters, TAGS)] == [
        (["body", "tag_filters", 1, "tag_id"], "duplicate")
    ]


def test_fill_keeps_the_rows_it_changes_and_drops_what_is_beyond_the_days():
    plan = stored_plan()
    _, dinner = plan.meals
    plans.fill(plan, setup(
        days=2,
        meals=[{"id": 11, "name": "Supper"}, {"name": "Snack"}],
        skips=[{"day": 0, "meal": 0}, {"day": 5, "meal": 1}],
        minimums=[{"day": 1, "at_least": 1}, {"day": 5, "at_least": 0}],
    ))
    assert plan.days == 2
    assert plan.meals[0] is dinner
    assert [(m.position, m.name, [s.day for s in m.skips]) for m in plan.meals] == [
        (0, "Supper", [0]),
        (1, "Snack", []),
    ]
    assert [(m.day, m.at_least) for m in plan.minimums] == [(1, 1)]


def test_fill_drops_the_goal_settings_that_do_not_apply():
    plan = stored_plan()
    plans.fill(plan, setup(goals=[
        goal(must=True, max="2200", importance_below=5, zero_reference="100", day_guard_rail=False,
             guard_rail_importance=4, custom_name="Fuel"),
    ]))
    [stored] = plan.goals
    assert (stored.name, stored.importance_below, stored.zero_reference, stored.day_guard_rail,
            stored.guard_rail_importance) == ("Fuel", None, None, True, None)
