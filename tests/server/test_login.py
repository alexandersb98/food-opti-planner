import itsdangerous.timed
import pytest

from server.auth import SESSION_COOKIE, failed_login_delay

from .conftest import PASSWORD

THIRTY_DAYS = 30 * 24 * 60 * 60


@pytest.fixture
def delays(anonymous_client):
    """Record the failed-login delays instead of waiting them out."""
    recorded = []

    async def record(seconds):
        recorded.append(seconds)

    anonymous_client.app.state.auth.sleep = record
    return recorded


def protected_requests(app):
    """(method, path) for every /api route except login and health."""
    for path, operations in app.openapi()["paths"].items():
        if path in ("/api/login", "/api/health"):
            continue
        for method in operations:
            yield method.upper(), path.replace("{", "").replace("}", "")  # any path parameter value


def test_without_a_session_every_api_route_answers_401(anonymous_client):
    requests = list(protected_requests(anonymous_client.app))
    assert ("GET", "/api/session") in requests
    for method, path in requests:
        assert anonymous_client.request(method, path).status_code == 401, (method, path)


def test_health_needs_no_session(anonymous_client):
    assert anonymous_client.get("/api/health").status_code == 200


def test_the_right_password_sets_the_session_cookie(anonymous_client):
    response = anonymous_client.post("/api/login", json={"password": PASSWORD})
    assert response.status_code == 204
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    for flag in ("httponly", "secure", "samesite=strict", f"max-age={THIRTY_DAYS}", "path=/api"):
        assert flag in cookie
    assert anonymous_client.get("/api/session").status_code == 204


def test_a_wrong_password_is_delayed_and_answers_401(anonymous_client, delays):
    response = anonymous_client.post("/api/login", json={"password": "wrong"})
    assert response.status_code == 401
    assert "set-cookie" not in response.headers
    assert delays == [1]
    assert anonymous_client.get("/api/session").status_code == 401


def test_the_delay_grows_with_each_failure_and_resets_on_success(anonymous_client, delays):
    for _ in range(3):
        anonymous_client.post("/api/login", json={"password": "wrong"})
    anonymous_client.post("/api/login", json={"password": PASSWORD})
    anonymous_client.post("/api/login", json={"password": "wrong"})
    assert delays == [1, 2, 4, 1]


def test_the_delay_doubles_up_to_30_seconds():
    assert [failed_login_delay(n) for n in range(1, 8)] == [1, 2, 4, 8, 16, 30, 30]


def test_logout_ends_the_session(client):
    response = client.post("/api/logout")
    assert response.status_code == 204
    assert client.get("/api/session").status_code == 401


def test_a_tampered_session_cookie_answers_401(client):
    token = client.cookies.get(SESSION_COOKIE)
    client.cookies.set(SESSION_COOKIE, token[:-2] + "xx", path="/api")
    assert client.get("/api/session").status_code == 401


def test_a_session_older_than_30_days_answers_401(anonymous_client, monkeypatch):
    auth = anonymous_client.app.state.auth
    with monkeypatch.context() as patch:
        old = itsdangerous.timed.time.time() - THIRTY_DAYS - 60
        patch.setattr(itsdangerous.timed.time, "time", lambda: old)
        token = auth.new_session()
    anonymous_client.cookies.set(SESSION_COOKIE, token, path="/api")
    assert anonymous_client.get("/api/session").status_code == 401


def test_a_session_from_another_key_answers_401(anonymous_client, make_settings):
    from server.auth import Auth

    settings = make_settings(session_key="another key")
    token = Auth(settings.password_hash, settings.session_key).new_session()
    anonymous_client.cookies.set(SESSION_COOKIE, token, path="/api")
    assert anonymous_client.get("/api/session").status_code == 401
