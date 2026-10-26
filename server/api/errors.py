"""Errors about one field of a request body, in the shape FastAPI uses for
its 422s, so the app shows both the same way next to the field."""

from fastapi import HTTPException, status
from pydantic import BaseModel


class FieldError(BaseModel):
    loc: list[str | int]  # ["body", field], or ["body", field, index, ...]
    type: str
    msg: str


# Where in the request body a field is, after "body": ["tag_ids", 0].
Loc = list[str | int]


class FieldErrors(BaseModel):
    detail: list[FieldError]


NAME_IN_USE = {409: {"model": FieldErrors, "description": "The name is already in use"}}


def name_in_use(what: str) -> HTTPException:
    error = FieldError(loc=["body", "name"], type="name_in_use", msg=f"{what} with this name already exists")
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=[error.model_dump()])


def invalid_fields(errors: list[FieldError]) -> HTTPException:
    """A 422 for problems Pydantic can't see, such as an id that names no row."""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=[e.model_dump() for e in errors]
    )


class FieldChecks:
    """Problems with a request body that Pydantic can't see, gathered so that
    one 422 names every bad field: `add` each, then `check()`."""

    def __init__(self) -> None:
        self.errors: list[FieldError] = []

    def add(self, loc: Loc, error_type: str, msg: str) -> None:
        self.errors.append(FieldError(loc=["body", *loc], type=error_type, msg=msg))

    def check(self) -> None:
        """Answer 422 if any problem was found."""
        if self.errors:
            raise invalid_fields(self.errors)
