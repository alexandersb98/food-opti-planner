import pytest

from server.app import create_app


def test_the_app_needs_a_password_hash(make_settings):
    with pytest.raises(ValueError, match="PASSWORD_HASH"):
        create_app(make_settings(password_hash=""))


def test_the_app_rejects_a_password_hash_that_is_not_argon2(make_settings):
    with pytest.raises(ValueError, match="PASSWORD_HASH"):
        create_app(make_settings(password_hash="hunter2"))


def test_the_app_needs_a_session_key(make_settings):
    with pytest.raises(ValueError, match="SESSION_KEY"):
        create_app(make_settings(session_key=""))
