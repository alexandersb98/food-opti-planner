"""Server test fixtures. Tests use SQLite unless TEST_DATABASE_URL names a
Postgres database, which CI sets for its second run."""

import os
from dataclasses import replace

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from server.app import create_app
from server.settings import Settings

PASSWORD = "correct horse battery staple"
PASSWORD_HASH = PasswordHasher().hash(PASSWORD)


def settings_with(**changes) -> Settings:
    """Settings with the test password and a session key."""
    settings = Settings(password_hash=PASSWORD_HASH, session_key="test session key")
    return replace(settings, **changes)


@pytest.fixture
def make_settings():
    return settings_with


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
def anonymous_client(database_url, web_dist):
    """A client without a session. HTTPS, because the session cookie is Secure."""
    app = create_app(settings_with(database_url=database_url, web_dist=web_dist))
    with TestClient(app, base_url="https://testserver") as client:
        yield client


@pytest.fixture
def client(anonymous_client):
    """A logged-in client; most API tests use this one."""
    response = anonymous_client.post("/api/login", json={"password": PASSWORD})
    assert response.status_code == 204
    return anonymous_client


# A recipe's fields besides its name, items and added tags: the portion
# size the editor starts with.
RECIPE = {
    "min_multiplier": "0.5",
    "max_multiplier": "2",
    "step": None,
    "hard_max_multiplier": None,
    "serving_cap_weight": "1",
}


class Catalog:
    """Adds catalog rows through the API, for tests that need some to refer
    to. Each method answers the new row's id."""

    def __init__(self, client):
        self.client = client

    def _create(self, path: str, fields: dict) -> int:
        response = self.client.post(path, json=fields)
        assert response.status_code == 201, response.text
        return response.json()["id"]

    def attribute(self, name="Energy", unit="kcal", decimals=0) -> int:
        return self._create("/api/attributes", {"name": name, "unit": unit, "decimals": decimals})

    def tag(self, name="vegan", derive="all") -> int:
        return self._create("/api/tags", {"name": name, "derive": derive})

    def ingredient(self, name="Oats", unit="g", basis="100", values=None, tag_ids=()) -> int:
        """`values` maps attribute ids to values as typed: {energy: "389"}."""
        values = [{"attribute_id": a, "value": v} for a, v in (values or {}).items()]
        fields = {"name": name, "unit": unit, "basis": basis, "values": values, "tag_ids": list(tag_ids)}
        return self._create("/api/ingredients", fields)

    def recipe(self, name="Porridge", items=None, extra_tag_ids=()) -> int:
        """`items` maps ingredient ids to amounts per portion: {oats: "60"}."""
        items = [{"ingredient_id": i, "amount": a} for i, a in (items or {self.ingredient(): "60"}).items()]
        return self._create("/api/recipes", {**RECIPE, "name": name, "items": items, "extra_tag_ids": list(extra_tag_ids)})


@pytest.fixture
def catalog(client):
    return Catalog(client)
