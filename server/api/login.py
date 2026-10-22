"""POST /api/login is open; POST /api/logout and GET /api/session need a session."""

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

from ..auth import SESSION_COOKIE, SESSION_MAX_AGE

login_router = APIRouter()
session_router = APIRouter()

COOKIE_FLAGS = {"path": "/api", "httponly": True, "secure": True, "samesite": "strict"}


class Login(BaseModel):
    password: str


@login_router.post(
    "/login",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"description": "Wrong password"}},
)
async def login(body: Login, request: Request, response: Response) -> None:
    auth = request.app.state.auth
    if not await auth.check_password(body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong password")
    response.set_cookie(SESSION_COOKIE, auth.new_session(), max_age=SESSION_MAX_AGE, **COOKIE_FLAGS)


@session_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, **COOKIE_FLAGS)


@session_router.get("/session", status_code=status.HTTP_204_NO_CONTENT)
def session() -> None:
    """Answers 204 while logged in (401 otherwise); the app checks this on navigation."""
