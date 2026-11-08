"""The reference copy of the data files (slice D2): reading and validating a
`*.json.gz` data file, and loading it into the database at startup.

No FastAPI in here. `read_file` raises `DataFileError` for a file that is not
what D1's script writes; `load_file` writes one file's copy in one
transaction; `load_all` loads a directory and never lets one broken file stop
the others, or the app.
"""

import gzip
import json
import logging
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, delete, func, insert, select
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

CHUNK = 5_000
# The colours new sources start with, in order and cycling: distinct, readable
# as a dot on white and on dark. The user can pick another on the source page.
PALETTE = (
    "#1976d2", "#2e7d32", "#ef6c00", "#8e24aa", "#00838f", "#c62828", "#6d4c41", "#546e7a",
)  # fmt: skip
KEY_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]*")
# Exponent notation, NaN and infinity are not numbers here: D1 never writes them.
VALUE_PATTERN = re.compile(r"-?\d+(\.\d+)?")
VALUE_STEP = Decimal(1).scaleb(-models.VALUE_DECIMALS)
MAX_INTEGER_DIGITS = models.VALUE_DIGITS - models.VALUE_DECIMALS
GROUP_LENGTH = models.NAME_LENGTH


class DataFileError(Exception):
    """The file is not a valid data file; the message says what and where."""


@dataclass(frozen=True)
class FileColumn:
    key: str
    name: str
    unit: str


@dataclass(frozen=True)
class FileFood:
    key: str
    name: str
    groups: list[str]
    values: dict[str, Decimal]


@dataclass(frozen=True)
class DataFile:
    key: str
    name: str
    version: str
    attribution: str | None
    columns: list[FileColumn]
    foods: list[FileFood]


def read_file(path: Path) -> DataFile:
    """Read and fully validate a data file (interpretation 6 of the D2 plan)."""
    try:
        with gzip.open(path, "rb") as stream:
            text = stream.read().decode("utf-8")
    except (OSError, EOFError):  # BadGzipFile is an OSError
        raise DataFileError(f"{path.name}: not a gzip file") from None
    except UnicodeDecodeError:
        raise DataFileError(f"{path.name}: not UTF-8 text") from None
    try:
        data = json.loads(text, parse_float=Decimal)
    except json.JSONDecodeError as error:
        raise DataFileError(f"{path.name}: not JSON ({error})") from None
    try:
        return _validate(data)
    except DataFileError as error:
        raise DataFileError(f"{path.name}: {error}") from None


def _text(owner: dict, field: str, where: str, *, low: int, high: int) -> str:
    value = owner.get(field)
    if not isinstance(value, str):
        raise DataFileError(f"{where}: `{field}` must be text")
    if not low <= len(value) <= high:
        span = f"1 to {high}" if low else f"at most {high}"
        raise DataFileError(f"{where}: `{field}` must be {span} characters, not {len(value)}")
    return value


def _validate(data: Any) -> DataFile:
    if not isinstance(data, dict):
        raise DataFileError("the top level must be a JSON object")
    top = "the file"
    key = _text(data, "key", top, low=1, high=models.SOURCE_KEY_LENGTH)
    if not KEY_PATTERN.fullmatch(key):
        raise DataFileError(f"{top}: `key` {key!r} must be lower case letters, digits, - and _")
    name = _text(data, "name", top, low=1, high=models.NAME_LENGTH)
    version = _text(data, "version", top, low=1, high=models.SOURCE_VERSION_LENGTH)
    attribution = None
    if "attribution" in data and data["attribution"] is not None:
        attribution = _text(data, "attribution", top, low=0, high=10**6)
    if "licence" in data and not isinstance(data["licence"], str):
        raise DataFileError(f"{top}: `licence` must be text")
    if attribution is None and data.get("licence"):
        attribution = f"Licence: {data['licence']}"
    columns = _columns(data.get("columns"))
    foods = _foods(data.get("foods"), {column.key for column in columns})
    return DataFile(key, name, version, attribution, columns, foods)


def _objects(raw: Any, field: str) -> list[dict]:
    if not isinstance(raw, list):
        raise DataFileError(f"`{field}` must be a list")
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise DataFileError(f"{field}[{i}] must be an object")
    return raw


