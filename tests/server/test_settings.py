from pathlib import Path

import pytest

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


def test_the_data_sources_directory_defaults_to_the_one_beside_the_code(monkeypatch):
    monkeypatch.delenv("DATA_SOURCES_DIR", raising=False)
    assert Settings.from_env().data_sources_dir.parts[-2:] == ("server", "data_sources")


def test_the_data_sources_directory_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATA_SOURCES_DIR", "/somewhere/else")
    assert Settings.from_env().data_sources_dir == Path("/somewhere/else")
