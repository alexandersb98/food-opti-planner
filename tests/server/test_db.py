import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server import models
from server.api.catalog import commit_named
from server.db import make_engine, migrate


@pytest.fixture
def session(database_url):
    migrate(database_url)
    engine = make_engine(database_url)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_sqlite_enforces_foreign_keys(session):
    if session.bind.dialect.name != "sqlite":
        pytest.skip("Postgres always enforces them")
    assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1


def attribute(name, decimals=1):
    return models.Attribute(name=name, unit="g", decimals=decimals)


def test_commit_named_answers_409_for_a_new_row_with_a_name_in_use(session):
    first, second = attribute("Protein"), attribute("Protein")
    session.add(first)
    commit_named(session, first, "An attribute")
    session.add(second)
    with pytest.raises(HTTPException) as raised:
        commit_named(session, second, "An attribute")
    assert raised.value.status_code == 409


def test_commit_named_answers_409_for_a_rename_to_a_name_in_use(session):
    protein, fat = attribute("Protein"), attribute("Fat")
    session.add_all([protein, fat])
    session.commit()
    fat.name = "Protein"
    with pytest.raises(HTTPException) as raised:
        commit_named(session, fat, "An attribute")
    assert raised.value.status_code == 409


def test_commit_named_raises_other_failures_as_they_are(session):
    """Not every failed constraint is a name clash: here a missing value."""
    row = attribute("Protein", decimals=None)
    session.add(row)
    with pytest.raises(IntegrityError):
        commit_named(session, row, "An attribute")
