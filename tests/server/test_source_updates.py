"""Finding and answering updated source values (slice D5), on the module
`server.source_values` with the fixture source."""

from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from server import models, source_values
from server.db import migrate
from server.source_loader import load_file, read_file

from .data_source_files import test_source, write

D = Decimal


@pytest.fixture
def engine(database_url, tmp_path):
    migrate(database_url)
    engine = create_engine(database_url)
    with Session(engine) as session:
        load_file(session, read_file(write(tmp_path, test_source())))
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    with Session(engine) as session:
        yield session


def food(db, name="TEST Oats"):
    return db.scalars(select(models.SourceFood).where(models.SourceFood.name == name)).one()


def column(db, key):
    return db.scalars(select(models.SourceColumn).where(models.SourceColumn.key == key)).one()


def attribute(db, name, unit):
    row = models.Attribute(name=name, unit=unit, decimals=0)
    db.add(row)
    db.commit()
    return row


def map_column(db, key, attribute_row):
    column(db, key).attribute_id = attribute_row.id
    db.commit()


def set_source(db, key, value, food_name="TEST Oats"):
    row = db.get(models.SourceFoodValue, (food(db, food_name).id, column(db, key).id))
    row.value = D(value)
    db.commit()


@pytest.fixture
def protein(db):
    row = attribute(db, "Protein", "g")
    map_column(db, "PROT", row)
    return row


@pytest.fixture
def energy(db):
    row = attribute(db, "Energy", "kcal")
    map_column(db, "ENERC:kcal", row)
    return row


def linked(db, *attributes, unit="g", basis="100"):
    """An ingredient as the add makes it: values and their source values as copied now."""
    ingredient = models.Ingredient(name="Oats", unit=unit, basis=D(basis), source_food_id=food(db).id)
    for c in source_values.copied_values(db, food(db)).values:
        ingredient.values.append(models.IngredientValue(attribute_id=c.attribute.id, value=c.value, source_value=c.value))
    db.add(ingredient)
    db.commit()
    return ingredient


def updates(db, ingredient):
    return source_values.updates_for(db, [ingredient]).get(ingredient.id, [])


def value_of(ingredient, attribute_row):
    return next(v for v in ingredient.values if v.attribute_id == attribute_row.id)


def test_an_unchanged_source_has_no_updates(db, protein, energy):
    assert updates(db, linked(db)) == []


def test_a_changed_source_value_is_an_update(db, protein, energy):
    ingredient = linked(db)
    set_source(db, "PROT", "13.8")
    assert updates(db, ingredient) == [source_values.Update(protein.id, D("13.5"), D("13.8"), D("13.8"))]


def test_the_comparison_is_with_the_source_value_not_the_ingredients_own(db, protein):
    ingredient = linked(db)
    value_of(ingredient, protein).value = D(14)
    db.commit()
    assert updates(db, ingredient) == []


def test_a_source_that_changed_to_the_number_already_typed_is_not_an_update(db, protein):
    ingredient = linked(db)
    value_of(ingredient, protein).value = D("13.8")
    db.commit()
    set_source(db, "PROT", "13.8")
    assert updates(db, ingredient) == []


def test_a_source_value_changed_to_zero_is_an_update(db, protein):
    ingredient = linked(db)
    set_source(db, "PROT", "0")
    assert updates(db, ingredient) == [source_values.Update(protein.id, D("13.5"), D("0"), D("0"))]


def test_a_zero_for_an_attribute_without_a_row_is_not_an_update(db, protein):
    ingredient = linked(db)
    vitamin = attribute(db, "Vitamin D", "µg")
    map_column(db, "VITD", vitamin)  # Oats has 0
    assert updates(db, ingredient) == []


@pytest.mark.parametrize("typed", [None, "5"])
def test_a_column_mapped_later_is_an_update(db, protein, typed):
    ingredient = linked(db)
    energy_row = attribute(db, "Energy", "kcal")
    map_column(db, "ENERC:kcal", energy_row)
    if typed:
        ingredient.values.append(models.IngredientValue(attribute_id=energy_row.id, value=D(typed)))
        db.commit()
    assert updates(db, ingredient) == [
        source_values.Update(energy_row.id, D(typed) if typed else None, D(389), D(389))
    ]


def test_an_unmapped_column_is_left_alone_and_its_source_value_stays(db, protein, energy):
    ingredient = linked(db)
    set_source(db, "PROT", "13.8")
    column(db, "PROT").attribute_id = None
    db.commit()
    assert updates(db, ingredient) == []
    assert value_of(ingredient, protein).source_value == D("13.5")
    column(db, "PROT").attribute_id = protein.id  # mapped again: compared with the old number
    db.commit()
    assert [u.attribute_id for u in updates(db, ingredient)] == [protein.id]


def test_a_deleted_attribute_clears_the_mapping_and_the_update_goes(db, engine, protein):
    ingredient = linked(db)
    set_source(db, "PROT", "13.8")
    column(db, "PROT").attribute_id = None  # what deleting the attribute does
    db.commit()
    assert updates(db, ingredient) == []


def test_a_withdrawn_column_is_left_alone(db, protein):
    ingredient = linked(db)
    set_source(db, "PROT", "13.8")
    column(db, "PROT").withdrawn = True
    db.commit()
    assert updates(db, ingredient) == []


def test_a_food_that_lost_a_value_is_not_an_update(db, protein, energy):
    ingredient = linked(db)
    db.delete(db.get(models.SourceFoodValue, (food(db).id, column(db, "PROT").id)))
    db.commit()
    assert updates(db, ingredient) == []


