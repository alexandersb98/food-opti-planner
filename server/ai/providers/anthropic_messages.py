"""Anthropic Messages API adapter.

Request and reply shapes follow the provider's public documentation as
remembered at planning time; not verified against the live service.
"""

from typing import Any

from server.ai.chat import Completion, HttpxTransport, Transport
from server.ai.errors import BadAnswerError

URL = "https://api.anthropic.com/v1/messages"


class AnthropicChat:
    def __init__(self, model: str, api_key: str, transport: Transport | None = None):
        self.model = model
        self.api_key = api_key
        self.transport = transport or HttpxTransport()

    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        reply: Any = self.transport.post_json(
            URL,
            {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            {
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
        blocks = reply.get("content")
        if not isinstance(blocks, list):
            raise BadAnswerError("reply has no content")
        text = "".join(
            b["text"]
            for b in blocks
            if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str)
        )
        if not text:
            raise BadAnswerError("no text in the answer")
        usage = reply.get("usage")
        if not isinstance(usage, dict) or not all(
            isinstance(usage.get(k), int) for k in ("input_tokens", "output_tokens")
        ):
            raise BadAnswerError("reply has no usage.input_tokens / usage.output_tokens")
        return Completion(text, usage["input_tokens"], usage["output_tokens"])
