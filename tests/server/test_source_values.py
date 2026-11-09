from decimal import Decimal

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from server import models, preferences, source_values, units
from server.db import migrate
from server.source_loader import load_file, read_file

from .data_source_files import test_source, write


@pytest.fixture
def db(database_url, tmp_path):
    migrate(database_url)
    engine = create_engine(database_url)
    with Session(engine) as session:
        load_file(session, read_file(write(tmp_path, test_source())))
        yield session
    engine.dispose()


def food(db, name):
    return db.scalars(select(models.SourceFood).where(models.SourceFood.name == name)).one()


def column(db, key):
    return db.scalars(select(models.SourceColumn).where(models.SourceColumn.key == key)).one()


def attribute(db, name, unit) -> models.Attribute:
    row = models.Attribute(name=name, unit=unit, decimals=0)
    db.add(row)
    db.commit()
    return row


def map_column(db, key, attribute_row):
    column(db, key).attribute_id = attribute_row.id
    db.commit()


def copied(db, name="TEST Oats"):
    result = source_values.copied_values(db, food(db, name))
    return {c.attribute.name: c.value for c in result.values}


def test_mapped_columns_are_copied_converted_and_zero_is_kept(db):
    map_column(db, "PROT", attribute(db, "Protein", "g"))
    map_column(db, "ENERC:kcal", attribute(db, "Energy", "kJ"))
    map_column(db, "VITD", attribute(db, "Vitamin D", "mg"))
    assert copied(db) == {"Protein": Decimal("13.5"), "Energy": Decimal("1627.576"), "Vitamin D": Decimal("0")}


def test_a_missing_value_is_not_zero(db):
    map_column(db, "PROT", attribute(db, "Protein", "g"))
    map_column(db, "VITD", attribute(db, "Vitamin D", "µg"))
    assert copied(db, "TEST Milk") == {"Protein": Decimal("3.4")}


def test_an_unmapped_column_is_not_copied(db):
    map_column(db, "PROT", attribute(db, "Protein", "g"))
    assert copied(db) == {"Protein": Decimal("13.5")}


def test_a_withdrawn_column_is_not_copied(db):
    map_column(db, "PROT", attribute(db, "Protein", "g"))
    column(db, "PROT").withdrawn = True
    db.commit()
    assert copied(db) == {}


def test_a_larger_attribute_unit_scales_the_value(db):
    map_column(db, "PROT", attribute(db, "Protein", "mg"))
    assert copied(db) == {"Protein": Decimal("13500")}


def test_a_value_too_large_to_store_is_skipped_by_attribute_name(db):
    map_column(db, "PROT", attribute(db, "Protein", "µg"))
    map_column(db, "ENERC:kcal", attribute(db, "Energy", "kcal"))
    cheese = food(db, "TEST Cheese")
    value = db.get(models.SourceFoodValue, (cheese.id, column(db, "PROT").id))
    value.value = Decimal("1000")  # 1000 g = 10^9 µg
    db.commit()
    result = source_values.copied_values(db, cheese)
    assert result.skipped == ["Protein"]
    assert [c.attribute.name for c in result.values] == ["Energy"]


def test_values_are_ordered_by_attribute_id(db):
    energy = attribute(db, "Energy", "kcal")
    protein = attribute(db, "Protein", "g")
    map_column(db, "PROT", protein)
    map_column(db, "ENERC:kcal", energy)
    result = source_values.copied_values(db, food(db, "TEST Oats"))
    assert [c.attribute.id for c in result.values] == [energy.id, protein.id]


def test_a_mapping_that_does_not_convert_is_a_bug(db):
    map_column(db, "PROT", attribute(db, "Wrong", "dl"))
    with pytest.raises(RuntimeError):
        source_values.copied_values(db, food(db, "TEST Oats"))


def test_the_basis_is_100_g_by_default(db):
    assert source_values.food_basis(db) == ("g", Decimal(100))


@pytest.mark.parametrize(("unit", "basis"), [("kg", "0.1"), ("oz", "3.527396"), ("mg", "100000")])
def test_the_basis_is_100_g_in_the_preferred_mass_unit(db, unit, basis):
    preferences.save(db, {"unit.mass": unit})
    assert source_values.food_basis(db) == (unit, Decimal(basis))


def test_a_preferred_unit_that_rounds_100_g_to_zero_falls_back_to_grams(db, monkeypatch):
    preferences.save(db, {"unit.mass": "kg"})
    real = units.ratio
    # The catalogue has no unit that large, so pretend kg is a million tonnes.
    monkeypatch.setattr(units, "ratio", lambda a, b: real(a, b) / 10**12 if b == "kg" else real(a, b))
    assert source_values.food_basis(db) == ("g", Decimal(100))
