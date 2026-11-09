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


def test_the_ai_settings_default(monkeypatch):
    for name in ("AI_PROVIDER", "AI_MODEL", "AI_API_KEY", "AI_DAILY_LIMIT"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings.from_env()
    assert (settings.ai_provider, settings.ai_model, settings.ai_api_key, settings.ai_daily_limit) == (
        "anthropic",
        "claude-sonnet-5-5",
        "",
        50,
    )


def test_the_ai_settings_are_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("AI_MODEL", "some-model")
    monkeypatch.setenv("AI_API_KEY", "sekrit")
    monkeypatch.setenv("AI_DAILY_LIMIT", "7")
    settings = Settings.from_env()
    assert (settings.ai_provider, settings.ai_model, settings.ai_api_key, settings.ai_daily_limit) == (
        "openai",
        "some-model",
        "sekrit",
        7,
    )


@pytest.mark.parametrize("value", ["abc", "-1", "1.5"])
def test_a_bad_daily_limit_stops_the_app(monkeypatch, value):
    monkeypatch.setenv("AI_DAILY_LIMIT", value)
    with pytest.raises(ValueError, match="AI_DAILY_LIMIT must be a whole number, 0 or more"):
        Settings.from_env()


def test_the_key_is_not_in_the_repr():
    assert "sekrit" not in repr(Settings(ai_api_key="sekrit"))


def test_an_unknown_provider_stops_the_app(make_settings):
    with pytest.raises(ValueError, match="anthropic.*fake"):
        create_app(make_settings(ai_provider="nonsense"))


def test_no_provider_is_an_app_without_ai(make_settings):
    app = create_app(make_settings(ai_provider=""))
    assert app.state.ai.configured is False


def test_the_fake_provider_alone_stops_the_app(make_settings):
    with pytest.raises(ValueError, match="AI_ALLOW_FAKE"):
        create_app(make_settings(ai_provider="fake", ai_allow_fake=False))
    assert create_app(make_settings(ai_provider="fake", ai_allow_fake=True)).state.ai.configured


def test_the_fake_opt_in_is_read_from_the_environment(monkeypatch):
    monkeypatch.delenv("AI_ALLOW_FAKE", raising=False)
    assert Settings.from_env().ai_allow_fake is False
    monkeypatch.setenv("AI_ALLOW_FAKE", "true")
    assert Settings.from_env().ai_allow_fake is True
    monkeypatch.setenv("AI_ALLOW_FAKE", "1")
    assert Settings.from_env().ai_allow_fake is False
