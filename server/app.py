"""The FastAPI app: the API under /api and the built frontend at /."""

from contextlib import asynccontextmanager
from pathlib import Path

from argon2 import extract_parameters
from argon2.exceptions import InvalidHashError
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from . import api, source_loader
from .ai.chat import Transport
from .ai_runtime import AIRuntime
from .auth import Auth
from .db import make_engine, migrate
from .page_fetch import PageFetcher, Resolver
from .settings import Settings


def create_app(
    settings: Settings | None = None,
    *,
    ai_transport: Transport | None = None,
    page_transport: httpx.BaseTransport | None = None,
    page_resolver: Resolver | None = None,
) -> FastAPI:
    """`ai_transport`, `page_transport` and `page_resolver` are for tests; the
    address check on fetched pages has no switch."""
    settings = settings or Settings.from_env()
    _check_login_settings(settings)
    ai = AIRuntime(settings, ai_transport)  # a bad AI setting stops the app, like a bad login one
    page_fetcher = PageFetcher(page_transport, page_resolver)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.migrate_on_startup:
            migrate(settings.database_url)
            source_loader.load_all(app.state.engine, settings.data_sources_dir)
        yield
        ai.close()
        page_fetcher.close()
        app.state.engine.dispose()

    app = FastAPI(title="Meal planner", lifespan=lifespan)
    app.state.engine = make_engine(settings.database_url)
    app.state.ai = ai
    app.state.page_fetcher = page_fetcher
    app.state.auth = Auth(settings.password_hash, settings.session_key)
    app.state.running_solve = api.solve.RunningSolve()
    app.include_router(api.router)
    if settings.web_dist.is_dir():
        _serve_frontend(app, settings.web_dist)
    return app


def _check_login_settings(settings: Settings) -> None:
    """Refuse to start without a usable password hash and session key."""
    try:
        extract_parameters(settings.password_hash)
    except InvalidHashError:
        raise ValueError(
            "PASSWORD_HASH must be an Argon2 hash; make one with: python -m server.hash_password"
        ) from None
    if not settings.session_key:
        raise ValueError("SESSION_KEY must be set")


def _serve_frontend(app: FastAPI, web_dist: Path) -> None:
    """Serve built files, and index.html for any other path (the SPA routes)."""
    root = web_dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            return FileResponse(file)
        return FileResponse(root / "index.html")
