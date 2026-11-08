"""The shapes the recipe converter hands over, and its interfaces."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class CatalogEntry:
    """An ingredient of the user's catalogue, as the prompt shows it."""

    name: str
    unit: str
    conversion_units: tuple[str, ...] = ()


@dataclass(frozen=True)
class LineDraft:
    original_text: str
    amount: Decimal | None
    unit: str
    food: str
    match: str | None
    not_an_ingredient: bool


@dataclass(frozen=True)
class SectionDraft:
    name: str
    lines: tuple[LineDraft, ...]


@dataclass(frozen=True)
class Draft:
    name: str
    servings: int
    instructions: str
    sections: tuple[SectionDraft, ...]

    @property
    def lines(self) -> tuple[LineDraft, ...]:
        """All lines of all sections, in order."""
        return tuple(line for section in self.sections for line in section.lines)


class RecipeConverter(Protocol):
    def convert(self, text: str, catalog: Sequence[CatalogEntry]) -> Draft:
        """Turn recipe text into a draft.

        Raises AIServiceError (provider unreachable or erroring),
        BadAnswerError (the answer breaks the schema) and NoRecipeFound
        (the text holds no recipe)."""
        ...


class FactorSuggester(Protocol):
    def suggest(self, ingredient: CatalogEntry, unit: str, food: str) -> Decimal:
        """How many of the ingredient's own unit one `unit` of `food` makes.

        Raises AIServiceError and BadAnswerError."""
        ...
