from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from server import ai_usage
from server.ai.chat import Completion
from server.ai_usage import DailyLimitReached, LimitedChat, reserve
from server.db import migrate
from server.models import AICallCount


@pytest.fixture
def engine(database_url):
    migrate(database_url)
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


def count(engine, day=None):
    with Session(engine) as db:
        rows = db.scalars(select(AICallCount)).all()
        return {row.day: row.calls for row in rows} if day is None else {r.day: r.calls for r in rows}.get(day)


def test_the_first_limit_reservations_pass_and_the_next_raises(engine):
    for _ in range(3):
        reserve(engine, 3)
    with pytest.raises(DailyLimitReached):
        reserve(engine, 3)
    assert list(count(engine).values()) == [3]


def test_a_new_day_starts_at_zero(engine, monkeypatch):
    monkeypatch.setattr(ai_usage, "today", lambda: date(2026, 1, 1))
    reserve(engine, 1)
    with pytest.raises(DailyLimitReached):
        reserve(engine, 1)
    monkeypatch.setattr(ai_usage, "today", lambda: date(2026, 1, 2))
    reserve(engine, 1)
    assert count(engine) == {date(2026, 1, 1): 1, date(2026, 1, 2): 1}


def test_a_limit_of_zero_raises_and_writes_nothing(engine):
    with pytest.raises(DailyLimitReached):
        reserve(engine, 0)
    assert count(engine) == {}


def test_counts_persist_across_engines(engine, database_url):
    reserve(engine, 2)
    other = create_engine(database_url)
    try:
        reserve(other, 2)
        with pytest.raises(DailyLimitReached):
            reserve(other, 2)
    finally:
        other.dispose()


class Inner:
    def __init__(self, fail=False):
        self.calls = 0
        self.fail = fail

    def complete(self, system, user, *, max_tokens):
        self.calls += 1
        if self.fail:
            raise RuntimeError("boom")
        return Completion("x", 1, 1)


def test_limited_chat_calls_the_inner_chat_only_after_a_reservation(engine):
    inner = Inner()
    chat = LimitedChat(inner, engine, 1)
    chat.complete("s", "u", max_tokens=1)
    with pytest.raises(DailyLimitReached):
        chat.complete("s", "u", max_tokens=1)
    assert inner.calls == 1


def test_a_failing_call_still_counts(engine):
    chat = LimitedChat(Inner(fail=True), engine, 5)
    with pytest.raises(RuntimeError):
        chat.complete("s", "u", max_tokens=1)
    assert list(count(engine).values()) == [1]
