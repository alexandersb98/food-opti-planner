"""Preferences: defaults, validation, reading and saving. No FastAPI import."""

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
    if _default is None or not _default.offered or _default.category != _category:
        raise RuntimeError(f"the default for {_key} is not an offered {_category} unit")


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


def _offered_unit(key: str, value: object) -> units.Unit | None:
    unit = units.parse(value) if isinstance(value, str) else None
    if unit is not None and unit.offered and unit.category == UNIT_KEYS[key]:
        return unit
    return None


def refusals(changes: dict[str, object]) -> dict[str, str]:
    """The changes the API must refuse, by key, with the reason: a unit that
    is not offered for its key's category (any spelling is fine), or a null."""
    return {
        key: f"Not a unit offered for {UNIT_KEYS[key]}"
        for key, value in changes.items()
        if key in UNIT_KEYS and _offered_unit(key, value) is None
    }


def canonical(changes: dict[str, str]) -> dict[str, str]:
    """The changes with each unit as the catalogue spells it. Raises
    ValueError for a change `refusals` would refuse."""
    spelled = {}
    for key, value in changes.items():
        unit = _offered_unit(key, value) if key in UNIT_KEYS else None
        if unit is None:
            raise ValueError(f"{value!r} is not a valid value for {key!r}")
        spelled[key] = unit.symbol
    return spelled
