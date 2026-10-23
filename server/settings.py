"""Server settings, read from environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATABASE_URL = "sqlite:///./planner.db"
DEFAULT_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL
    # Neon's direct connection; its pooled one (database_url) goes through
    # PgBouncer, which migrations should not. Empty means database_url.
    migration_database_url: str = ""
    web_dist: Path = DEFAULT_WEB_DIST
    migrate_on_startup: bool = True
    password_hash: str = ""  # Argon2, from python -m server.hash_password
    session_key: str = ""  # signs the session cookie

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = _with_psycopg(os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL))
        return cls(
            database_url=database_url,
            migration_database_url=_with_psycopg(
                os.environ.get("DATABASE_URL_UNPOOLED", database_url)
            ),
            web_dist=Path(os.environ.get("WEB_DIST", DEFAULT_WEB_DIST)),
            password_hash=os.environ.get("PASSWORD_HASH", ""),
            session_key=os.environ.get("SESSION_KEY", ""),
        )


def _with_psycopg(url: str) -> str:
    """Neon hands out postgresql:// URLs; SQLAlchemy needs to be told the driver."""
    for scheme in ("postgresql://", "postgres://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url
