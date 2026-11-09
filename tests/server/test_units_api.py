import json
from pathlib import Path

from server import units
from server.export_units import units_json

FIXTURE = Path(__file__).resolve().parents[2] / "web" / "src" / "test-units.json"


def by_symbol(client):
    return {u["symbol"]: u for u in client.get("/api/units").json()["units"]}


def test_units_need_a_session(anonymous_client):
    assert anonymous_client.get("/api/units").status_code == 401


def test_answers_the_catalogue_in_order(client):
    answer = client.get("/api/units").json()
    assert [u["symbol"] for u in answer["units"]] == [u.symbol for u in units.catalogue()]


def test_some_units(client):
    found = by_symbol(client)
    msk = found["msk"]
    assert (msk["factor"], msk["category"]) == ("0.015", "volume")
    assert {"matsked", "tbsp"} <= set(msk["aliases"])
    assert found["µg"]["factor"] == "0.000001"
    assert found["kcal"]["case_sensitive_aliases"] == ["Cal"]
    assert found["kcal"]["factor"] == "4184"
    assert found["fl oz"]["factor"] == "0.0295735295625"
    assert found["st"]["category"] is None and found["st"]["factor"] is None
    assert found["st"]["offered"] is True
    assert found["cg"]["offered"] is False


def test_factors_are_plain_strings(client):
    for unit in by_symbol(client).values():
        assert unit["factor"] is None or (
            isinstance(unit["factor"], str) and "e" not in unit["factor"].lower()
        )


def test_every_spelling_parses_to_its_own_symbol(client):
    for unit in by_symbol(client).values():
        for spelling in [unit["symbol"], *unit["aliases"], *unit["case_sensitive_aliases"]]:
            assert units.parse(spelling).symbol == unit["symbol"], spelling


def test_the_committed_fixture_is_up_to_date():
    """Regenerate with: npm --prefix web run gen:api"""
    assert FIXTURE.read_text(encoding="utf-8") == units_json()


def test_the_fixture_is_the_answer(client):
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == client.get("/api/units").json()
