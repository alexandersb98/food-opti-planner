"""Server settings, read from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_DATABASE_URL = "sqlite:///./planner.db"
# Provisional: see "Model comparison" in the import spec; the only model id in the code.
DEFAULT_AI_MODEL = "claude-sonnet-5-5"
DEFAULT_AI_DAILY_LIMIT = 50
DEFAULT_DATA_SOURCES_DIR = Path(__file__).resolve().parent / "data_sources"
DEFAULT_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL
    web_dist: Path = DEFAULT_WEB_DIST
    # Where the data files (*.json.gz) are read from at startup.
    data_sources_dir: Path = DEFAULT_DATA_SOURCES_DIR
    migrate_on_startup: bool = True
    password_hash: str = ""  # Argon2, from python -m server.hash_password
    session_key: str = ""  # signs the session cookie
    # Recipe import. The provider is one of server.ai.providers.ADAPTERS ("fake"
    # for tests); empty means no AI. The key is of whichever provider is named,
    # and is kept out of repr so it cannot land in a log or traceback.
    ai_provider: str = "anthropic"
    ai_model: str = DEFAULT_AI_MODEL
    ai_api_key: str = field(default="", repr=False)
    ai_daily_limit: int = DEFAULT_AI_DAILY_LIMIT  # model calls a day, UTC; 0 refuses all

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
            web_dist=Path(os.environ.get("WEB_DIST", DEFAULT_WEB_DIST)),
            data_sources_dir=Path(os.environ.get("DATA_SOURCES_DIR", DEFAULT_DATA_SOURCES_DIR)),
            password_hash=os.environ.get("PASSWORD_HASH", ""),
            session_key=os.environ.get("SESSION_KEY", ""),
            ai_provider=os.environ.get("AI_PROVIDER", "anthropic").strip(),
            ai_model=os.environ.get("AI_MODEL", DEFAULT_AI_MODEL).strip() or DEFAULT_AI_MODEL,
            ai_api_key=os.environ.get("AI_API_KEY", ""),
            ai_daily_limit=_daily_limit(os.environ.get("AI_DAILY_LIMIT")),
        )


def _daily_limit(value: str | None) -> int:
    if value is None or not value.strip():
        return DEFAULT_AI_DAILY_LIMIT
    try:
        limit = int(value)
    except ValueError:
        limit = -1
    if limit < 0:
        raise ValueError("AI_DAILY_LIMIT must be a whole number, 0 or more")
    return limit
