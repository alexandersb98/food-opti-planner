"""/api/data-sources: the data sources the server loaded (S1), and one
source's page (S2): its columns, and its colour, the one thing to edit."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import models, units
from ..db import DbSession
from .catalog import References
from .errors import FieldError, FieldErrors, invalid_fields

router = APIRouter(prefix="/data-sources", tags=["data sources"])

NOT_FOUND = {404: {"description": "No such data source"}}

# "#rrggbb", saved in lower case.
Colour = Annotated[
    str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$"), AfterValidator(str.lower)
]


class DataSourceSummary(BaseModel):
    key: str
    name: str
    colour: str
    version: str
    imported_at: datetime
    # The foods and columns the file still has (not withdrawn).
    food_count: int
    column_count: int
    # Of those columns, how many are mapped to an attribute.
    mapped_count: int


class SourceColumn(BaseModel):
    id: int
    key: str
    name: str
    unit: str
    withdrawn: bool
    attribute_id: int | None


class DataSource(DataSourceSummary):
    attribution: str | None
    # Active columns by name, then the withdrawn ones by name.
    columns: list[SourceColumn]


class DataSourceChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    colour: Colour


class ColumnMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The attribute this column feeds; null: none.
    attribute_id: int | None


def _counts(db: DbSession, model: type[models.SourceFood | models.SourceColumn]) -> dict[int, int]:
    """How many rows of `model` each source has that are not withdrawn."""
    rows = db.execute(
        select(model.source_id, func.count())
        .where(model.withdrawn.is_(False))
        .group_by(model.source_id)
    )
    return dict(rows.all())


def _mapped_counts(db: DbSession) -> dict[int, int]:
    """How many columns each source has that are not withdrawn and are mapped."""
    rows = db.execute(
        select(models.SourceColumn.source_id, func.count())
        .where(models.SourceColumn.withdrawn.is_(False), models.SourceColumn.attribute_id.is_not(None))
        .group_by(models.SourceColumn.source_id)
    )
    return dict(rows.all())


def _summary(
    source: models.DataSource,
    foods: dict[int, int],
    columns: dict[int, int],
    mapped: dict[int, int],
) -> DataSourceSummary:
    return DataSourceSummary(
        key=source.key,
        name=source.name,
        colour=source.colour,
        version=source.version,
        imported_at=source.imported_at.replace(tzinfo=UTC),  # stored as UTC
        food_count=foods.get(source.id, 0),
        column_count=columns.get(source.id, 0),
        mapped_count=mapped.get(source.id, 0),
    )


def _detail(db: DbSession, source: models.DataSource) -> DataSource:
    columns = db.scalars(
        select(models.SourceColumn)
        .where(models.SourceColumn.source_id == source.id)
        .order_by(models.SourceColumn.withdrawn, models.SourceColumn.name, models.SourceColumn.id)
    ).all()
    summary = _summary(
        source,
        _counts(db, models.SourceFood),
        _counts(db, models.SourceColumn),
        _mapped_counts(db),
    )
    return DataSource(
        **summary.model_dump(),
        attribution=source.attribution,
        columns=[_column(c) for c in columns],
    )


def _column(column: models.SourceColumn) -> SourceColumn:
    return SourceColumn(
        id=column.id,
        key=column.key,
        name=column.name,
        unit=column.unit,
        withdrawn=column.withdrawn,
        attribute_id=column.attribute_id,
    )


def _get(db: DbSession, key: str) -> models.DataSource:
    source = db.scalar(select(models.DataSource).where(models.DataSource.key == key))
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such data source")
    return source


@router.get("")
def list_data_sources(db: DbSession) -> list[DataSourceSummary]:
    sources = db.scalars(select(models.DataSource).order_by(models.DataSource.name, models.DataSource.id))
    foods, columns = _counts(db, models.SourceFood), _counts(db, models.SourceColumn)
    mapped = _mapped_counts(db)
    return [_summary(source, foods, columns, mapped) for source in sources]


@router.get("/{key}", responses=NOT_FOUND)
def get_data_source(key: str, db: DbSession) -> DataSource:
    return _detail(db, _get(db, key))


@router.patch("/{key}", responses=NOT_FOUND)
def update_data_source(key: str, body: DataSourceChanges, db: DbSession) -> DataSource:
    source = _get(db, key)
    source.colour = body.colour
    db.commit()
    return _detail(db, source)


def _mapping_error(error_type: str, msg: str) -> HTTPException:
    return invalid_fields([FieldError(loc=["body", "attribute_id"], type=error_type, msg=msg)])


def _taken(db: DbSession, column: models.SourceColumn, attribute: models.Attribute) -> HTTPException | None:
    """The refusal if another column of the same source (withdrawn or not)
    already feeds the attribute."""
    holder = db.scalar(
        select(models.SourceColumn).where(
            models.SourceColumn.source_id == column.source_id,
            models.SourceColumn.attribute_id == attribute.id,
            models.SourceColumn.id != column.id,
        )
    )
    if holder is None:
        return None
    return _mapping_error(
        "attribute_taken", f"{attribute.name} is already mapped from {holder.name}."
    )


@router.put(
    "/{key}/columns/{column_id}",
    responses={
        404: {"description": "No such data source or column"},
        422: {"model": FieldErrors, "description": "Unknown, taken or non-converting attribute"},
    },
)
def map_column(key: str, column_id: int, body: ColumnMapping, db: DbSession) -> SourceColumn:
    """Map a column to an attribute (or, with null, to none). The attribute's
    unit must convert with the column's, and one column of a source feeds an
    attribute at most (data source spec, decisions 5 to 7)."""
    source = _get(db, key)
    column = db.scalar(
        select(models.SourceColumn).where(
            models.SourceColumn.id == column_id, models.SourceColumn.source_id == source.id
        )
    )
    if column is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such column")
    if body.attribute_id is None:
        column.attribute_id = None
        db.commit()
        return _column(column)

    references = References(db)
    found = references.rows(models.Attribute, [(["attribute_id"], body.attribute_id)], "attribute")
    references.check()
    attribute = found[body.attribute_id]
    if column.attribute_id == attribute.id:
        return _column(column)
    if units.factor(column.unit, attribute.unit) is None:
        shown = column.unit or "no unit"
        raise _mapping_error(
            "unit_mismatch",
            f"{column.name} is in {shown}, and {attribute.name} in {attribute.unit}: "
            "they don't convert.",
        )
    taken = _taken(db, column, attribute)
    if taken is not None:
        raise taken
    column.attribute_id = attribute.id
    try:
        db.commit()
    except IntegrityError:
        # Another request mapped the attribute from a second column first.
        db.rollback()
        column = db.get(models.SourceColumn, column_id)
        attribute = db.get(models.Attribute, body.attribute_id)
        if column is None or attribute is None:
            raise
        taken = _taken(db, column, attribute)
        if taken is None:
            raise
        raise taken from None
    return _column(column)
