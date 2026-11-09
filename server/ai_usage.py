"""The daily limit on model calls (import spec "Safety").

One table, `ai_calls(day, calls)`. `reserve` adds a call atomically on its own
short transaction, independent of any request's session, so a refused or failed
import does not give the call back."""

from datetime import UTC, date, datetime

from sqlalchemy import Engine, insert, select, update
from sqlalchemy.exc import IntegrityError

from server.ai.chat import ChatProvider, Completion
from server.models import AICallCount


class DailyLimitReached(Exception):
    """Today's model calls are used up."""


def today() -> date:
    """The UTC date; tests replace it."""
    return datetime.now(UTC).date()


def _bump(connection, day: date, limit: int) -> bool:
    result = connection.execute(
        update(AICallCount)
        .where(AICallCount.day == day, AICallCount.calls < limit)
        .values(calls=AICallCount.calls + 1)
    )
    return result.rowcount == 1


def reserve(engine: Engine, limit: int) -> None:
    """Count one model call, or raise DailyLimitReached."""
    if limit < 1:
        raise DailyLimitReached()
    day = today()
    with engine.begin() as connection:
        if _bump(connection, day, limit):
            return
        if connection.execute(select(AICallCount.calls).where(AICallCount.day == day)).first():
            raise DailyLimitReached()
    # No row yet: insert it, on its own transaction as a lost race rolls it back.
    try:
        with engine.begin() as connection:
            connection.execute(insert(AICallCount).values(day=day, calls=1))
        return
    except IntegrityError:
        pass  # another request inserted the day's row first
    with engine.begin() as connection:
        if not _bump(connection, day, limit):
            raise DailyLimitReached()


class LimitedChat:
    """A ChatProvider that reserves a call before every call it passes on."""

    def __init__(self, inner: ChatProvider, engine: Engine, limit: int):
        self.inner = inner
        self.engine = engine
        self.limit = limit

    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        reserve(self.engine, self.limit)
        return self.inner.complete(system, user, max_tokens=max_tokens)