def test_a_withdrawn_food_is_still_compared(db, protein):
    ingredient = linked(db)
    set_source(db, "PROT", "13.8")
    food(db).withdrawn = True
    db.commit()
    assert [u.proposed for u in updates(db, ingredient)] == [D("13.8")]


def test_the_proposed_value_is_scaled_to_the_ingredients_basis(db, protein):
    ingredient = linked(db, basis="50")
    value_of(ingredient, protein).value = D("6.75")
    db.commit()
    set_source(db, "PROT", "13.8")
    assert updates(db, ingredient) == [source_values.Update(protein.id, D("6.75"), D("6.9"), D("13.8"))]


def test_a_basis_in_kg_is_scaled_the_same(db, protein):
    ingredient = linked(db, unit="kg", basis="0.1")
    set_source(db, "PROT", "13.8")
    [update] = updates(db, ingredient)
    assert (update.current, update.proposed, update.answered) == (D("13.5"), D("13.8"), D("13.8"))


def test_a_basis_that_makes_the_value_too_large_is_left_alone(db, protein):
    ingredient = linked(db, basis="100000000")
    set_source(db, "PROT", "1000")  # 1000 per 100 g, times a million, reaches 10^9
    assert updates(db, ingredient) == []


def test_an_ingredient_in_a_non_mass_unit_has_no_updates(db, protein):
    ingredient = linked(db, unit="dl")
    set_source(db, "PROT", "13.8")
    assert updates(db, ingredient) == []


def test_a_last_decimal_of_stepwise_rounding_is_not_a_change(db, protein):
    """After a unit change the stored source value was rounded at each step."""
    ingredient = linked(db)
    value_of(ingredient, protein).source_value = D("13.499999")
    db.commit()
    assert updates(db, ingredient) == []
    value_of(ingredient, protein).source_value = D("13.4999")  # a real difference
    db.commit()
    assert updates(db, ingredient) == []  # the ingredient already has 13.5, the source's number now
    value_of(ingredient, protein).value = D("13.4999")
    db.commit()
    assert [u.proposed for u in updates(db, ingredient)] == [D("13.5")]


def test_an_ingredient_without_a_link_has_no_updates(db, protein):
    ingredient = models.Ingredient(name="Plain", unit="g", basis=D(100))
    db.add(ingredient)
    db.commit()
    assert source_values.updates_for(db, [ingredient]) == {}


def test_accept_sets_values_and_source_values_and_makes_missing_rows(db, protein, energy):
    ingredient = linked(db)
    vitamin = attribute(db, "Vitamin D", "µg")
    iron = attribute(db, "Iron", "mg")
    value_of(ingredient, energy).value = D(1)  # untouched: its source is unchanged
    ingredient.values.append(models.IngredientValue(attribute_id=iron.id, value=D(7)))
    set_source(db, "PROT", "13.8")
    set_source(db, "VITD", "2")
    map_column(db, "VITD", vitamin)
    found = updates(db, ingredient)
    assert [u.attribute_id for u in found] == [protein.id, vitamin.id]
    source_values.apply_answer(ingredient, found, "accept")
    db.commit()
    assert (value_of(ingredient, protein).value, value_of(ingredient, protein).source_value) == (D("13.8"), D("13.8"))
    assert (value_of(ingredient, vitamin).value, value_of(ingredient, vitamin).source_value) == (D(2), D(2))
    assert value_of(ingredient, energy).value == D(1)
    assert value_of(ingredient, iron).value == D(7)
    assert updates(db, ingredient) == []


def test_keep_leaves_values_records_source_values_and_makes_zero_rows(db, protein):
    ingredient = linked(db)
    energy_row = attribute(db, "Energy", "kcal")
    map_column(db, "ENERC:kcal", energy_row)
    set_source(db, "PROT", "13.8")
    found = updates(db, ingredient)
    assert [u.attribute_id for u in found] == [protein.id, energy_row.id]
    source_values.apply_answer(ingredient, found, "keep")
    db.commit()
    assert (value_of(ingredient, protein).value, value_of(ingredient, protein).source_value) == (D("13.5"), D("13.8"))
    assert (value_of(ingredient, energy_row).value, value_of(ingredient, energy_row).source_value) == (D(0), D(389))
    assert updates(db, ingredient) == []
    set_source(db, "PROT", "14")  # the banner returns only on the next change
    assert [u.proposed for u in updates(db, ingredient)] == [D(14)]


def test_many_foods_are_the_same_as_one_at_a_time(db, protein, energy):
    foods = [food(db, n) for n in ("TEST Oats", "TEST Milk", "TEST Cheese")]
    many = source_values.copied_values_many(db, foods)
    for f in foods:
        one = source_values.copied_values(db, f)
        assert [(c.attribute.id, c.value) for c in many[f.id].values] == [(c.attribute.id, c.value) for c in one.values]
        assert many[f.id].skipped == one.skipped
    assert [c.value for c in many[foods[1].id].values] == [D("3.4"), D("64")]
    assert source_values.copied_values_many(db, []) == {}


def count_statements(engine, run) -> int:
    seen = []
    listener = lambda conn, cursor, statement, *rest: seen.append(statement)  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        run()
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    return len(seen)


def test_the_queries_do_not_grow_with_the_foods(db, engine, protein, energy):
    foods = [food(db, n) for n in ("TEST Oats", "TEST Milk", "TEST Cheese")]
    db.expunge_all()
    ids = [f.id for f in foods]
    one = count_statements(engine, lambda: source_values.copied_values_many(db, [db.get(models.SourceFood, ids[0])]))
    three = count_statements(engine, lambda: source_values.copied_values_many(db, [db.get(models.SourceFood, i) for i in ids]))
    assert three - 2 == one  # the two extra db.get()s only
