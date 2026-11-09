import httpx
import pytest

from server.ai.chat import HttpxTransport
from server.ai.errors import AIServiceError

KEY = "sk-secret-key-123"
HEADERS = {"x-api-key": KEY, "content-type": "application/json"}


def transport(handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return HttpxTransport(client=client)


def test_ok_returns_json_and_sends_json_and_headers():
    seen = {}

    def handler(request):
        seen["request"] = request
        return httpx.Response(200, json={"a": 1})

    reply = transport(handler).post_json("https://example.test/x", HEADERS, {"q": "v"})
    assert reply == {"a": 1}
    request = seen["request"]
    assert request.headers["content-type"].startswith("application/json")
    assert request.headers["x-api-key"] == KEY
    assert request.read() == b'{"q":"v"}'


def test_error_status_with_provider_message():
    t = transport(lambda r: httpx.Response(500, json={"error": {"message": "overloaded"}}))
    with pytest.raises(AIServiceError) as caught:
        t.post_json("https://example.test/x", HEADERS, {})
    assert caught.value.status == 500
    assert caught.value.message == "overloaded"


def test_error_status_with_plain_body_is_cut():
    t = transport(lambda r: httpx.Response(502, text="x" * 500))
    with pytest.raises(AIServiceError) as caught:
        t.post_json("https://example.test/x", HEADERS, {})
    assert caught.value.status == 502 and len(caught.value.message) == 200


def test_non_json_200_raises():
    t = transport(lambda r: httpx.Response(200, text="<html>"))
    with pytest.raises(AIServiceError) as caught:
        t.post_json("https://example.test/x", HEADERS, {})
    assert caught.value.status == 200


def test_json_array_200_raises():
    t = transport(lambda r: httpx.Response(200, json=[1]))
    with pytest.raises(AIServiceError):
        t.post_json("https://example.test/x", HEADERS, {})


@pytest.mark.parametrize(
    "exc", [httpx.ReadTimeout("slow"), httpx.ConnectError(f"cannot connect with {KEY}")]
)
def test_network_errors_have_no_status_and_no_key(exc):
    def handler(request):
        raise exc

    with pytest.raises(AIServiceError) as caught:
        transport(handler).post_json("https://example.test/x", HEADERS, {})
    assert caught.value.status is None
    assert KEY not in str(caught.value) and KEY not in repr(caught.value)


def test_key_never_in_error_text():
    t = transport(lambda r: httpx.Response(401, json={"error": {"message": "bad key"}}))
    with pytest.raises(AIServiceError) as caught:
        t.post_json("https://example.test/x", HEADERS, {})
    assert KEY not in str(caught.value)


def test_timeout_is_passed_per_request_and_close_closes():
    seen = {}

    def handler(request):
        seen["timeout"] = request.extensions["timeout"]
        return httpx.Response(200, json={})

    t = HttpxTransport(timeout=7.0, client=httpx.Client(transport=httpx.MockTransport(handler)))
    t.post_json("https://example.test/x", HEADERS, {})
    assert seen["timeout"]["read"] == 7.0
    with t:
        pass
    assert t.client.is_closed
