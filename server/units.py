"""The unit catalogue: which unit texts are real units, their category and
exact factor. Pure (no database, no FastAPI); the one place unit rules live."""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Context, Decimal
from fractions import Fraction
from typing import Literal

Category = Literal["mass", "volume", "energy"]
CATEGORIES: tuple[Category, ...] = ("mass", "volume", "energy")
BASES: dict[Category, str] = {"mass": "g", "volume": "l", "energy": "J"}
PIECE = "st"  # the known free-text unit for pieces
FACTOR_PRECISION = 40  # significant digits of a factor() ratio


@dataclass(frozen=True)
class Unit:
    symbol: str  # the catalogue spelling: "µg", "msk", "US cup"
    name: str  # "microgram", "tablespoon"
    category: Category | None  # None: a known free-text unit (st)
    factor: Decimal | None  # of one unit in the category's base (g, l, J), exact
    aliases: tuple[str, ...]  # other spellings, matched case-insensitively
    case_sensitive_aliases: tuple[str, ...]  # matched exactly ("Cal")
    offered: bool  # shown in the drop-downs


# The micro sign U+00B5, as the units spec spells it.
PREFIXES = (
    ("µ", "micro", Decimal("0.000001")),
    ("m", "milli", Decimal("0.001")),
    ("c", "centi", Decimal("0.01")),
    ("d", "deci", Decimal("0.1")),
    ("k", "kilo", Decimal("1000")),
)

# Prefixable bases: symbol, name, category, factor in the category's base.
PREFIXABLE = (
    ("g", "gram", "mass", Decimal("1")),
    ("l", "litre", "volume", Decimal("1")),
    ("J", "joule", "energy", Decimal("1")),
    ("cal", "calorie", "energy", Decimal("4.184")),
)

# Extra spellings by the resulting symbol.
EXTRA_ALIASES = {
    "g": ("gram", "grams"),
    "l": ("litre", "liter", "litres", "liters"),
    "µg": ("ug", "mcg", "mikrog", "mikrogram"),
}
CASE_SENSITIVE_ALIASES = {"kcal": ("Cal",)}

# Listed units: symbol, name, category, factor, aliases.
LISTED = (
    ("oz", "ounce", "mass", Decimal("28.349523125"), ("ounce",)),
    ("lb", "pound", "mass", Decimal("453.59237"), ("pound",)),
    ("krm", "kryddmått", "volume", Decimal("0.001"), ("kryddmått",)),
    ("tsk", "teaspoon", "volume", Decimal("0.005"), ("tsp", "teaspoon", "tesked")),
    ("msk", "tablespoon", "volume", Decimal("0.015"), ("tbsp", "tablespoon", "matsked")),
    ("US cup", "US cup", "volume", Decimal("0.2365882365"), ()),
    ("metric cup", "metric cup", "volume", Decimal("0.25"), ()),
    ("fl oz", "fluid ounce", "volume", Decimal("0.0295735295625"), ("US fl oz",)),
)
PIECE_ALIASES = ("stycken", "styck", "pcs", "piece", "pieces")

# What the drop-downs offer, in order.
OFFERED_ORDER: dict[Category, tuple[str, ...]] = {
    "mass": ("µg", "mg", "g", "kg", "oz", "lb"),
    "volume": ("ml", "cl", "dl", "l", "krm", "tsk", "msk", "fl oz", "US cup", "metric cup"),
    "energy": ("kJ", "kcal"),
}


def _build() -> list[Unit]:
    built: list[Unit] = []

    def add(symbol, name, category, factor, aliases=()):
        offered = any(symbol in order for order in OFFERED_ORDER.values()) or symbol == PIECE
        built.append(Unit(
            symbol, name, category, factor,
            (*aliases, *EXTRA_ALIASES.get(symbol, ())),
            CASE_SENSITIVE_ALIASES.get(symbol, ()), offered,
        ))

    for base, base_name, category, base_factor in PREFIXABLE:
        add(base, base_name, category, base_factor)
        for prefix, prefix_name, prefix_factor in PREFIXES:
            add(prefix + base, prefix_name + base_name, category, prefix_factor * base_factor)
    for symbol, name, category, unit_factor, aliases in LISTED:
        add(symbol, name, category, unit_factor, aliases)
    add(PIECE, "piece", None, None, PIECE_ALIASES)

    by_symbol = {u.symbol: u for u in built}
    first = [by_symbol[s] for category in CATEGORIES for s in OFFERED_ORDER[category]]
    first.append(by_symbol[PIECE])
    rest = [u for u in built if u not in first]
    return first + rest


