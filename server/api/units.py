"""/api/units: the unit catalogue, for the app's unit drop-downs (units spec
decision 9: the server owns the catalogue)."""

from fastapi import APIRouter
from pydantic import BaseModel

from .. import units

router = APIRouter(prefix="/units", tags=["units"])


class UnitInfo(BaseModel):
    symbol: str  # the catalogue spelling, stored when chosen
    category: units.Category | None  # None: a known free-text unit (st)
    aliases: list[str]  # other spellings it reads as, for finding it ("msk")


@router.get("")
def list_units() -> list[UnitInfo]:
    """The units offered: per category (mass, volume, energy) from small to
    large, then the known free-text units."""
    return [
        UnitInfo(symbol=unit.symbol, category=unit.category, aliases=list(unit.aliases))
        for unit in units.display_units()
    ]
