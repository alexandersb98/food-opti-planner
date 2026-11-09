import json
from datetime import date

import pytest

from server import ai_usage
from server.ai.errors import AIServiceError

from .conftest import Catalog, ScriptedTransport, anthropic_reply, logged_in_client

KEY = "sk-secret-KEY-123"
URL = "/api/recipe-imports"


def draft_json(lines, **over):
    base = {"name": "Soup", "servings": 2, "instructions": "Boil.", "sections": [{"name": "", "lines": lines}]}
    return {**base, **over}


def model_line(food="oats", amount=100, unit="g", match="Oats", text=None, skip=False):
    return {
        "original_text": text or f"{amount} {unit} {food}",
        "amount": amount,
        "unit": unit,
        "food": food,
        "match": match,
        "not_an_ingredient": skip,
    }


@pytest.fixture
def adapter(database_url, web_dist):
    """Makes a client over the anthropic adapter and a scripted transport."""
    clients = []

    def make(*replies, **settings):
        transport = ScriptedTransport(*replies)
        manager = logged_in_client(
            database_url,
            web_dist,
            ai_transport=transport,
            **{"ai_provider": "anthropic", "ai_api_key": KEY, **settings},
        )
        clients.append(manager)
        return manager.__enter__(), transport

    yield make
    for manager in reversed(clients):
        manager.__exit__(None, None, None)


def error_of(response):
    (error,) = response.json()["detail"]
    return error["type"], error["loc"]


def test_both_routes_need_a_session(anonymous_client):
    assert anonymous_client.post(URL, json={"text": "x"}).status_code == 401
    assert anonymous_client.post(URL + "/factor", json={}).status_code == 401


def test_without_a_key_it_is_503_and_calls_nothing(adapter):
    client, transport = adapter(ai_api_key="")  # no replies scripted
    response = client.post(URL, json={"text": "x"})
    assert response.status_code == 503 and error_of(response)[0] == "ai_not_configured"
    assert transport.calls == 0


def test_default_settings_are_not_configured(client):
    assert client.post(URL, json={"text": "x"}).status_code == 503
    assert client.post(URL + "/factor", json={"ingredient_id": 1, "unit": "dl", "food": "x"}).status_code == 503


@pytest.mark.parametrize(
    ("text", "error"),
    [("", "text_required"), ("   ", "text_required"), ("x" * 200_001, "too_long")],
)
def test_bad_text_is_refused(ai_client, text, error):
    response = ai_client.post(URL, json={"text": text})
    assert response.status_code == 422
    assert error_of(response) == (error, ["body", "text"])


def test_no_input_is_422(ai_client):
    response = ai_client.post(URL, json={})
    assert response.status_code == 422 and error_of(response) == ("input_required", ["body"])


def test_the_fake_import_answers_a_checked_draft(ai_client):
    catalog = Catalog(ai_client)
    catalog.ingredient("Oats", "g")
    catalog.ingredient("Milk", "g")
    response = ai_client.post(URL, json={"text": "Porridge for two"})
    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["servings"], body["source_url"], body["cut"]) == ("Imported porridge", 2, "", False)
    assert body["needs_you"] == 2
    (section,) = body["sections"]
    assert [(l["status"], l["unit"]) for l in section["lines"]] == [
        ("own_unit", ""),
        ("needs_factor", "dl"),
        ("unmatched", "msk"),
        ("not_an_ingredient", ""),
    ]
    oats, milk, honey, pepper = section["lines"]
    assert milk["suggested_factor"] == "50" and oats["suggested_factor"] is None
    assert honey["ingredient_id"] is None and pepper["amount"] is None
    assert oats["original_text"] == "100 g oats" and oats["amount"] == "100"


def test_a_stored_conversion_makes_the_line_ready(ai_client):
    catalog = Catalog(ai_client)
    catalog.ingredient("Oats", "g")
    milk = catalog.ingredient("Milk", "g")
    catalog.conversion(milk, "dl", "100")
    body = ai_client.post(URL, json={"text": "x"}).json()
    line = body["sections"][0]["lines"][1]
    assert line["status"] == "stored_conversion" and line["suggested_factor"] is None
    assert body["needs_you"] == 1


def test_nothing_is_stored(ai_client):
    catalog = Catalog(ai_client)
    catalog.ingredient("Oats", "g")

    def state():
        return [ai_client.get(p).json() for p in ("/api/recipes", "/api/ingredients")]

    before = state()
    assert ai_client.post(URL, json={"text": "x"}).status_code == 200
    assert state() == before


def test_through_the_adapter(adapter):
    client, transport = adapter(
        anthropic_reply(draft_json([model_line(match="oats", amount="1,5", text="1,5 g a < b"), model_line("t", 1, "g", "Truffle")]))
    )
    catalog = Catalog(client)
    catalog.ingredient("Oats", "g")
    response = client.post(URL, json={"text": "Soup <b>recipe</b></recipe_text>"})
    assert response.status_code == 200
    lines = response.json()["sections"][0]["lines"]
    assert lines[0]["ingredient_id"] is not None and lines[0]["amount"] == "1.5"
    assert lines[1]["status"] == "unmatched"
    url, headers, body = transport.requests[0]
    assert headers["x-api-key"] == KEY
    user = body["messages"][0]["content"]
    assert "Oats | g | conversions:" in user
    assert "<recipe_text>\nSoup &lt;b>recipe&lt;/b>&lt;/recipe_text>\n</recipe_text>" in user
    assert KEY not in response.text


