"""GET and PUT /api/preferences: the preferred units (and later other
settings), saved on the server."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from .. import models, preferences
from ..db import DbSession
from .errors import FieldError, invalid_fields

router = APIRouter(tags=["preferences"])


class Preferences(BaseModel):
    unit_mass: str = Field(alias="unit.mass")
    unit_volume: str = Field(alias="unit.volume")
    unit_energy: str = Field(alias="unit.energy")
    # The key of the data source Add from data source used last; null until set.
    last_data_source: str | None = None


class PreferenceChanges(BaseModel):
    """Any subset of the preferences. A unit may be typed in any spelling and
    is saved as the catalogue's."""

    model_config = ConfigDict(extra="forbid")

    unit_mass: str | None = Field(None, alias="unit.mass")
    unit_volume: str | None = Field(None, alias="unit.volume")
    unit_energy: str | None = Field(None, alias="unit.energy")
    # The key of a loaded data source (null is refused: the app never clears it).
    last_data_source: str | None = None


def _response(db: DbSession) -> Preferences:
    return Preferences.model_validate(preferences.read(db))


@router.get("/preferences")
def get_preferences(db: DbSession) -> Preferences:
    return _response(db)


@router.put(
    "/preferences",
    responses={
        422: {
            "description": "A unit that is not offered for its preference, or a last_data_source "
            "that is not the key of a loaded data source"
        }
    },
)
def put_preferences(body: PreferenceChanges, db: DbSession) -> Preferences:
    changes = body.model_dump(by_alias=True, exclude_unset=True)
    source = changes.pop("last_data_source", preferences.UNSET)
    refused = preferences.refusals(changes)
    errors = [FieldError(loc=["body", key], type="invalid_unit", msg=msg) for key, msg in refused.items()]
    if source is not preferences.UNSET and (
        source is None or db.scalar(select(models.DataSource.id).where(models.DataSource.key == source)) is None
    ):
        errors.append(
            FieldError(loc=["body", "last_data_source"], type="invalid_data_source", msg="Not a loaded data source")
        )
    if errors:
        raise invalid_fields(errors)
    saved = preferences.canonical(changes)
    if source is not preferences.UNSET:
        saved["last_data_source"] = source
    preferences.save(db, saved)
    return _response(db)
