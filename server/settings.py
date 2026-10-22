"""Server settings, read from environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATABASE_URL = "sqlite:///./planner.db"
DEFAULT_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL
    web_dist: Path = DEFAULT_WEB_DIST
    migrate_on_startup: bool = True
    password_hash: str = ""  # Argon2, from python -m server.hash_password
    session_key: str = ""  # signs the session cookie

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            web_dist=Path(os.environ.get("WEB_DIST", DEFAULT_WEB_DIST)),
            password_hash=os.environ.get("PASSWORD_HASH", ""),
            session_key=os.environ.get("SESSION_KEY", ""),
        )