def _columns(raw: Any) -> list[FileColumn]:
    columns, seen = [], set()
    for i, item in enumerate(_objects(raw, "columns")):
        where = f"columns[{i}]"
        key = _text(item, "key", where, low=1, high=models.SOURCE_ITEM_KEY_LENGTH)
        where = f"{where} ({key!r})"
        if key in seen:
            raise DataFileError(f"{where}: duplicate column key")
        seen.add(key)
        columns.append(
            FileColumn(
                key,
                _text(item, "name", where, low=1, high=models.SOURCE_ITEM_NAME_LENGTH),
                _text(item, "unit", where, low=0, high=models.UNIT_LENGTH),
            )
        )
    return columns


def _foods(raw: Any, column_keys: set[str]) -> list[FileFood]:
    foods, seen = [], set()
    for i, item in enumerate(_objects(raw, "foods")):
        where = f"foods[{i}]"
        key = _text(item, "key", where, low=1, high=models.SOURCE_ITEM_KEY_LENGTH)
        where = f"{where} ({key!r})"
        if key in seen:
            raise DataFileError(f"{where}: duplicate food key")
        seen.add(key)
        name = _text(item, "name", where, low=1, high=models.SOURCE_ITEM_NAME_LENGTH)
        foods.append(
            FileFood(key, name, _groups(item.get("groups"), where), _values(item.get("values"), where, column_keys))
        )
    return foods


def _groups(raw: Any, where: str) -> list[str]:
    if not isinstance(raw, list):
        raise DataFileError(f"{where}: `groups` must be a list")
    groups = []
    for group in raw:
        if not isinstance(group, str) or not group:
            raise DataFileError(f"{where}: a group name must be non-empty text")
        if len(group) > GROUP_LENGTH:
            raise DataFileError(f"{where}: a group name has {len(group)} characters, over {GROUP_LENGTH}")
        if group not in groups:
            groups.append(group)
    return groups


def _values(raw: Any, where: str, column_keys: set[str]) -> dict[str, Decimal]:
    if not isinstance(raw, dict):
        raise DataFileError(f"{where}: `values` must be an object")
    values = {}
    for column, text in raw.items():
        if column not in column_keys:
            raise DataFileError(f"{where}: a value for the unknown column {column!r}")
        if not isinstance(text, str):
            raise DataFileError(f"{where}: the value for {column!r} must be a decimal string, not a number")
        if not VALUE_PATTERN.fullmatch(text):
            raise DataFileError(f"{where}: the value for {column!r} is not a decimal number: {text!r}")
        number = Decimal(text).quantize(VALUE_STEP, rounding=ROUND_HALF_UP)
        if abs(number).adjusted() >= MAX_INTEGER_DIGITS:
            raise DataFileError(f"{where}: the value for {column!r} has too many digits: {text!r}")
        values[column] = number
    return values


def load_file(db: Session, file: DataFile) -> bool:
    """Write the file's copy in one transaction (the session's). True if it
    loaded, False if the stored version is the file's. Rolls back and re-raises
    on any failure."""
    try:
        loaded = _load(db, file)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return loaded


def _load(db: Session, file: DataFile) -> bool:
    source = db.scalar(select(models.DataSource).where(models.DataSource.key == file.key))
    if source is not None and source.version == file.version:
        return False
    if source is None:
        taken = db.scalar(select(func.count()).select_from(models.DataSource))
        source = models.DataSource(key=file.key, colour=PALETTE[taken % len(PALETTE)])
        db.add(source)
    # The colour is the user's once the source exists: a load never sets it.
    source.name, source.version = file.name, file.version
    source.attribution, source.imported_at = file.attribution, models.now()
    db.flush()

    column_ids = _load_columns(db, source, file)
    food_ids = _load_foods(db, source, file)
    # Withdrawn foods keep their values and tags; the others are replaced.
    active = select(models.SourceFood.id).where(
        models.SourceFood.source_id == source.id, models.SourceFood.withdrawn.is_(False)
    )
    db.execute(delete(models.SourceFoodValue).where(models.SourceFoodValue.food_id.in_(active)))
    db.execute(delete(models.source_food_tags).where(models.source_food_tags.c.food_id.in_(active)))
    _insert(
        db,
        models.SourceFoodValue,
        (
            {"food_id": food_ids[food.key], "column_id": column_ids[column], "value": value}
            for food in file.foods
            for column, value in food.values.items()
        ),
    )
    tag_ids = _source_tags(db, source, file)
    _insert(
        db,
        models.source_food_tags,
        (
            {"food_id": food_ids[food.key], "tag_id": tag_ids[group]}
            for food in file.foods
            for group in food.groups
        ),
    )
    return True


