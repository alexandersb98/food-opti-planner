"""The AI as the app uses it: one transport, one chat, built once from the settings."""

from sqlalchemy import Engine

from server.ai.chat import ChatProvider, HttpxTransport, MeteredChat, Transport
from server.ai.converter import ProviderFactorSuggester, ProviderRecipeConverter
from server.ai.errors import UnknownProviderError
from server.ai.providers import ADAPTERS, build_chat
from server.ai_usage import LimitedChat
from server.settings import Settings


class NotConfigured(Exception):
    """Import was asked for but no provider and key are set."""


class AIRuntime:
    """Owns the one shared HttpxTransport and the ChatProvider built over it,
    and closes the transport at shutdown (KeyScrubbingTransport hides close(),
    so the runtime keeps its own reference)."""

    def __init__(self, settings: Settings, transport: Transport | None = None):
        self.provider = settings.ai_provider
        self.model = settings.ai_model
        self.limit = settings.ai_daily_limit
        self.transport = transport
        self._closed = False
        self.chat: ChatProvider | None = None
        if self.provider and self.provider not in ADAPTERS:
            known = ", ".join(sorted(ADAPTERS))
            raise ValueError(f"AI_PROVIDER {self.provider!r} is unknown; known providers: {known}")
        if self.provider == "fake" and not settings.ai_allow_fake:
            raise ValueError("AI_PROVIDER=fake is for tests and needs AI_ALLOW_FAKE=true as well")
        if self.provider == "fake":
            self.chat = build_chat("fake", self.model, "")
        elif self.provider and settings.ai_api_key:
            if self.transport is None:
                self.transport = HttpxTransport()
            try:
                self.chat = build_chat(self.provider, self.model, settings.ai_api_key, self.transport)
            except UnknownProviderError as exc:  # checked above; kept for safety
                raise ValueError(str(exc)) from None

    @property
    def configured(self) -> bool:
        return self.chat is not None

    def converter(self, chat: ChatProvider) -> ProviderRecipeConverter:
        return ProviderRecipeConverter(chat)

    def suggester(self, chat: ChatProvider) -> ProviderFactorSuggester:
        return ProviderFactorSuggester(chat)

    def limited(self, engine: Engine) -> MeteredChat:
        """A chat that counts every call against the daily limit and sums usage."""
        if self.chat is None:
            raise NotConfigured()
        return MeteredChat(LimitedChat(self.chat, engine, self.limit))

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        close = getattr(self.transport, "close", None)
        if close is not None:
            close()