_WHITESPACE = re.compile(r"\s+")


def _clean(text: str) -> str:
    """NFKC, trimmed, inner runs of spaces collapsed, one trailing period dropped."""
    text = _WHITESPACE.sub(" ", unicodedata.normalize("NFKC", text)).strip()
    if text.endswith("."):
        text = text[:-1].strip()
    return text


def _build_lookups(table) -> tuple[dict[str, Unit], dict[str, Unit]]:
    """Lower-cased spelling to unit, and exact spelling to unit (the case
    sensitive aliases). Raises if two units claim one spelling."""
    lower: dict[str, Unit] = {}
    exact: dict[str, Unit] = {}

    def claim(lookup: dict[str, Unit], key: str, unit: Unit) -> None:
        if key in lookup and lookup[key] is not unit:
            raise ValueError(f"{key!r} is claimed by both {lookup[key].symbol!r} and {unit.symbol!r}")
        lookup[key] = unit

    for unit in table:
        for spelling in (unit.symbol, *unit.aliases):
            claim(lower, _clean(spelling).lower(), unit)
        for spelling in unit.case_sensitive_aliases:
            claim(exact, _clean(spelling), unit)
    return lower, exact


_CATALOGUE = tuple(_build())
_LOWER, _EXACT = _build_lookups(_CATALOGUE)
# Milli prefixes: "m" is milli, but "M" would be mega, which the catalogue
# does not have, so "MJ" is not read as millijoule.
_MILLI = {u.symbol for u in _CATALOGUE if u.symbol[:1] == "m" and u.symbol[1:] in {b[0] for b in PREFIXABLE}}


def catalogue() -> tuple[Unit, ...]:
    """Every understood unit: the offered ones first, per category in display
    order and then `st`, then the rest."""
    return _CATALOGUE


def offered(category: Category | None = None) -> tuple[Unit, ...]:
    """The units the drop-downs offer: a category's, or all (then `st`)."""
    return tuple(
        u for u in _CATALOGUE if u.offered and (category is None or u.category == category)
    )


def parse(text: str) -> Unit | None:
    """The unit a text names, in any spelling, or None for free text."""
    cleaned = _clean(text)
    if not cleaned:
        return None
    unit = _EXACT.get(cleaned) or _LOWER.get(cleaned.lower())
    if unit is not None and unit.symbol in _MILLI and cleaned[0] == "M":
        return None  # "MJ", "Ml": mega, not milli
    return unit


def normalise(text: str) -> str:
    """The catalogue spelling if the text is a unit, else the text trimmed."""
    unit = parse(text)
    return unit.symbol if unit else text.strip()


_CONTEXT = Context(prec=FACTOR_PRECISION)


def factor(a: str, b: str) -> Decimal | None:
    """The multiplier that turns an amount in `a` into one in `b`, or None
    when the two can't be converted. Exact where the ratio is finite."""
    unit_a, unit_b = parse(a), parse(b)
    if unit_a is None and unit_b is None:
        key = _clean(a).lower()
        return Decimal(1) if key and key == _clean(b).lower() else None
    if unit_a is None or unit_b is None:
        return None
    if unit_a is unit_b:
        return Decimal(1)
    if unit_a.category is None or unit_a.category != unit_b.category:
        return None
    return _CONTEXT.divide(unit_a.factor, unit_b.factor)


def ratio(a: str, b: str) -> Fraction | None:
    """Exactly what `factor` gives, as a Fraction: the unit factors are exact
    decimals, so the ratio of two is exact even where no decimal fits."""
    unit_a, unit_b = parse(a), parse(b)
    if unit_a is None and unit_b is None:
        key = _clean(a).lower()
        return Fraction(1) if key and key == _clean(b).lower() else None
    if unit_a is None or unit_b is None:
        return None
    if unit_a is unit_b:
        return Fraction(1)
    if unit_a.category is None or unit_a.category != unit_b.category:
        return None
    return Fraction(unit_a.factor) / Fraction(unit_b.factor)
