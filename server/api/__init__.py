"""API routes, all under /api. Only health and login are open; every other
route goes in `protected`, which needs a session."""

from fastapi import APIRouter, Depends

from ..auth import require_session
from . import attributes, counts, health, login

protected = APIRouter(dependencies=[Depends(require_session)])
protected.include_router(login.session_router)
protected.include_router(counts.router)
protected.include_router(attributes.router)

router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(login.login_router)
router.include_router(protected)
