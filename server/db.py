"""Database engine, the declarative base for models, sessions and migrations."""

from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from alembic import command
from alembic.config import Config
from fastapi import Depends, Request
from sqlalchemy import Engine, MetaData, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


class Base(DeclarativeBase):
    metadata = MetaData()


def make_engine(database_url: str) -> Engine:
    # Neon ends the connections of a database it suspends after 5 idle
    # minutes, so check a pooled connection before using it.
    engine = create_engine(database_url, pool_pre_ping=True)
    if engine.dialect.name == "sqlite":
        # SQLite ignores foreign keys unless each connection turns them on,
        # and the delete rules (cascade, or block an ingredient in use) are
        # foreign keys. Migrations use their own engine, without this.
        event.listen(engine, "connect", _sqlite_foreign_keys_on)
    return engine


def _sqlite_foreign_keys_on(connection, _record) -> None:
    connection.execute("PRAGMA foreign_keys = ON")


def _session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session


# A route's database session: `def route(db: DbSession)`.
DbSession = Annotated[Session, Depends(_session)]


def alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def migrate(database_url: str) -> None:
    """Bring the database up to the newest migration."""
    command.upgrade(alembic_config(database_url), "head")
