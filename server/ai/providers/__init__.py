"""One adapter per provider; `build_chat` picks one by name."""

from server.ai.chat import ChatProvider, Transport
from server.ai.providers.anthropic_messages import AnthropicChat
from server.ai.providers.gemini_generate import GeminiChat
from server.ai.providers.mistral_chat import MistralChat
from server.ai.providers.openai_chat import OpenAIChat

ADAPTERS: dict[str, type] = {
    "anthropic": AnthropicChat,
    "gemini": GeminiChat,
    "openai": OpenAIChat,
    "mistral": MistralChat,
}

KEY_ENV: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


def build_chat(
    provider: str, model: str, api_key: str, transport: Transport | None = None
) -> ChatProvider:
    try:
        adapter = ADAPTERS[provider]
    except KeyError:
        known = ", ".join(sorted(ADAPTERS))
        raise ValueError(f"unknown provider {provider!r}; known providers: {known}") from None
    return adapter(model, api_key, transport)
