"""The single-user login: the password check and the signed session cookie."""

import asyncio

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from itsdangerous import BadSignature, URLSafeTimedSerializer

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60  # 30 days, in seconds
MAX_DELAY = 30  # seconds


def failed_login_delay(failures: int) -> float:
    """Seconds to wait after the given number of failed logins in a row."""
    return min(2 ** (failures - 1), MAX_DELAY)


class Auth:
    def __init__(self, password_hash: str, session_key: str):
        self._password_hash = password_hash
        self._hasher = PasswordHasher()
        self._serializer = URLSafeTimedSerializer(session_key, salt="session")
        # One attempt at a time, so parallel guesses wait out each other's delay.
        self._lock = asyncio.Lock()
        self._failures = 0
        self.sleep = asyncio.sleep  # tests replace this

    async def check_password(self, password: str) -> bool:
        async with self._lock:
            if await run_in_threadpool(self._verify, password):
                self._failures = 0
                return True
            self._failures += 1
            await self.sleep(failed_login_delay(self._failures))
            return False

    def _verify(self, password: str) -> bool:
        try:
            return self._hasher.verify(self._password_hash, password)
        except VerificationError:
            return False

    def new_session(self) -> str:
        return self._serializer.dumps("owner")

    def is_session(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            self._serializer.loads(token, max_age=SESSION_MAX_AGE)
        except BadSignature:  # also covers an expired token
            return False
        return True


def require_session(request: Request) -> None:
    """Dependency for every protected route: answer 401 without a valid session."""
    if not request.app.state.auth.is_session(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")
