"""GET /api/health: is the database reachable? Used after deploy."""

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class Health(BaseModel):
    database: bool
    ai_configured: bool  # whether recipe import can run; nothing more is said


@router.get("/health")
def health(request: Request, response: Response) -> Health:
    ai_configured = request.app.state.ai.configured
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Health(database=False, ai_configured=ai_configured)
    return Health(database=True, ai_configured=ai_configured)
