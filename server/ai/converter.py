"""RecipeConverter and FactorSuggester for any ChatProvider."""

from collections.abc import Sequence
from decimal import Decimal

from server.ai.chat import ChatProvider
from server.ai.draft import CatalogEntry, Draft
from server.ai.errors import NoRecipeFound
from server.ai.prompts import CONVERT_SYSTEM, FACTOR_SYSTEM, convert_user, factor_user
from server.ai.schema import DRAFT_SCHEMA, FACTOR_SCHEMA, parse_draft, parse_factor


# Room for the model's thinking as well as the answer: models that think count
# it against the same limit, and an answer cut off is useless.
CONVERT_MAX_TOKENS = 16000
FACTOR_MAX_TOKENS = 2000


class ProviderRecipeConverter:
    def __init__(self, chat: ChatProvider):
        self.chat = chat

    def convert(self, text: str, catalog: Sequence[CatalogEntry]) -> Draft:
        completion = self.chat.complete(
            CONVERT_SYSTEM,
            convert_user(text, catalog),
            max_tokens=CONVERT_MAX_TOKENS,
            schema=DRAFT_SCHEMA,
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
            FACTOR_SYSTEM,
            factor_user(ingredient, unit, food),
            max_tokens=FACTOR_MAX_TOKENS,
            schema=FACTOR_SCHEMA,
        )
        return parse_factor(completion.text)
