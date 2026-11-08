"""Preferences: defaults, reading and saving. The API validates (see
`refusals`, added with it); this module has no FastAPI import."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, units
from .units import Category

UNIT_KEYS: dict[str, Category] = {
    "unit.mass": "mass",
    "unit.volume": "volume",
    "unit.energy": "energy",
}
DEFAULTS: dict[str, str] = {"unit.mass": "g", "unit.volume": "dl", "unit.energy": "kcal"}

for _key, _category in UNIT_KEYS.items():
    _default = units.parse(DEFAULTS[_key])
    assert _default is not None and _default.offered and _default.category == _category, _key


def read(db: Session) -> dict[str, str]:
    """Every known preference: the stored value, else the default. Stored
    rows for keys this version does not know are ignored."""
    values = dict(DEFAULTS)
    for row in db.scalars(select(models.Preference)):
        if row.key in DEFAULTS:
            values[row.key] = row.value
    return values


def preferred_unit(db: Session, category: Category) -> str:
    """The preferred unit symbol for a category."""
    key = next(k for k, c in UNIT_KEYS.items() if c == category)
    return read(db)[key]


def save(db: Session, changes: dict[str, str]) -> None:
    """Store the given values. Does not validate."""
    for key, value in changes.items():
        db.merge(models.Preference(key=key, value=value))
    db.commit()
