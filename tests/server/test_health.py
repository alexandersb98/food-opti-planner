import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from server.app import create_app


def test_health_reports_a_reachable_database(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"database": True, "ai_configured": False}


def test_health_says_whether_the_ai_is_configured(database_url, web_dist):
    from .conftest import logged_in_client

    for settings, expected in (
        ({"ai_provider": "fake"}, True),
        ({"ai_provider": "anthropic", "ai_api_key": "k"}, True),
        ({"ai_provider": "anthropic", "ai_api_key": ""}, False),
        ({"ai_provider": ""}, False),
    ):
        with logged_in_client(database_url, web_dist, **settings) as client:
            assert client.get("/api/health").json()["ai_configured"] is expected


def test_health_reports_an_unreachable_database(tmp_path, make_settings):
    missing = tmp_path / "no-such-dir" / "test.db"
    settings = make_settings(database_url=f"sqlite:///{missing}", migrate_on_startup=False)
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"database": False, "ai_configured": False}


def test_health_survives_the_database_dropping_idle_connections(client, database_url):
    """Neon suspends an idle database and ends its connections; the next
    request must open a fresh one instead of failing on a dead one."""
    if not database_url.startswith("postgresql"):
        pytest.skip("needs Postgres")
    assert client.get("/api/health").status_code == 200  # leaves a pooled connection
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity"
                " WHERE datname = current_database() AND pid <> pg_backend_pid()"
            )
        )
    engine.dispose()
    assert client.get("/api/health").status_code == 200
