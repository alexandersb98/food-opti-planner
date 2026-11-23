"""OpenAI chat completions adapter.

Request and reply shapes follow the provider's public documentation as
remembered at planning time; not verified against the live service.
"""

from collections.abc import Mapping
from typing import Any

from server.ai.chat import Completion, HttpxTransport, Transport
from server.ai.providers._chat_completions import read_completion

URL = "https://api.openai.com/v1/chat/completions"


class OpenAIChat:
    def __init__(self, model: str, api_key: str, transport: Transport | None = None):
        self.model = model
        self.api_key = api_key
        self.transport = transport or HttpxTransport()

    def complete(
        self, system: str, user: str, *, max_tokens: int, schema: Mapping[str, Any] | None = None
    ) -> Completion:
        # `schema` is not enforced here yet: JSON mode plus the schema in the prompt.
        reply = self.transport.post_json(
            URL,
            {"Authorization": f"Bearer {self.api_key}", "content-type": "application/json"},
            {
                "model": self.model,
                "max_completion_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        return read_completion(reply)
