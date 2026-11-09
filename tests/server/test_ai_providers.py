import importlib
import json
from pathlib import Path

import httpx
import pytest

from server.ai.chat import HttpxTransport
from server.ai.converter import ProviderRecipeConverter
from server.ai.draft import CatalogEntry, Draft
from server.ai.errors import AIError, AIServiceError, BadAnswerError
from server.ai.providers import ADAPTERS, KEY_ENV, build_chat

DATA = Path(__file__).parents[1] / "data" / "ai_responses"
KEY = "test-key-abc"
SYSTEM = "SYSTEM TEXT"
USER = "USER TEXT"
CATALOG = [CatalogEntry("Mjölk", "ml")]
PROVIDERS = ["anthropic", "gemini", "openai", "mistral"]


def recorded(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


class FakeTransport:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def post_json(self, url, headers, body):
        self.calls.append((url, dict(headers), body))
        return self.reply


def make(provider, reply):
    transport = FakeTransport(reply)
    return build_chat(provider, "model-x", KEY, transport), transport


def test_adapter_keys():
    assert sorted(set(ADAPTERS) - {"fake"}) == sorted(PROVIDERS) == sorted(KEY_ENV)
    assert KEY_ENV["gemini"] == "GEMINI_API_KEY"


@pytest.mark.parametrize("provider", PROVIDERS)
def test_request_shape(provider):
    chat, transport = make(provider, recorded(provider)["ok"])
    completion = chat.complete(SYSTEM, USER, max_tokens=321)
    (url, headers, body), = transport.calls
    if provider == "anthropic":
        assert url == "https://api.anthropic.com/v1/messages"
        assert headers["x-api-key"] == KEY
        assert headers["anthropic-version"] == "2023-06-01"
        assert body == {
            "model": "model-x",
            "max_tokens": 321,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": USER}],
        }
    elif provider == "gemini":
        assert url == (
            "https://generativelanguage.googleapis.com/v1beta/models/model-x:generateContent"
        )
        assert headers["x-goog-api-key"] == KEY
        assert body["systemInstruction"] == {"parts": [{"text": SYSTEM}]}
        assert body["contents"] == [{"role": "user", "parts": [{"text": USER}]}]
        assert body["generationConfig"] == {
            "responseMimeType": "application/json",
            "maxOutputTokens": 321,
        }
        assert "model" not in body
    else:
        host = {"openai": "api.openai.com", "mistral": "api.mistral.ai"}[provider]
        assert url == f"https://{host}/v1/chat/completions"
        assert headers["Authorization"] == f"Bearer {KEY}"
        assert body["model"] == "model-x"
        assert body["response_format"] == {"type": "json_object"}
        assert body["messages"] == [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": USER},
        ]
        limit = "max_completion_tokens" if provider == "openai" else "max_tokens"
        assert body[limit] == 321
    assert completion.input_tokens == 1500 and completion.output_tokens == 420
    assert completion.text.strip().startswith("{")
    # the key is only ever in a header
    assert KEY not in json.dumps(body) and KEY not in url


def test_gemini_model_id_is_url_quoted():
    transport = FakeTransport(recorded("gemini")["ok"])
    build_chat("gemini", "tuned/model x", KEY, transport).complete("s", "u", max_tokens=5)
    assert "/models/tuned%2Fmodel%20x:generateContent" in transport.calls[0][0]


@pytest.mark.parametrize("provider", PROVIDERS)
@pytest.mark.parametrize("variant", ["ok", "ok_fenced"])
def test_converter_over_recorded_reply(provider, variant):
    chat, _ = make(provider, recorded(provider)[variant])
    draft = ProviderRecipeConverter(chat).convert("recipe", CATALOG)
    assert isinstance(draft, Draft) and draft.lines
    plain, _ = make(provider, recorded(provider)["ok"])
    assert draft == ProviderRecipeConverter(plain).convert("recipe", CATALOG)


@pytest.mark.parametrize("provider", PROVIDERS)
def test_empty_reply_is_bad_answer(provider):
    chat, _ = make(provider, recorded(provider)["empty"])
    with pytest.raises(BadAnswerError, match="no text"):
        chat.complete(SYSTEM, USER, max_tokens=5)


@pytest.mark.parametrize("provider", PROVIDERS)
def test_malformed_reply_is_bad_answer_not_key_error(provider):
    chat, _ = make(provider, {})
    with pytest.raises(BadAnswerError):
        chat.complete(SYSTEM, USER, max_tokens=5)


@pytest.mark.parametrize("provider", PROVIDERS)
def test_reply_without_usage_is_bad_answer(provider):
    reply = dict(recorded(provider)["ok"])
    for key in ("usage", "usageMetadata"):
        reply.pop(key, None)
    chat, _ = make(provider, reply)
    with pytest.raises(BadAnswerError, match="usage"):
        chat.complete(SYSTEM, USER, max_tokens=5)


def test_gemini_missing_output_count_is_zero():
    reply = recorded("gemini")["ok"]
    del reply["usageMetadata"]["candidatesTokenCount"]
    chat, _ = make("gemini", reply)
    assert chat.complete(SYSTEM, USER, max_tokens=5).output_tokens == 0


@pytest.mark.parametrize("provider", PROVIDERS)
def test_error_reply_becomes_service_error(provider):
    error = recorded(provider)["error"]
    client = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(error["status"], json=error["body"]))
    )
    chat = build_chat(provider, "m", KEY, HttpxTransport(client=client))
    with pytest.raises(AIServiceError) as caught:
        chat.complete(SYSTEM, USER, max_tokens=5)
    assert caught.value.status == error["status"]
    assert caught.value.message
    assert KEY not in str(caught.value)


def test_build_chat_returns_the_adapter_and_refuses_unknown():
    for provider in PROVIDERS:
        chat, transport = make(provider, {})
        assert type(chat) is ADAPTERS[provider]
        assert type(chat.transport).__name__ == "KeyScrubbingTransport"
        assert chat.transport.inner is transport
    with pytest.raises(ValueError, match="anthropic"):
        build_chat("nope", "m", KEY)


@pytest.mark.parametrize(
    "module",
    [
        "anthropic_messages",
        "gemini_generate",
        "openai_chat",
        "mistral_chat",
        "_chat_completions",
    ],
)
def test_module_docstring_says_not_verified(module):
    mod = importlib.import_module(f"server.ai.providers.{module}")
    assert "not verified" in mod.__doc__


def test_unknown_provider_is_an_ai_error():
    with pytest.raises(AIError):
        build_chat("nope", "m", KEY)


def test_key_echoed_in_provider_error_is_scrubbed():
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(401, json={"error": {"message": f"bad key {KEY}"}})
        )
    )
    chat = build_chat("openai", "m", KEY, HttpxTransport(client=client))
    with pytest.raises(AIServiceError) as caught:
        chat.complete(SYSTEM, USER, max_tokens=5)
    assert KEY not in str(caught.value) and KEY not in caught.value.message
    assert "bad key" in caught.value.message
