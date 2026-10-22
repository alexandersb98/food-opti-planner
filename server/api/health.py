"""GET /api/health: is the database reachable? Used after deploy."""

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class Health(BaseModel):
    database: bool


@router.get("/health")
def health(request: Request, response: Response) -> Health:
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Health(database=False)
    return Health(database=True)
