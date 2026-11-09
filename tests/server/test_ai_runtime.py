import pytest

import server.ai_runtime as ai_runtime
from server.ai_runtime import AIRuntime, NotConfigured
from server.db import make_engine, migrate

from .conftest import ScriptedTransport, anthropic_reply, logged_in_client, settings_with


def runtime(**changes):
    return AIRuntime(settings_with(**changes))


def test_configured_only_with_a_provider_and_a_key_or_fake():
    assert runtime(ai_provider="anthropic", ai_api_key="").configured is False
    assert runtime(ai_provider="anthropic", ai_api_key="k").configured is True
    assert runtime(ai_provider="fake").configured is True
    assert runtime(ai_provider="").configured is False


def test_limited_needs_a_configured_runtime(database_url):
    with pytest.raises(NotConfigured):
        runtime(ai_provider="").limited(make_engine(database_url))


def test_one_transport_is_made_however_many_chats(monkeypatch, database_url):
    made = []

    class Counting:
        def __init__(self, *a, **k):
            made.append(self)
            self.closed = 0

        def close(self):
            self.closed += 1

    monkeypatch.setattr(ai_runtime, "HttpxTransport", Counting)
    ai = runtime(ai_provider="anthropic", ai_api_key="k")
    engine = make_engine(database_url)
    for _ in range(3):
        ai.limited(engine)
    assert len(made) == 1
    ai.close()
    ai.close()
    assert made[0].closed == 1


def test_fake_makes_no_transport(monkeypatch):
    monkeypatch.setattr(ai_runtime, "HttpxTransport", lambda *a, **k: pytest.fail("made a transport"))
    ai = runtime(ai_provider="fake")
    ai.close()


def test_a_given_transport_is_used_and_closed(database_url):
    migrate(database_url)
    transport = ScriptedTransport(anthropic_reply("{}"))
    ai = AIRuntime(settings_with(ai_provider="anthropic", ai_api_key="KEY", ai_model="m-1"), transport)
    ai.limited(make_engine(database_url)).complete("sys", "usr", max_tokens=5)
    _, headers, body = transport.requests[0]
    assert headers["x-api-key"] == "KEY" and body["model"] == "m-1"
    ai.close()
    assert transport.closed == 1


def test_the_app_closes_the_transport_at_shutdown(database_url, web_dist):
    transport = ScriptedTransport()
    with logged_in_client(database_url, web_dist, ai_provider="anthropic", ai_api_key="k", ai_transport=transport):
        assert transport.closed == 0
    assert transport.closed == 1
