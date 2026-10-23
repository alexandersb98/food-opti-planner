import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from server.app import create_app
from server.settings import Settings


def test_the_app_needs_a_password_hash(make_settings):
    with pytest.raises(ValueError, match="PASSWORD_HASH"):
        create_app(make_settings(password_hash=""))


def test_the_app_rejects_a_password_hash_that_is_not_argon2(make_settings):
    with pytest.raises(ValueError, match="PASSWORD_HASH"):
        create_app(make_settings(password_hash="hunter2"))


def test_the_app_needs_a_session_key(make_settings):
    with pytest.raises(ValueError, match="SESSION_KEY"):
        create_app(make_settings(session_key=""))


def test_a_neon_connection_string_gets_the_psycopg_driver(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require")
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", "postgres://u:p@ep-x.neon.tech/db?sslmode=require")
    settings = Settings.from_env()
    assert settings.database_url == "postgresql+psycopg://u:p@ep-x-pooler.neon.tech/db?sslmode=require"
    assert settings.migration_database_url == "postgresql+psycopg://u:p@ep-x.neon.tech/db?sslmode=require"


def test_migrations_use_the_app_database_without_an_unpooled_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host/db")
    monkeypatch.delenv("DATABASE_URL_UNPOOLED", raising=False)
    settings = Settings.from_env()
    assert settings.migration_database_url == "postgresql+psycopg://u:p@host/db"


def test_the_app_migrates_the_unpooled_database(make_settings, tmp_path):
    app_db, migration_db = tmp_path / "app.db", tmp_path / "migrations.db"
    settings = make_settings(
        database_url=f"sqlite:///{app_db}", migration_database_url=f"sqlite:///{migration_db}"
    )
    with TestClient(create_app(settings)):
        pass
    assert "alembic_version" in inspect(create_engine(f"sqlite:///{migration_db}")).get_table_names()
