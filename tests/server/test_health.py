from fastapi.testclient import TestClient

from server.app import create_app


def test_health_reports_a_reachable_database(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"database": True}


def test_health_reports_an_unreachable_database(tmp_path, make_settings):
    missing = tmp_path / "no-such-dir" / "test.db"
    settings = make_settings(database_url=f"sqlite:///{missing}", migrate_on_startup=False)
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"database": False}
