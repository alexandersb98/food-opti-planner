"""The unit catalogue (units spec): which unit texts are known, their
category and their exact factor to the category's base. Pure: no database.

Mass, volume and energy have a base (g, l, J); the SI prefixes µ, m, c, d
and k are understood on each base and on cal. Other units are listed with
their factor. Any other text is a free-text unit, which converts to
nothing; a few common ones (`st`, pieces) are known by name only.
"""

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

Category = Literal["mass", "volume", "energy"]
CATEGORIES: tuple[Category, ...] = ("mass", "volume", "energy")


@dataclass(frozen=True)
class Unit:
    symbol: str  # the catalogue spelling, stored when the unit is chosen
    category: Category | None  # None: a known free-text unit
    factor: Decimal | None  # to the category's base; None for free text
    aliases: tuple[str, ...] = ()


MICRO = "µ"  # the micro sign; the Greek mu reads as it
PREFIXES = {MICRO: Decimal("0.000001"), "m": Decimal("0.001"), "c": Decimal("0.01"), "d": Decimal("0.1"), "k": Decimal(1000)}  # fmt: skip

# Prefixable units: (symbol, category, factor to the base).
_PREFIXABLE: list[tuple[str, Category, Decimal]] = [
    ("g", "mass", Decimal(1)),
    ("l", "volume", Decimal(1)),
    ("J", "energy", Decimal(1)),
    ("cal", "energy", Decimal("4.184")),
]

# Aliases of base and prefixed units. Spellings that differ from the symbol
# by case only need none (reading ignores case), except "Cal", which is kcal
# while "cal" is the small calorie. "u" for µ is added on every base below.
_ALIASES = {
    "g": ("gram", "grams"),
    "l": ("litre", "liter"),
    "µg": ("mcg",),
    "kcal": ("Cal",),
}

# Listed units: (symbol, category, factor to the base, aliases). tbsp and tsp
# are the metric ones; a bare "cup" is not known, its size depends on the
# country. The Swedish recipe spellings come from the slices plan.
_LISTED: list[tuple[str, Category, Decimal, tuple[str, ...]]] = [
    ("oz", "mass", Decimal("28.349523125"), ("ounce",)),
    ("lb", "mass", Decimal("453.59237"), ("pound",)),
    ("tsp", "volume", Decimal("0.005"), ("tsk", "teaspoon", "tesked", "tsk.")),
    ("tbsp", "volume", Decimal("0.015"), ("msk", "tablespoon", "matsked", "msk.")),
    ("krm", "volume", Decimal("0.001"), ("kryddmått",)),
    ("US cup", "volume", Decimal("0.2365882365"), ()),
    ("metric cup", "volume", Decimal("0.25"), ()),
    ("fl oz", "volume", Decimal("0.0295735295625"), ("US fl oz",)),
]

# Known free-text units: a spelling of their own, but no category or factor.
_FREE_TEXT: list[tuple[str, tuple[str, ...]]] = [
    ("st", ("st.", "stycken", "styck", "pcs", "piece", "pieces")),
]

# Prefixed units offered in drop-downs; other prefixed units (cg, kl) are
# understood but not offered. All listed units are offered.
_DISPLAYED_PREFIXED = {"µg", "mg", "g", "kg", "ml", "cl", "dl", "l", "kJ", "kcal"}


def _build() -> list[Unit]:
    units: list[Unit] = []
    for base, category, base_factor in _PREFIXABLE:
        units.append(Unit(base, category, base_factor, _ALIASES.get(base, ())))
        for prefix, prefix_factor in PREFIXES.items():
            symbol = prefix + base
            aliases = _ALIASES.get(symbol, ())
            if prefix == MICRO:
                aliases = ("u" + base, *aliases)
            units.append(Unit(symbol, category, prefix_factor * base_factor, aliases))
    units += [Unit(symbol, category, f, aliases) for symbol, category, f, aliases in _LISTED]
    units += [Unit(symbol, None, None, aliases) for symbol, aliases in _FREE_TEXT]
    return units


_UNITS = _build()


def _normal(text: str) -> str:
    """Trimmed, inner spaces as one, the Greek mu as the micro sign."""
    return re.sub(r"\s+", " ", text.strip()).replace("μ", MICRO)


def _fold(text: str) -> str:
    return text.casefold()


# Exact spellings first, then case-insensitive ones. Symbols go before
# aliases, so "cal" folds to the small calorie, not to kcal's alias "Cal".
_EXACT = {spelling: unit for unit in _UNITS for spelling in (unit.symbol, *unit.aliases)}
_FOLDED: dict[str, Unit] = {}
for _unit in _UNITS:
    _FOLDED.setdefault(_fold(_unit.symbol), _unit)
for _unit in _UNITS:
    for _alias in _unit.aliases:
        _FOLDED.setdefault(_fold(_alias), _unit)


def parse(text: str) -> Unit | None:
    """The known unit `text` spells, or None for free text."""
    normal = _normal(text)
    return _EXACT.get(normal) or _FOLDED.get(_fold(normal))


def factor(a: str, b: str) -> Decimal | None:
    """The multiplier from an amount in `a` to the same amount in `b`, or
    None when they don't convert: another category, or a unit that is not
    known (free text not in the catalogue converts to nothing, not even
    itself). Two spellings of one known unit give 1. A factor that does not
    end (US cup to metric cup) is cut at Decimal's 28 digits."""
    unit_a, unit_b = parse(a), parse(b)
    if unit_a is None or unit_b is None:
        return None
    if unit_a.symbol == unit_b.symbol:
        return Decimal(1)
    if unit_a.category is None or unit_a.category != unit_b.category:
        return None
    assert unit_a.factor is not None and unit_b.factor is not None
    return unit_a.factor / unit_b.factor


_OFFERED = _DISPLAYED_PREFIXED | {listed[0] for listed in _LISTED} | {free[0] for free in _FREE_TEXT}


def _display_order(unit: Unit) -> tuple[int, Decimal]:
    category = CATEGORIES.index(unit.category) if unit.category else len(CATEGORIES)
    return category, unit.factor or Decimal(0)


# Sorting is stable, so at the same size a prefixed unit stays first (ml, krm).
_DISPLAYED = sorted((u for u in _UNITS if u.symbol in _OFFERED), key=_display_order)


def display_units(category: Category | None = None) -> list[Unit]:
    """The units offered in drop-downs: per category from small to large,
    then the known free-text units. With a category, only its units."""
    return [u for u in _DISPLAYED if category is None or u.category == category]
