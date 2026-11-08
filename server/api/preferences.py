"""GET and PUT /api/preferences: the preferred units (and later other
settings), saved on the server."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from .. import preferences
from ..db import DbSession
from .errors import FieldError, invalid_fields

router = APIRouter(tags=["preferences"])


class Preferences(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    unit_mass: str = Field(alias="unit.mass")
    unit_volume: str = Field(alias="unit.volume")
    unit_energy: str = Field(alias="unit.energy")


class PreferenceChanges(BaseModel):
    """Any subset of the preferences. A unit may be typed in any spelling and
    is saved as the catalogue's."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    unit_mass: str | None = Field(None, alias="unit.mass")
    unit_volume: str | None = Field(None, alias="unit.volume")
    unit_energy: str | None = Field(None, alias="unit.energy")


def _response(db: DbSession) -> Preferences:
    return Preferences.model_validate(preferences.read(db))


@router.get("/preferences")
def get_preferences(db: DbSession) -> Preferences:
    return _response(db)


@router.put(
    "/preferences",
    responses={422: {"description": "A unit that is not offered for its preference"}},
)
def put_preferences(body: PreferenceChanges, db: DbSession) -> Preferences:
    changes = body.model_dump(by_alias=True, exclude_unset=True)
    refused = preferences.refusals(changes)
    if refused:
        raise invalid_fields(
            [FieldError(loc=["body", key], type="invalid_unit", msg=msg) for key, msg in refused.items()]
        )
    preferences.save(db, preferences.canonical(changes))
    return _response(db)
