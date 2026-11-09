"""GET /api/units: the unit catalogue (server/units.py), for the app."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .. import units
from ..fields import plain

router = APIRouter(tags=["units"])


class CatalogueUnit(BaseModel):
    symbol: str
    name: str
    category: units.Category | None = Field(description="None for a known free-text unit (st)")
    factor: str | None = Field(
        description="Of one unit in the category's base unit (g for mass, l for volume, J for "
        "energy), exact, as a plain decimal. None without a category."
    )
    aliases: list[str] = Field(description="Other spellings, matched ignoring case")
    case_sensitive_aliases: list[str] = Field(description="Other spellings, matched exactly")
    offered: bool = Field(description="Whether the unit drop-downs list it")


class UnitCatalogue(BaseModel):
    units: list[CatalogueUnit]


def unit_catalogue() -> UnitCatalogue:
    return UnitCatalogue(
        units=[
            CatalogueUnit(
                symbol=u.symbol,
                name=u.name,
                category=u.category,
                factor=None if u.factor is None else plain(u.factor),
                aliases=list(u.aliases),
                case_sensitive_aliases=list(u.case_sensitive_aliases),
                offered=u.offered,
            )
            for u in units.catalogue()
        ]
    )


@router.get("/units")
def get_units() -> UnitCatalogue:
    return unit_catalogue()
