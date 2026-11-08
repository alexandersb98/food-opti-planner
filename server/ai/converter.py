"""RecipeConverter and FactorSuggester for any ChatProvider."""

from collections.abc import Sequence
from decimal import Decimal

from server.ai.chat import ChatProvider
from server.ai.draft import CatalogEntry, Draft
from server.ai.errors import NoRecipeFound
from server.ai.prompts import CONVERT_SYSTEM, FACTOR_SYSTEM, convert_user, factor_user
from server.ai.schema import parse_draft, parse_factor


class ProviderRecipeConverter:
    def __init__(self, chat: ChatProvider):
        self.chat = chat

    def convert(self, text: str, catalog: Sequence[CatalogEntry]) -> Draft:
        completion = self.chat.complete(
            CONVERT_SYSTEM, convert_user(text, catalog), max_tokens=4096
        )
        draft = parse_draft(completion.text)
        if not draft.lines:
            raise NoRecipeFound("no recipe in the text")
        return draft


class ProviderFactorSuggester:
    def __init__(self, chat: ChatProvider):
        self.chat = chat

    def suggest(self, ingredient: CatalogEntry, unit: str, food: str) -> Decimal:
        completion = self.chat.complete(
            FACTOR_SYSTEM, factor_user(ingredient, unit, food), max_tokens=200
        )
        return parse_factor(completion.text)
