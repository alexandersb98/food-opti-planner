"""Database engine, the declarative base for models, and migrations."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


class Base(DeclarativeBase):
    metadata = MetaData()


def make_engine(database_url: str) -> Engine:
    return create_engine(database_url)


def alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def migrate(database_url: str) -> None:
    """Bring the database up to the newest migration."""
    command.upgrade(alembic_config(database_url), "head")
