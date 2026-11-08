import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from server import models, preferences, units


@pytest.fixture
def db(client):
    with Session(client.app.state.engine) as session:
        yield session


def test_unset_preferences_read_the_defaults(db):
    assert preferences.read(db) == {"unit.mass": "g", "unit.volume": "dl", "unit.energy": "kcal"}


def test_a_saved_key_reads_back_and_the_others_keep_their_defaults(db):
    preferences.save(db, {"unit.mass": "kg"})
    assert preferences.read(db) == {"unit.mass": "kg", "unit.volume": "dl", "unit.energy": "kcal"}


def test_saving_twice_keeps_one_row(db):
    preferences.save(db, {"unit.mass": "kg"})
    preferences.save(db, {"unit.mass": "oz"})
    assert db.scalar(select(func.count()).select_from(models.Preference)) == 1
    assert preferences.read(db)["unit.mass"] == "oz"


def test_an_unknown_stored_key_is_ignored(db):
    preferences.save(db, {"from.a.newer.version": "x"})
    assert preferences.read(db) == preferences.DEFAULTS


def test_preferred_unit_for_each_category(db):
    preferences.save(db, {"unit.volume": "msk"})
    assert preferences.preferred_unit(db, "mass") == "g"
    assert preferences.preferred_unit(db, "volume") == "msk"
    assert preferences.preferred_unit(db, "energy") == "kcal"


def test_defaults_are_offered_units_of_their_categories():
    for key, category in preferences.UNIT_KEYS.items():
        assert preferences.DEFAULTS[key] in [u.symbol for u in units.offered(category)]


def test_canonical_spells_units_and_refuses_what_refusals_would():
    assert preferences.canonical({"unit.mass": "gram"}) == {"unit.mass": "g"}
    for changes in ({"unit.mass": "dl"}, {"unit.mass": None}, {"unit.other": "g"}):
        with pytest.raises(ValueError):
            preferences.canonical(changes)
