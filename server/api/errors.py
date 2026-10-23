"""Errors about one field of a request body, in the shape FastAPI uses for
its 422s, so the app shows both the same way next to the field."""

from fastapi import HTTPException, status
from pydantic import BaseModel


class FieldError(BaseModel):
    loc: list[str]  # ["body", field]
    type: str
    msg: str


class FieldErrors(BaseModel):
    detail: list[FieldError]


NAME_IN_USE = {409: {"model": FieldErrors, "description": "The name is already in use"}}


def name_in_use(what: str) -> HTTPException:
    error = FieldError(loc=["body", "name"], type="name_in_use", msg=f"{what} with this name already exists")
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=[error.model_dump()])