def _insert(db: Session, table, rows) -> None:
    """Executemany insert in chunks, one statement per chunk, not one ORM
    object per row."""
    chunk: list[dict] = []
    for row in rows:
        chunk.append(row)
        if len(chunk) == CHUNK:
            db.execute(insert(table), chunk)
            chunk = []
    if chunk:
        db.execute(insert(table), chunk)


def _load_columns(db: Session, source: models.DataSource, file: DataFile) -> dict[str, int]:
    """Match by key: new columns inserted, kept ones renamed and un-withdrawn,
    the others withdrawn. Returns key -> id for the file's columns."""
    existing = {
        c.key: c
        for c in db.scalars(select(models.SourceColumn).where(models.SourceColumn.source_id == source.id))
    }
    in_file = {column.key for column in file.columns}
    for key, row in existing.items():
        if key not in in_file:
            row.withdrawn = True
    new = []
    for column in file.columns:
        row = existing.get(column.key)
        if row is None:
            new.append({"source_id": source.id, "key": column.key, "name": column.name, "unit": column.unit})
        else:
            row.name, row.unit, row.withdrawn = column.name, column.unit, False
    _insert(db, models.SourceColumn, new)
    db.flush()
    return _ids(db, models.SourceColumn, source, in_file)


def _load_foods(db: Session, source: models.DataSource, file: DataFile) -> dict[str, int]:
    existing = {
        f.key: f for f in db.scalars(select(models.SourceFood).where(models.SourceFood.source_id == source.id))
    }
    in_file = {food.key for food in file.foods}
    for key, row in existing.items():
        if key not in in_file:
            row.withdrawn = True
    new = []
    for food in file.foods:
        row = existing.get(food.key)
        if row is None:
            new.append({"source_id": source.id, "key": food.key, "name": food.name})
        else:
            row.name, row.withdrawn = food.name, False
    _insert(db, models.SourceFood, new)
    db.flush()
    return _ids(db, models.SourceFood, source, in_file)


def _ids(db: Session, model, source: models.DataSource, keys: set[str]) -> dict[str, int]:
    rows = db.execute(select(model.key, model.id).where(model.source_id == source.id))
    return {key: row_id for key, row_id in rows if key in keys}


def _source_tags(db: Session, source: models.DataSource, file: DataFile) -> dict[str, int]:
    """One tag per food group, made the first time the group appears: named
    as the group, or "<group> (<source name>)" if that name is taken. A tag
    the source already has is found by either name and reused; a group the
    file no longer has keeps its tag. Returns group -> tag id."""
    tags = {tag.name: tag for tag in db.scalars(select(models.Tag))}
    ids = {}
    for group in dict.fromkeys(g for food in file.foods for g in food.groups):
        clash_name = f"{group} ({source.name})"
        tag = next(
            (
                tags[name]
                for name in (group, clash_name)
                if name in tags and tags[name].source_id == source.id
            ),
            None,
        )
        if tag is None:
            name = group if group not in tags else clash_name
            if name in tags or len(name) > models.NAME_LENGTH:
                raise DataFileError(f"cannot name the tag for the group {group!r}: {name!r} is taken or too long")
            tag = models.Tag(name=name, derive="any", source_id=source.id)
            db.add(tag)
            tags[name] = tag
        ids[group] = tag
    db.flush()
    return {group: tag.id for group, tag in ids.items()}


def load_all(engine: Engine, directory: Path) -> list[str]:
    """Load every `*.json.gz` of the directory, each in its own transaction.
    Returns the keys of the sources that loaded (a changed version). A file
    that fails is logged and skipped; the earlier copy stays."""
    files = sorted(directory.glob("*.json.gz")) if directory.is_dir() else []
    if not files:
        logger.info("no data files in %s; no data sources loaded", directory)
        return []
    loaded = []
    for path in files:
        try:
            data = read_file(path)
            with Session(engine) as db:
                if load_file(db, data):
                    loaded.append(data.key)
        except Exception:
            logger.exception("could not load data file %s; the earlier copy stays", path)
    return loaded
