"""Google Gemini generateContent adapter.

Request and reply shapes follow the provider's public documentation as
remembered at planning time; not verified against the live service.
"""

from typing import Any
from urllib.parse import quote

from server.ai.chat import Completion, HttpxTransport, Transport
from server.ai.errors import BadAnswerError

URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiChat:
    def __init__(self, model: str, api_key: str, transport: Transport | None = None):
        self.model = model
        self.api_key = api_key
        self.transport = transport or HttpxTransport()

    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        reply: Any = self.transport.post_json(
            URL.format(model=quote(self.model, safe="")),
            {"x-goog-api-key": self.api_key, "content-type": "application/json"},
            {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": max_tokens,
                },
            },
        )
        candidates = reply.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise BadAnswerError("no text in the answer")
        content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            raise BadAnswerError("no text in the answer")
        text = "".join(
            p["text"] for p in parts if isinstance(p, dict) and isinstance(p.get("text"), str)
        )
        if not text:
            raise BadAnswerError("no text in the answer")
        usage = reply.get("usageMetadata")
        if not isinstance(usage, dict) or not isinstance(usage.get("promptTokenCount"), int):
            raise BadAnswerError("reply has no usageMetadata.promptTokenCount")
        output = usage.get("candidatesTokenCount", 0)
        return Completion(text, usage["promptTokenCount"], output if isinstance(output, int) else 0)
