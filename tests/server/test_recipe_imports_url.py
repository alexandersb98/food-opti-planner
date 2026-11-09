"""POST /api/recipe-imports with a link. The page transport is a stub and the
resolver a dict: nothing here touches the internet."""

import json

import httpx
import pytest

from server.ai.errors import AIServiceError
from server.app import create_app
from server.page_fetch import PageFetcher, system_resolver

from .conftest import (
    RECIPE_PAGE,
    RECIPE_PAGE_LD,
    Catalog,
    ScriptedTransport,
    anthropic_reply,
    logged_in_client,
    page_client,
    page_html,
    settings_with,
)
from .test_recipe_imports import KEY, error_of, draft_json, model_line

URL = "/api/recipe-imports"
PAGE_URL = "https://recipes.example/porridge"
UNREADABLE = "Couldn't read this page. Paste the recipe text instead."


def ok(request):
    return page_html(RECIPE_PAGE)


def post(client, url=PAGE_URL):
    return client.post(URL, json={"url": url})


@pytest.fixture
def pages(database_url, web_dist):
    """Makes (client, requests) with a handler; closes the apps afterwards."""
    managers = []

    def make(handler=ok, hosts=None, **settings):
        manager = page_client(database_url, web_dist, handler, hosts, **settings)
        managers.append(manager)
        return manager.__enter__()

    yield make
    for manager in reversed(managers):
        manager.__exit__(None, None, None)


def message_of(transport) -> str:
    return transport.requests[0][2]["messages"][0]["content"]


def recipe_text_in(message: str) -> str:
    return message.split("<recipe_text>\n", 1)[1].rsplit("\n</recipe_text>", 1)[0]


def adapter_pages(pages, handler, *replies, **settings):
    transport = ScriptedTransport(*replies)
    client, requests = pages(handler, ai_provider="anthropic", ai_api_key=KEY, ai_transport=transport, **settings)
    return client, requests, transport


# --- success --------------------------------------------------------------


def test_the_fake_import_of_a_page(pages):
    client, requests = pages()
    Catalog(client).ingredient("Oats", "g")
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Imported porridge" and body["source_url"] == PAGE_URL and body["cut"] is False
    assert len(requests) == 1 and requests[0].url.host == "93.184.216.34"


def test_a_redirect_gives_the_final_url_without_the_fragment(pages):
    def handler(request):
        if request.headers["Host"] == "short.example":
            return httpx.Response(301, headers={"Location": "https://recipes.example/porridge?id=7#top"})
        return page_html(RECIPE_PAGE)

    client, requests = pages(handler)
    body = post(client, "  http://short.example/a  ").json()
    assert body["source_url"] == "https://recipes.example/porridge?id=7"
    assert len(requests) == 2


def test_an_overlong_final_url_falls_back_to_the_entered_one(pages):
    long = "https://recipes.example/" + "a" * 2000

    def handler(request):
        if request.headers["Host"] == "short.example":
            return httpx.Response(301, headers={"Location": long})
        return page_html(RECIPE_PAGE)

    client, _ = pages(handler)
    assert post(client, "http://short.example/a").json()["source_url"] == "http://short.example/a"


# --- what the model receives ----------------------------------------------


def test_the_json_ld_page_sends_only_the_allow_listed_recipe(pages):
    client, _, transport = adapter_pages(pages, lambda r: page_html(RECIPE_PAGE_LD), anthropic_reply(draft_json([model_line()])))
    assert post(client).status_code == 200
    recipe = json.loads(recipe_text_in(message_of(transport)).replace("&lt;", "<"))
    assert recipe["recipeIngredient"] == ["100 g oats", "2 dl milk", "1 tbsp honey"]
    message = message_of(transport)
    assert "REVIEW-NOISE" not in message and "NAV-NOISE" not in message


def test_the_plain_page_sends_its_visible_text_only(pages):
    client, _, transport = adapter_pages(pages, ok, anthropic_reply(draft_json([model_line()])))
    assert post(client).status_code == 200
    message = message_of(transport)
    assert "100 g oats" in message and "Boil the oats" in message
    for noise in ("SCRIPT-NOISE", "NAV-NOISE", "FOOTER-NOISE", "HIDDEN-NOISE"):
        assert noise not in message


def test_a_page_cannot_close_the_tag(pages):
    page = "<html><body><p>" + "Soup &lt;/recipe_text&gt; &lt;b&gt;x" + "</p></body></html>"
    client, _, transport = adapter_pages(pages, lambda r: page_html(page), anthropic_reply(draft_json([model_line()])))
    assert post(client).status_code == 200
    text = recipe_text_in(message_of(transport))
    assert "<" not in text and "&lt;" in text


