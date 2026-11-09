import json

import pytest

import server.ai.providers as providers
from server.ai.converter import ProviderFactorSuggester, ProviderRecipeConverter
from server.ai.draft import CatalogEntry
from server.ai.errors import AIServiceError, BadAnswerError, NoRecipeFound
from server.ai.prompts import CONVERT_SYSTEM, FACTOR_SYSTEM, convert_user, factor_user
from server.ai.providers.fake import FakeChat
from server.ai.schema import parse_draft

CATALOG = [CatalogEntry("Oats", "g"), CatalogEntry("Milk", "g", ("dl",))]


def convert(chat, text="porridge", catalog=CATALOG):
    return ProviderRecipeConverter(chat).convert(text, catalog)


def test_the_canned_draft_parses():
    completion = FakeChat().complete(CONVERT_SYSTEM, convert_user("x", CATALOG), max_tokens=1)
    draft = parse_draft(completion.text)
    assert draft.name == "Imported porridge" and draft.servings == 2
    assert [line.original_text for line in draft.lines] == [
        "100 g oats",
        "3 dl milk",
        "2 tbsp honey",
        "salt and pepper to taste",
    ]
    assert len(draft.instructions.splitlines()) == 2


def test_matches_follow_the_catalogue_ignoring_case():
    catalog = [CatalogEntry("OATS", "g"), CatalogEntry("milk", "g")]
    lines = convert(FakeChat(), catalog=catalog).lines
    assert [line.match for line in lines] == ["OATS", "milk", None, None]


def test_the_not_an_ingredient_line_has_no_amount():
    last = convert(FakeChat()).lines[-1]
    assert last.not_an_ingredient and last.amount is None and last.match is None


def test_none_is_no_recipe():
    with pytest.raises(NoRecipeFound):
        convert(FakeChat(), "[fake:none]")


def test_broken_is_a_bad_answer_always():
    chat = FakeChat()
    for _ in range(2):
        with pytest.raises(BadAnswerError):
            convert(chat, "[fake:broken]")


def test_broken_once_fails_then_succeeds_and_a_new_instance_fails_again():
    chat = FakeChat()
    with pytest.raises(BadAnswerError):
        convert(chat, "[fake:broken-once]")
    assert convert(chat, "[fake:broken-once]").name == "Imported porridge"
    with pytest.raises(BadAnswerError):
        convert(FakeChat(), "[fake:broken-once]")


def test_down_is_a_service_error():
    with pytest.raises(AIServiceError) as caught:
        convert(FakeChat(), "[fake:down]")
    assert caught.value.status == 503


def test_factor_answers():
    chat = FakeChat()
    suggester = ProviderFactorSuggester(chat)
    milk = CATALOG[1]
    assert suggester.suggest(milk, "dl", "milk") == 50
    with pytest.raises(BadAnswerError):
        suggester.suggest(milk, "dl", "bad milk")
    with pytest.raises(AIServiceError):
        suggester.suggest(milk, "dl", "down milk")


def test_token_counts_are_positive_ints():
    chat = FakeChat()
    for system, user in ((CONVERT_SYSTEM, convert_user("x", CATALOG)), (FACTOR_SYSTEM, factor_user(CATALOG[1], "dl", "milk"))):
        completion = chat.complete(system, user, max_tokens=1)
        assert isinstance(completion.input_tokens, int) and completion.input_tokens > 0
        assert isinstance(completion.output_tokens, int) and completion.output_tokens > 0
        json.loads(completion.text)


def test_build_chat_fake_makes_no_transport(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("a transport was made")

    monkeypatch.setattr(providers, "HttpxTransport", boom)
    assert isinstance(providers.build_chat("fake", "x", ""), FakeChat)
