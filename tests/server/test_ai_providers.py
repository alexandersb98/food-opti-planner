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
from server.ai.schema import DRAFT_SCHEMA, FACTOR_SCHEMA, strict_schema

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
            "output_config": {"effort": "low"},
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


def test_anthropic_enforces_the_schema_with_structured_outputs():
    chat, transport = make("anthropic", recorded("anthropic")["ok"])
    chat.complete(SYSTEM, USER, max_tokens=321, schema=DRAFT_SCHEMA)
    (_, _, body), = transport.calls
    assert body["output_config"] == {
        "effort": "low",
        "format": {"type": "json_schema", "schema": strict_schema(DRAFT_SCHEMA)},
    }


@pytest.mark.parametrize("provider", ["gemini", "openai", "mistral"])
def test_other_providers_accept_a_schema_and_keep_their_request(provider):
    chat, transport = make(provider, recorded(provider)["ok"])
    chat.complete(SYSTEM, USER, max_tokens=321)
    chat.complete(SYSTEM, USER, max_tokens=321, schema=DRAFT_SCHEMA)
    assert transport.calls[0] == transport.calls[1]


def test_anthropic_skips_thinking_blocks():
    reply = recorded("anthropic")["ok"]
    reply["content"].insert(0, {"type": "thinking", "thinking": "", "signature": "sig"})
    chat, _ = make("anthropic", reply)
    assert chat.complete(SYSTEM, USER, max_tokens=5).text.strip().startswith("{")


@pytest.mark.parametrize(
    ("stop_reason", "message"), [("max_tokens", "cut off"), ("refusal", "declined")]
)
def test_anthropic_cut_off_or_refused_answer_is_bad_answer(stop_reason, message):
    reply = recorded("anthropic")["ok"]
    reply["stop_reason"] = stop_reason
    chat, _ = make("anthropic", reply)
    with pytest.raises(BadAnswerError, match=message):
        chat.complete(SYSTEM, USER, max_tokens=5)


def _objects(schema):
    if schema.get("type") == "object":
        yield schema
    for sub in schema.get("properties", {}).values():
        yield from _objects(sub)
    if "items" in schema:
        yield from _objects(schema["items"])


@pytest.mark.parametrize("schema", [DRAFT_SCHEMA, FACTOR_SCHEMA])
def test_strict_schema_is_what_structured_outputs_accept(schema):
    strict = strict_schema(schema)
    text = json.dumps(strict)
    for word in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"):
        assert f'"{word}"' not in text
    objects = list(_objects(strict))
    assert objects and all(o["additionalProperties"] is False for o in objects)
    assert all(set(o["required"]) == set(o["properties"]) for o in objects)
    assert '"type": [' not in text  # a list of types is written as anyOf


def test_strict_schema_writes_a_list_of_types_as_any_of_and_leaves_the_original():
    line = DRAFT_SCHEMA["properties"]["sections"]["items"]["properties"]["lines"]["items"]
    strict = strict_schema(DRAFT_SCHEMA)
    strict_line = strict["properties"]["sections"]["items"]["properties"]["lines"]["items"]
    assert strict_line["properties"]["amount"] == {"anyOf": [{"type": "number"}, {"type": "null"}]}
    assert line["properties"]["amount"] == {"type": ["number", "null"]}
    assert "additionalProperties" not in DRAFT_SCHEMA