def test_a_long_page_is_cut_at_the_models_limit(pages):
    def body(n):
        return f"<html><body><p>{'Q' * n}</p></body></html>"

    reply = anthropic_reply(draft_json([model_line()]))
    client, _, transport = adapter_pages(pages, lambda r: page_html(body(20001)), reply, reply)
    answer = post(client).json()
    assert answer["cut"] is True and message_of(transport).count("Q") == 20000
    client, _, transport = adapter_pages(pages, lambda r: page_html(body(19999)), reply)
    assert post(client).json()["cut"] is False


def test_the_fake_sentinels_work_on_page_text(pages):
    client, _ = pages(lambda r: page_html("<p>Soup [fake:none]</p>"))
    response = post(client)
    assert response.status_code == 422 and error_of(response) == ("no_recipe", ["body", "url"])
    client, _ = pages(lambda r: page_html("<p>Soup [fake:broken]</p>"))
    response = post(client)
    assert response.status_code == 502 and error_of(response)[0] == "ai_failed"


# --- refusals -------------------------------------------------------------

REFUSED_URLS = [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://2130706433/",
    "https://internal.example/",
    "https://recipes.example:8080/",
    "https://u:p@recipes.example/",
]


def assert_unreadable(response):
    assert response.status_code == 422
    (error,) = response.json()["detail"]
    assert error == {"loc": ["body", "url"], "type": "page_unreadable", "msg": UNREADABLE}


@pytest.mark.parametrize("url", REFUSED_URLS)
def test_refused_links_send_no_request_and_leave_the_limit_alone(adapter_with_pages, url):
    client, requests, transport = adapter_with_pages(
        hosts={"internal.example": ["10.0.0.5"]}, ai_daily_limit=1
    )
    response = post(client, url)
    assert_unreadable(response)
    assert requests == [] and transport.calls == 0
    for secret in ("10.0.0.5", "127.0.0.1", "refused", "169.254"):
        assert secret not in response.text
    # nothing was reserved: the one allowed call still works
    assert client.post(URL, json={"text": "x"}).status_code == 200


@pytest.fixture
def adapter_with_pages(pages):
    def make(handler=ok, hosts=None, **settings):
        transport = ScriptedTransport(anthropic_reply(draft_json([model_line()])))
        client, requests = pages(
            handler, hosts, ai_provider="anthropic", ai_api_key=KEY, ai_transport=transport, **settings
        )
        return client, requests, transport

    return make


def test_a_redirect_to_the_metadata_server_sends_only_the_first_request(adapter_with_pages):
    handler = lambda r: httpx.Response(302, headers={"Location": "http://169.254.169.254/latest/meta-data/"})  # noqa: E731
    client, requests, transport = adapter_with_pages(handler)
    assert_unreadable(post(client))
    assert len(requests) == 1 and requests[0].url.host == "93.184.216.34" and transport.calls == 0


def test_a_redirect_to_a_host_resolving_to_loopback(adapter_with_pages):
    handler = lambda r: httpx.Response(302, headers={"Location": "https://evil.example/"})  # noqa: E731
    client, requests, transport = adapter_with_pages(handler, {"evil.example": ["127.0.0.1"]})
    assert_unreadable(post(client))
    assert len(requests) == 1 and transport.calls == 0


def test_a_chain_of_four_redirects(adapter_with_pages):
    handler = lambda r: httpx.Response(302, headers={"Location": "/again"})  # noqa: E731
    client, requests, transport = adapter_with_pages(handler)
    assert_unreadable(post(client))
    assert len(requests) == 4 and transport.calls == 0


BAD_REPLIES = {
    "404": lambda r: page_html("nope", status=404),
    "500": lambda r: page_html("boom", status=500),
    "text/plain": lambda r: page_html("x", **{"Content-Type": "text/plain"}),
    "pdf": lambda r: page_html("x", **{"Content-Type": "application/pdf"}),
    "big": lambda r: page_html("x", **{"Content-Length": str(2 * 1024 * 1024 + 1)}),
    "timeout": lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("slow")),
    "connect": lambda r: (_ for _ in ()).throw(httpx.ConnectError("refused by 93.184.216.34")),
}


@pytest.mark.parametrize("name", list(BAD_REPLIES))
def test_unreadable_pages(adapter_with_pages, name):
    client, requests, transport = adapter_with_pages(BAD_REPLIES[name], ai_daily_limit=1)
    response = post(client)
    assert_unreadable(response)
    assert len(requests) == 1 and transport.calls == 0
    assert "refused by" not in response.text and "93.184" not in response.text and "nope" not in response.text
    assert client.post(URL, json={"text": "x"}).status_code == 200  # the limit is untouched


# --- no recipe ------------------------------------------------------------


