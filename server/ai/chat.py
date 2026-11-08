"""The chat seam: one call to a provider, and the HTTP transport under it."""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from server.ai.errors import AIServiceError


@dataclass(frozen=True)
class Completion:
    text: str
    input_tokens: int
    output_tokens: int


class ChatProvider(Protocol):
    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        """One request: system and user text in, answer text and usage out.

        Raises AIServiceError (HTTP or network trouble) and BadAnswerError
        (a reply with no text)."""
        ...


class MeteredChat:
    """Wraps a ChatProvider and sums its token usage and calls."""

    def __init__(self, inner: ChatProvider):
        self.inner = inner
        self.input_tokens = 0
        self.output_tokens = 0
        self.calls = 0

    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        completion = self.inner.complete(system, user, max_tokens=max_tokens)
        self.calls += 1
        self.input_tokens += completion.input_tokens
        self.output_tokens += completion.output_tokens
        return completion


class Transport(Protocol):
    def post_json(
        self, url: str, headers: Mapping[str, str], body: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        """POST a JSON body, return the parsed JSON reply.

        Raises AIServiceError for network trouble, a non-2xx reply or a reply
        that is not JSON. The error text never contains request headers."""
        ...


class HttpxTransport:
    """The real Transport, over httpx."""

    def __init__(self, timeout: float = 60.0, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=timeout)

    def post_json(
        self, url: str, headers: Mapping[str, str], body: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        try:
            response = self.client.post(url, headers=dict(headers), json=body)
        except httpx.TimeoutException:
            raise AIServiceError(None, "the provider did not answer in time") from None
        except httpx.HTTPError as exc:
            raise AIServiceError(None, f"network error ({type(exc).__name__})") from None
        if not response.is_success:
            raise AIServiceError(response.status_code, _error_text(response))
        try:
            reply = response.json()
        except ValueError:
            raise AIServiceError(response.status_code, "the reply is not JSON") from None
        if not isinstance(reply, dict):
            raise AIServiceError(response.status_code, "the reply is not a JSON object")
        return reply


def _error_text(response: httpx.Response) -> str:
    try:
        data = json.loads(response.text)
    except ValueError:
        data = None
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(error, str):
            return error
        if isinstance(data.get("message"), str):
            return data["message"]
    return response.text[:200]
