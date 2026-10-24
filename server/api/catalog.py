"""What the routes share: finding rows by id, checking the ids a request
refers to, counting what uses a row, and saving a row with a unique name."""

from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from .errors import FieldError, invalid_fields, name_in_use

# Where in the request body a field is, after "body": ["tag_ids", 0].
Loc = list[str | int]


def get_or_404[M: models.Base](db: Session, model: type[M], row_id: int, what: str) -> M:
    """The row with this id, or a 404 "No such {what}"."""
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {what}")
    return row


def in_list(field: str, ids: Sequence[int], key: str | None = None) -> list[tuple[Loc, int]]:
    """Each id of a list in the body with its field: `in_list("tag_ids", [4, 7])`
    gives ([tag_ids, 0], 4) and ([tag_ids, 1], 7). With `key`, the ids are
    that field of each object in the list: [values, 0, attribute_id]."""
    return [([field, i] if key is None else [field, i, key], row_id) for i, row_id in enumerate(ids)]


class References:
    """The ids a request refers to, checked together so that one 422 names
    every bad field: `rows` for each kind of id, then `check()`."""

    def __init__(self, db: Session):
        self.db = db
        self.errors: list[FieldError] = []

    def rows[M: models.Base](
        self, model: type[M], refs: Sequence[tuple[Loc, int]], what: str, *, unique: bool = False
    ) -> dict[int, M]:
        """The rows the (field, id) pairs name, by id. An id naming nothing is
        an "unknown_{what}" error; with `unique`, so is an id given twice."""
        ids = [row_id for _, row_id in refs]
        found = {row.id: row for row in self.db.scalars(select(model).where(model.id.in_(ids)))}
        seen = set()
        for loc, row_id in refs:
            if row_id not in found:
                self._error(loc, f"unknown_{what}", f"No such {what}")
            elif unique and row_id in seen:
                self._error(loc, "duplicate", f"This {what} is given twice")
            seen.add(row_id)
        return found

    def check(self) -> None:
        """Answer 422 if any reference named nothing."""
        if self.errors:
            raise invalid_fields(self.errors)

    def _error(self, loc: Loc, error_type: str, msg: str) -> None:
        self.errors.append(FieldError(loc=["body", *loc], type=error_type, msg=msg))


def count_by(db: Session, column: ColumnElement[int]) -> dict[int, int]:
    """How many rows have each value of `column`, by value: given a foreign
    key, how many rows use each row it points to. For the delete warnings."""
    return dict(db.execute(select(column, func.count()).group_by(column)).all())


def commit_named(db: Session, row: models.Base, what: str) -> None:
    """Commit, answering 409 on the name field if another row has `row`'s name.

    `what` starts the message: "An attribute", "A tag". Any other failed
    constraint is not a name clash and is raised as it is.
    """
    # Read now, as a rollback expires them. The id comes from the identity
    # map: reading `row.id` could load the row and so flush it early.
    model, name, identity = type(row), row.name, inspect(row).identity
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        clash = select(model.id).where(model.name == name)
        if identity is not None:
            clash = clash.where(model.id != identity[0])
        if db.scalar(clash) is not None:
            raise name_in_use(what) from None
        raise
