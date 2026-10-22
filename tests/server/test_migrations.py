from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from server.db import migrate
from server.models import Base


def test_migrations_build_the_tables_the_models_describe(database_url):
    migrate(database_url)
    engine = create_engine(database_url)
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert differences == []


def test_the_app_migrates_on_startup(client, database_url):
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() is not None
    engine.dispose()
