"""A ChatProvider that answers canned JSON, for tests and the e2e run.

Production never sets it (AI_PROVIDER=fake is for tests and local trials). It
runs the real prompt, parser, retry and daily limit, only the model is faked.

Conversion: a canned English draft, "Imported porridge", servings 2, two
instruction lines and one unnamed section of four lines: `100 g oats`,
`3 dl milk`, `2 tbsp honey` and `salt and pepper to taste` (not an ingredient).
Each `match` is the catalogue entry whose name equals the line's food, ignoring
case, else null; the catalogue is read back from the prompt.

Sentinels in the pasted text pick the broken variants:
  [fake:none]         no sections (the text holds no recipe)
  [fake:broken]       not JSON, always
  [fake:broken-once]  not JSON the first time this instance sees that text, then fine
  [fake:down]         AIServiceError(503)

Factor: always {"factor": 50}, except a food containing "bad" (not JSON) or
"down" (AIServiceError). Token counts are len // 4.
"""

import hashlib
import json

from server.ai.chat import Completion
from server.ai.errors import AIServiceError
from server.ai.prompts import CONVERT_SYSTEM, FACTOR_SYSTEM

_LINES = [
    ("100 g oats", 100, "g", "oats", False),
    ("3 dl milk", 3, "dl", "milk", False),
    ("2 tbsp honey", 2, "tbsp", "honey", False),
    ("salt and pepper to taste", None, "", "salt and pepper", True),
]


class FakeChat:
    uses_http = False

    def __init__(self, model: str = "fake", api_key: str = ""):
        self.model = model
        self.seen: set[str] = set()

    def complete(self, system: str, user: str, *, max_tokens: int) -> Completion:
        if system == CONVERT_SYSTEM:
            answer = self._convert(user)
        elif system == FACTOR_SYSTEM:
            answer = self._factor(user)
        else:
            answer = "not a prompt the fake knows"
        return Completion(answer, len(system + user) // 4, len(answer) // 4)

    def _convert(self, user: str) -> str:
        names = _catalogue_names(user)
        body = user.split("<recipe_text>\n", 1)[-1].rsplit("\n</recipe_text>", 1)[0]
        if "[fake:down]" in body:
            raise AIServiceError(503, "the fake provider is down")
        if "[fake:broken]" in body:
            return "this is not JSON"
        if "[fake:broken-once]" in body:
            digest = hashlib.sha256(body.encode()).hexdigest()
            if digest not in self.seen:
                self.seen.add(digest)
                return "this is not JSON"
        sections = []
        if "[fake:none]" not in body:
            lines = [
                {
                    "original_text": original,
                    "amount": amount,
                    "unit": unit,
                    "food": food,
                    "match": names.get(food.lower()) if not skip else None,
                    "not_an_ingredient": skip,
                }
                for original, amount, unit, food, skip in _LINES
            ]
            sections = [{"name": "", "lines": lines}]
        return json.dumps(
            {
                "name": "Imported porridge",
                "servings": 2,
                "instructions": "Boil the oats in the milk.\nStir in the honey.",
                "sections": sections,
            }
        )

    def _factor(self, user: str) -> str:
        food = user.rsplit(": ", 1)[-1].lower()
        if "down" in food:
            raise AIServiceError(503, "the fake provider is down")
        if "bad" in food:
            return "this is not JSON"
        return json.dumps({"factor": 50})


def _catalogue_names(user: str) -> dict[str, str]:
    """Lower-cased name -> name, from the prompt's `name | unit | conversions:` lines."""
    head = user.split("\n\nRecipe text:", 1)[0]
    names = {}
    for line in head.splitlines()[1:]:
        if " | " in line:
            name = line.split(" | ", 1)[0]
            names[name.lower()] = name
    return names