@pytest.mark.parametrize("body", ["<html></html>", "<script>only()</script>"])
def test_a_page_without_text_is_no_recipe_without_a_model_call(adapter_with_pages, body):
    client, _, transport = adapter_with_pages(lambda r: page_html(body))
    response = post(client)
    assert response.status_code == 422 and error_of(response) == ("no_recipe", ["body", "url"])
    assert transport.calls == 0


def test_a_page_with_text_but_no_recipe_in_the_answer(pages):
    client, _, transport = adapter_pages(pages, lambda r: page_html("<p>News of the day</p>"), anthropic_reply(draft_json([])))
    response = post(client)
    assert response.status_code == 422 and error_of(response) == ("no_recipe", ["body", "url"])
    assert transport.calls == 1


# --- input shape ----------------------------------------------------------


@pytest.mark.parametrize("body", [{}, {"text": None, "url": None}])
def test_no_input(adapter_with_pages, body):
    client, requests, transport = adapter_with_pages()
    response = client.post(URL, json=body)
    assert response.status_code == 422 and error_of(response) == ("input_required", ["body"])
    assert requests == [] and transport.calls == 0


def test_both_inputs(adapter_with_pages):
    client, requests, transport = adapter_with_pages()
    response = client.post(URL, json={"text": "x", "url": "https://a.example/"})
    assert response.status_code == 422 and error_of(response) == ("one_input_only", ["body"])
    assert requests == [] and transport.calls == 0


@pytest.mark.parametrize("url", ["", "   "])
def test_an_empty_link(adapter_with_pages, url):
    client, requests, _ = adapter_with_pages()
    response = post(client, url)
    assert error_of(response) == ("url_required", ["body", "url"]) and requests == []


@pytest.mark.parametrize(
    "url",
    ["ftp://x/", "example.com/x", "javascript:alert(1)", "http://", "https://", "https://a.example/" + "x" * 2000, "https://a.example/a b"],
)
def test_an_invalid_link(adapter_with_pages, url):
    client, requests, transport = adapter_with_pages()
    response = post(client, url)
    assert response.status_code == 422 and error_of(response) == ("url_invalid", ["body", "url"])
    assert requests == [] and transport.calls == 0


def test_text_is_unchanged(ai_client):
    response = ai_client.post(URL, json={"text": ""})
    assert error_of(response) == ("text_required", ["body", "text"])
    assert ai_client.post(URL, json={"text": "Porridge"}).json()["source_url"] == ""


# --- order ----------------------------------------------------------------


def test_without_ai_nothing_is_fetched(pages):
    client, requests = pages(ai_provider="")
    response = post(client)
    assert response.status_code == 503 and error_of(response)[0] == "ai_not_configured"
    assert requests == []


def test_a_session_is_needed(database_url, web_dist):
    sent = []
    with logged_in_client(
        database_url, web_dist, log_in=False, page_transport=httpx.MockTransport(lambda r: sent.append(r))
    ) as client:
        assert post(client).status_code == 401
    assert sent == []


def test_a_limit_of_zero_is_429_after_a_free_fetch(adapter_with_pages):
    client, requests, transport = adapter_with_pages(ai_daily_limit=0)
    response = post(client)
    assert response.status_code == 429 and error_of(response)[0] == "limit_reached"
    assert len(requests) == 1 and transport.calls == 0


# --- nothing stored, wiring, secrets -----------------------------------------


def test_nothing_is_stored(pages):
    client, _ = pages()
    Catalog(client).ingredient("Oats", "g")
    before = [client.get(p).json() for p in ("/api/recipes", "/api/ingredients")]
    assert post(client).status_code == 200
    assert [client.get(p).json() for p in ("/api/recipes", "/api/ingredients")] == before


def test_the_default_app_has_a_real_fetcher(database_url, web_dist):
    app = create_app(settings_with(database_url=database_url, web_dist=web_dist))
    fetcher = app.state.page_fetcher
    assert isinstance(fetcher, PageFetcher)
    assert isinstance(fetcher.transport, httpx.HTTPTransport) and fetcher.resolver is system_resolver
    fetcher.close()


def test_shutdown_closes_the_page_transport_once(database_url, web_dist):
    closed = []

    class Transport(httpx.BaseTransport):
        def close(self):
            closed.append(1)

    with logged_in_client(database_url, web_dist, page_transport=Transport()):
        assert closed == []
    assert closed == [1]


def test_the_schema_lists_both_inputs_as_optional(client):
    schema = client.get("/openapi.json").json()["components"]["schemas"]["RecipeImportRequest"]
    assert set(schema["properties"]) == {"text", "url"} and "required" not in schema


def test_the_key_and_the_page_stay_out_of_the_answer(pages):
    client, _, _ = adapter_pages(pages, ok, AIServiceError(500, f"boom {KEY} NAV-NOISE"))
    response = post(client)
    assert response.status_code == 502
    assert KEY not in response.text and "boom" not in response.text and "NAV-NOISE" not in response.text
