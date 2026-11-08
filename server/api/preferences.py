"""/api/preferences: the user's preferences (S1). For now the preferred unit
of each category, the default for new things only (units spec decision 7)."""

from typing import Annotated

from fastapi import APIRouter
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic_core import PydanticCustomError
from sqlalchemy import select

from .. import models, units
from ..db import DbSession

router = APIRouter(prefix="/preferences", tags=["preferences"])

# Each key, and its value when none is stored.
DEFAULTS = {"unit.mass": "g", "unit.volume": "dl", "unit.energy": "kcal"}


def _offered_in(category: units.Category):
    """A unit offered for `category`, in any spelling; kept as its symbol."""

    def check(text: str) -> str:
        unit = units.parse(text)
        offered = units.display_units(category)
        if unit not in offered:
            symbols = ", ".join(u.symbol for u in offered)
            raise PydanticCustomError("unit_not_offered", "Must be one of: {symbols}", {"symbols": symbols})
        return unit.symbol

    return AfterValidator(check)


MassUnit = Annotated[str, _offered_in("mass")]
VolumeUnit = Annotated[str, _offered_in("volume")]
EnergyUnit = Annotated[str, _offered_in("energy")]


class Preferences(BaseModel):
    unit_mass: str = Field(alias="unit.mass")
    unit_volume: str = Field(alias="unit.volume")
    unit_energy: str = Field(alias="unit.energy")


class PreferencesUpdate(BaseModel):
    """The keys to change; the others keep their value."""

    model_config = ConfigDict(extra="forbid")

    # None only as the default: a key sent must have a unit.
    unit_mass: MassUnit = Field(None, alias="unit.mass")  # type: ignore[assignment]
    unit_volume: VolumeUnit = Field(None, alias="unit.volume")  # type: ignore[assignment]
    unit_energy: EnergyUnit = Field(None, alias="unit.energy")  # type: ignore[assignment]


def _read(db: DbSession) -> Preferences:
    stored = dict(db.execute(select(models.Preference.key, models.Preference.value)).all())
    return Preferences.model_validate({key: stored.get(key, default) for key, default in DEFAULTS.items()})


@router.get("")
def get_preferences(db: DbSession) -> Preferences:
    return _read(db)


@router.put("")
def update_preferences(body: PreferencesUpdate, db: DbSession) -> Preferences:
    for key, value in body.model_dump(by_alias=True, exclude_unset=True).items():
        row = db.get(models.Preference, key)
        if row:
            row.value = value
        else:
            db.add(models.Preference(key=key, value=value))
    db.commit()
    return _read(db)
