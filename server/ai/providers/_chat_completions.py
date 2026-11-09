"""Shared reading of an OpenAI-style chat completions reply.

Request and reply shapes follow the provider's public documentation as
remembered at planning time; not verified against the live service.
"""

from typing import Any

from server.ai.chat import Completion
from server.ai.errors import BadAnswerError


def read_completion(reply: Any) -> Completion:
    choices = reply.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise BadAnswerError("no text in the answer")
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise BadAnswerError("no text in the answer")
    usage = reply.get("usage")
    if not isinstance(usage, dict) or not all(
        isinstance(usage.get(k), int) for k in ("prompt_tokens", "completion_tokens")
    ):
        raise BadAnswerError("reply has no usage.prompt_tokens / usage.completion_tokens")
    return Completion(content, usage["prompt_tokens"], usage["completion_tokens"])
