"""What the catalog routes (attributes, tags, ingredients, recipes) share:
the name field, finding a row by id, and saving a row with a unique name."""

from typing import Annotated

from fastapi import HTTPException, status
from pydantic import StringConstraints
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from .errors import name_in_use

# Trimmed, 1 to 100 characters. Names are compared exactly, as in the library.
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.NAME_LENGTH)
]


def get_or_404[M: models.Base](db: Session, model: type[M], row_id: int, what: str) -> M:
    """The row with this id, or a 404 "No such {what}"."""
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {what}")
    return row


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
