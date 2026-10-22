"""Server test fixtures. Tests use SQLite unless TEST_DATABASE_URL names a
Postgres database, which CI sets for its second run."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from server.app import create_app
from server.settings import Settings


@pytest.fixture
def database_url(tmp_path):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        return f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()
    return url


@pytest.fixture
def web_dist(tmp_path):
    """A stand-in for the built frontend."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "assets" / "app.js").write_text("console.log('app')")
    return dist


@pytest.fixture
def client(database_url, web_dist):
    app = create_app(Settings(database_url=database_url, web_dist=web_dist))
    with TestClient(app) as client:
        yield client
