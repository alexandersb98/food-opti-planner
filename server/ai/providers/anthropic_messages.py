"""Anthropic Messages API adapter.

The answer's shape is enforced with structured outputs
(`output_config.format`) when the caller passes a schema. Effort is `low`:
current Claude models think before they answer, and that thinking counts
against `max_tokens` and adds time, which a conversion like this one does not
need.

Request and reply shapes follow the provider's public documentation and are
not verified against the live service.
"""

from collections.abc import Mapping
from typing import Any

from server.ai.chat import Completion, HttpxTransport, Transport
from server.ai.errors import BadAnswerError
from server.ai.schema import strict_schema

URL = "https://api.anthropic.com/v1/messages"
EFFORT = "low"


class AnthropicChat:
    def __init__(self, model: str, api_key: str, transport: Transport | None = None):
        self.model = model
        self.api_key = api_key
        self.transport = transport or HttpxTransport()

    def complete(
        self, system: str, user: str, *, max_tokens: int, schema: Mapping[str, Any] | None = None
    ) -> Completion:
        output_config: dict[str, Any] = {"effort": EFFORT}
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": strict_schema(dict(schema))}
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
                "output_config": output_config,
            },
        )
        stop = reply.get("stop_reason")
        if stop == "max_tokens":
            raise BadAnswerError("the answer was cut off at max_tokens")
        if stop == "refusal":
            raise BadAnswerError("the model declined to answer")
        blocks = reply.get("content")
        if not isinstance(blocks, list):
            raise BadAnswerError("reply has no content")
        # Thinking blocks come first and are skipped: only text is the answer.
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
