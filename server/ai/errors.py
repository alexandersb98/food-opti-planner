"""Errors of the AI layer."""


class AIError(Exception):
    """Base class of everything the AI layer raises on purpose."""


class AIServiceError(AIError):
    """The provider could not be reached or answered with an error.

    `status` is the HTTP status, or None for a timeout or network error."""

    def __init__(self, status: int | None, message: str):
        super().__init__(message if status is None else f"{status}: {message}")
        self.status = status
        self.message = message


class BadAnswerError(AIError):
    """The model answered, but not in the shape the schema asks for."""


class NoRecipeFound(AIError):
    """The text holds no recipe (the answer has no lines)."""
