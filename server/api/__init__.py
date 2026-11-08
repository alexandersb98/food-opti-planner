"""API routes, all under /api. Only health and login are open; every other
route goes in `protected`, which needs a session."""

from fastapi import APIRouter, Depends

from ..auth import require_session
from . import (
    attributes,
    counts,
    data_sources,
    health,
    ingredients,
    login,
    plan,
    plan_results,
    preferences,
    recipes,
    solve,
    tags,
    units,
)

protected = APIRouter(dependencies=[Depends(require_session)])
protected.include_router(login.session_router)
protected.include_router(counts.router)
protected.include_router(units.router)
protected.include_router(preferences.router)
protected.include_router(data_sources.router)
protected.include_router(attributes.router)
protected.include_router(tags.router)
protected.include_router(ingredients.router)
protected.include_router(recipes.router)
protected.include_router(plan.router)
protected.include_router(solve.router)
protected.include_router(plan_results.router)

router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(login.login_router)
router.include_router(protected)
