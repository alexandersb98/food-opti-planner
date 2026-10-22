"""The FastAPI app: the API under /api and the built frontend at /."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from . import api
from .db import make_engine, migrate
from .settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.migrate_on_startup:
            migrate(settings.database_url)
        yield
        app.state.engine.dispose()

    app = FastAPI(title="Meal planner", lifespan=lifespan)
    app.state.engine = make_engine(settings.database_url)
    app.include_router(api.router)
    if settings.web_dist.is_dir():
        _serve_frontend(app, settings.web_dist)
    return app


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
