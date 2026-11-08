"""/api/data-sources: the data sources the server loaded (S1), and one
source's page (S2): its columns, and its colour, the one thing to edit."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints
from sqlalchemy import func, select

from .. import models
from ..db import DbSession

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


class SourceColumn(BaseModel):
    id: int
    key: str
    name: str
    unit: str
    withdrawn: bool


class DataSource(DataSourceSummary):
    attribution: str | None
    # Active columns by name, then the withdrawn ones by name.
    columns: list[SourceColumn]


class DataSourceChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")

    colour: Colour


def _counts(db: DbSession, model: type[models.SourceFood | models.SourceColumn]) -> dict[int, int]:
    """How many rows of `model` each source has that are not withdrawn."""
    rows = db.execute(
        select(model.source_id, func.count())
        .where(model.withdrawn.is_(False))
        .group_by(model.source_id)
    )
    return dict(rows.all())


def _summary(
    source: models.DataSource, foods: dict[int, int], columns: dict[int, int]
) -> DataSourceSummary:
    return DataSourceSummary(
        key=source.key,
        name=source.name,
        colour=source.colour,
        version=source.version,
        imported_at=source.imported_at,
        food_count=foods.get(source.id, 0),
        column_count=columns.get(source.id, 0),
    )


def _detail(db: DbSession, source: models.DataSource) -> DataSource:
    columns = db.scalars(
        select(models.SourceColumn)
        .where(models.SourceColumn.source_id == source.id)
        .order_by(models.SourceColumn.withdrawn, models.SourceColumn.name, models.SourceColumn.id)
    ).all()
    summary = _summary(source, _counts(db, models.SourceFood), _counts(db, models.SourceColumn))
    return DataSource(
        **summary.model_dump(),
        attribution=source.attribution,
        columns=[
            SourceColumn(id=c.id, key=c.key, name=c.name, unit=c.unit, withdrawn=c.withdrawn)
            for c in columns
        ],
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
    return [_summary(source, foods, columns) for source in sources]


@router.get("/{key}", responses=NOT_FOUND)
def get_data_source(key: str, db: DbSession) -> DataSource:
    return _detail(db, _get(db, key))


@router.patch("/{key}", responses=NOT_FOUND)
def update_data_source(key: str, body: DataSourceChanges, db: DbSession) -> DataSource:
    source = _get(db, key)
    source.colour = body.colour
    db.commit()
    return _detail(db, source)