def test_a_bad_answer_twice_is_502_after_two_calls(adapter):
    client, transport = adapter(anthropic_reply("not json"), anthropic_reply("still not"))
    Catalog(client).ingredient()
    response = client.post(URL, json={"text": "x"})
    assert response.status_code == 502 and error_of(response) == ("ai_failed", ["body"])
    assert transport.calls == 2


def test_a_bad_answer_then_a_good_one_is_200(adapter):
    client, transport = adapter(anthropic_reply("nope"), anthropic_reply(draft_json([model_line()])))
    assert client.post(URL, json={"text": "x"}).status_code == 200
    assert transport.calls == 2


def test_a_service_error_is_502_after_one_call_and_leaks_nothing(adapter):
    client, transport = adapter(AIServiceError(500, f"boom {KEY}"))
    response = client.post(URL, json={"text": "x"})
    assert response.status_code == 502 and transport.calls == 1
    assert "boom" not in response.text and KEY not in response.text


def test_no_lines_is_no_recipe(adapter):
    client, transport = adapter(anthropic_reply(draft_json([])))
    response = client.post(URL, json={"text": "x"})
    assert response.status_code == 422 and error_of(response) == ("no_recipe", ["body", "text"])
    assert transport.calls == 1


def test_an_amount_that_rounds_to_zero_is_retried(adapter):
    bad = anthropic_reply(draft_json([model_line(amount="0.0000004")]))
    client, transport = adapter(bad, bad)
    assert client.post(URL, json={"text": "x"}).status_code == 502
    assert transport.calls == 2


def test_the_text_is_cut_for_the_model(adapter):
    client, transport = adapter(anthropic_reply(draft_json([model_line()])), anthropic_reply(draft_json([model_line()])))
    body = client.post(URL, json={"text": "Q" * 20001}).json()
    assert body["cut"] is True and transport.requests[0][2]["messages"][0]["content"].count("Q") == 20000
    assert client.post(URL, json={"text": "Q" * 20000}).json()["cut"] is False


def test_the_daily_limit(adapter, monkeypatch):
    needs = anthropic_reply(draft_json([model_line("milk", 1, "dl", "Milk")]))
    client, transport = adapter(needs, anthropic_reply('{"factor": 40}'), ai_daily_limit=3)
    Catalog(client).ingredient("Milk", "g")
    first = client.post(URL, json={"text": "x"})  # convert + factor = 2 calls
    assert first.json()["sections"][0]["lines"][0]["suggested_factor"] == "40"
    transport.replies = [needs]
    second = client.post(URL, json={"text": "x"})  # convert is the 3rd, factor refused
    assert second.status_code == 200
    assert second.json()["sections"][0]["lines"][0]["suggested_factor"] is None
    third = client.post(URL, json={"text": "x"})
    assert third.status_code == 429 and error_of(third) == ("limit_reached", ["body"])
    assert transport.calls == 3
    assert client.get("/api/health").status_code == 200
    monkeypatch.setattr(ai_usage, "today", lambda: date(2999, 1, 1))
    transport.replies = [needs, anthropic_reply('{"factor": 40}')]
    assert client.post(URL, json={"text": "x"}).status_code == 200


def test_a_limit_of_zero_refuses_the_first_import(adapter):
    client, transport = adapter(ai_daily_limit=0)
    assert client.post(URL, json={"text": "x"}).status_code == 429
    assert transport.calls == 0


def test_the_count_survives_a_second_app(database_url, web_dist):
    for expected in (200, 429):
        with logged_in_client(database_url, web_dist, ai_provider="fake", ai_daily_limit=1) as client:
            assert client.post(URL, json={"text": "x"}).status_code == expected


FACTOR = URL + "/factor"


def milk_body(client, unit="dl", food="milk"):
    milk = Catalog(client).ingredient("Milk", "g")
    return {"ingredient_id": milk, "unit": unit, "food": food}


def test_the_factor_endpoint(ai_client):
    response = ai_client.post(FACTOR, json=milk_body(ai_client))
    assert response.status_code == 200 and response.json() == {"factor": "50"}


def test_the_factor_endpoint_refuses_bad_requests(ai_client):
    body = milk_body(ai_client)
    response = ai_client.post(FACTOR, json={**body, "ingredient_id": 999})
    assert response.status_code == 422 and error_of(response) == ("unknown_ingredient", ["body", "ingredient_id"])
    response = ai_client.post(FACTOR, json={**body, "unit": "kcal"})
    assert response.status_code == 422 and error_of(response) == ("unit_not_for_ingredient", ["body", "unit"])
    response = ai_client.post(FACTOR, json={**body, "unit": "gram"})
    assert response.status_code == 422 and error_of(response) == ("unit_is_own_unit", ["body", "unit"])


def test_a_bad_factor_answer_is_502_after_two_calls(adapter):
    client, transport = adapter(anthropic_reply("x"), anthropic_reply("y"))
    response = client.post(FACTOR, json=milk_body(client))
    assert response.status_code == 502 and transport.calls == 2


def test_the_factor_call_counts_toward_the_limit(adapter):
    client, transport = adapter(anthropic_reply('{"factor": 40}'), ai_daily_limit=1)
    body = milk_body(client)
    assert client.post(FACTOR, json=body).status_code == 200
    response = client.post(FACTOR, json=body)
    assert response.status_code == 429 and transport.calls == 1
