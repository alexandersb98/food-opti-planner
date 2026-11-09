"""The recipe's text from a fetched page (import spec, "Import flow" step 1).

`extract_recipe_text` takes the schema.org `Recipe` JSON-LD when the page has
one with ingredients, reduced to an allow-list of fields (so reviews, authors
and whatever else a page owner added never reach the model), and otherwise the
text a visitor would see. Standard library only; no exception from a hostile
page escapes."""

import html
import json
import re
from collections import Counter, deque
from html.parser import HTMLParser

MAX_EXTRACT_CHARS = 200_000
MAX_PAGE_CHARS = 1_000_000  # what the parsers are fed; a recipe is never in the tail of a bigger page
MAX_VISIBLE_PAGE_CHARS = 1_000_000
MAX_OPEN_TAGS = 200  # deeper elements are not tracked
MAX_FIELD_SCAN = 2000  # list items looked at per field
MAX_DEPTH = 6
MAX_NODES = 10_000
MAX_STRING = 2000
MAX_INGREDIENTS = 200
MAX_STEPS = 100
MAX_LIST = 20
SHORT_RESULT = 200  # a strict pass shorter than this is tried again, leniently

_FIELDS = (
    "name", "description", "recipeYield", "recipeIngredient", "recipeInstructions", "recipeCategory",
    "recipeCuisine", "inLanguage", "prepTime", "cookTime", "totalTime",
)  # fmt: skip
_VOID = frozenset("area base br col embed hr img input link meta source track wbr".split())
_ALWAYS_DROPPED = frozenset("script style noscript template svg head".split())
_DROPPED = _ALWAYS_DROPPED | frozenset("nav header footer aside form iframe button select dialog".split())
_BLOCKS = frozenset(
    "p div li ul ol dl dt dd h1 h2 h3 h4 h5 h6 br tr table section article main blockquote pre "
    "figure figcaption hr fieldset address details summary".split()
)  # fmt: skip
_TAG = re.compile(r"<[^<>]*>")
_SPACE = re.compile(r"\s+")


def _clean(value: object) -> str:
    text = str(value)[: MAX_STRING * 4]  # cut first: the work below is on at most this
    return _SPACE.sub(" ", _TAG.sub(" ", html.unescape(text))).strip()[:MAX_STRING]


class _Collector(HTMLParser):
    """The bodies of the `application/ld+json` scripts."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._buffer: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            kind = (dict(attrs).get("type") or "").split(";", 1)[0].strip().lower()
            self._buffer = [] if kind == "application/ld+json" else None

    def handle_endtag(self, tag):
        if tag == "script" and self._buffer is not None:
            self.blocks.append("".join(self._buffer))
            self._buffer = None

    def handle_data(self, data):
        if self._buffer is not None:
            self._buffer.append(data)


def _is_recipe(node: dict) -> bool:
    kinds = node.get("@type")
    kinds = kinds if isinstance(kinds, list) else [kinds]
    return any(isinstance(k, str) and re.split(r"[/#]", k)[-1] == "Recipe" for k in kinds)


def _ingredients(recipe: dict) -> list[str]:
    raw = recipe.get("recipeIngredient", recipe.get("ingredients"))
    items = raw[:MAX_FIELD_SCAN] if isinstance(raw, list) else [raw]
    lines: list[str] = []
    for item in items:
        if isinstance(item, str) and (line := _clean(item)):
            lines.append(line)
            if len(lines) >= MAX_INGREDIENTS:
                break
    return lines


def _find_recipe(root: object) -> dict | None:
    """The first Recipe with an ingredient, breadth first, within the limits."""
    queue = deque([(root, 0)])
    seen = 0
    while queue and seen < MAX_NODES:
        node, depth = queue.popleft()
        seen += 1
        if isinstance(node, list):
            children = node
        elif isinstance(node, dict):
            if _is_recipe(node) and _ingredients(node):
                return node
            children = [node.get(key) for key in ("@graph", "mainEntity", "mainEntityOfPage")]
        else:
            continue
        if depth < MAX_DEPTH:
            queue.extend((child, depth + 1) for child in children if isinstance(child, (list, dict)))
    return None


def _steps(node: object, out: list[str], depth: int = 0) -> None:
    if len(out) >= MAX_STEPS or depth > MAX_DEPTH:
        return
    if isinstance(node, str):
        if text := _clean(node):
            out.append(text)
    elif isinstance(node, list):
        for item in node[:MAX_FIELD_SCAN]:
            _steps(item, out, depth + 1)
    elif isinstance(node, dict):
        if "itemListElement" in node:
            _steps(node["itemListElement"], out, depth + 1)
        else:
            text = node.get("text") or node.get("name")
            if isinstance(text, str):
                _steps(text, out, depth + 1)


def _scalar(value: object) -> object:
    if isinstance(value, str):
        return _clean(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    return None


def _field(value: object) -> object:
    if isinstance(value, list):
        kept = [item for item in map(_scalar, value[:MAX_FIELD_SCAN]) if item not in (None, "")]
        return kept[:MAX_LIST] or None
    result = _scalar(value)
    return None if result == "" else result


def _recipe_text(recipe: dict) -> str:
    out: dict[str, object] = {}
    for key in _FIELDS:
        if key == "recipeIngredient":
            out[key] = _ingredients(recipe)
        elif key == "recipeInstructions":
            steps: list[str] = []
            _steps(recipe.get(key), steps)
            if steps:
                out[key] = steps
        else:
            value = _field(recipe.get(key))
            if value is not None:
                out[key] = value
    return json.dumps(out, ensure_ascii=False)


def _from_json_ld(page: str) -> str | None:
    collector = _Collector()
    try:
        collector.feed(page[:MAX_PAGE_CHARS])
        collector.close()
    except Exception:  # noqa: BLE001 - a hostile page must not break the import
        pass
    for block in collector.blocks:
        try:
            recipe = _find_recipe(json.loads(block))
        except (ValueError, RecursionError):
            continue
        if recipe is not None:
            return _recipe_text(recipe)
    return None


def _hidden(attrs: list) -> bool:
    values = {name: (value or "") for name, value in attrs}
    if "hidden" in values or values.get("aria-hidden", "").strip().lower() == "true":
        return True
    style = _SPACE.sub("", values.get("style", "").lower())
    return "display:none" in style or "visibility:hidden" in style


class _VisibleText(HTMLParser):
    """Linear in the page: the open tags are counted by name, so an end tag
    that matches nothing costs nothing, and a match pops what it scans."""

    def __init__(self, strict: bool) -> None:
        super().__init__(convert_charrefs=True)
        self._dropped = _DROPPED if strict else _ALWAYS_DROPPED
        self._stack: list[tuple[str, bool]] = []
        self._open: Counter[str] = Counter()
        self._hiding = 0
        self._pieces: list[str] = []
        self._on_line = False  # the current line has text
        self._chars = 0
        self._title: list[str] | None = None
        self.title = ""

    def _break(self) -> None:
        if self._on_line:
            self._pieces.append("\n")
            self._on_line = False

    def _pop_to(self, index: int) -> None:
        while len(self._stack) > index:
            tag, hides = self._stack.pop()
            self._open[tag] -= 1
            self._hiding -= hides

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            hidden_here = any(hides for open_tag, hides in self._stack if open_tag != "head")
            self._title = [] if not self.title and not hidden_here else None
            return
        if tag == "body" and self._open["head"]:  # a head that was never closed
            self._pop_to(next(i for i, (t, _) in enumerate(self._stack) if t == "head"))
        if tag in _BLOCKS:
            self._break()
        if tag in _VOID or len(self._stack) >= MAX_OPEN_TAGS:
            return
        hides = tag in self._dropped or _hidden(attrs)
        self._stack.append((tag, hides))
        self._open[tag] += 1
        self._hiding += hides

    def handle_startendtag(self, tag, attrs):
        if tag in _BLOCKS:
            self._break()

    def handle_endtag(self, tag):
        if tag == "title":
            if self._title is not None:
                self.title = _SPACE.sub(" ", "".join(self._title)[:MAX_STRING]).strip()
            self._title = None
            return
        if self._open[tag] > 0:
            for index in range(len(self._stack) - 1, -1, -1):
                if self._stack[index][0] == tag:
                    self._pop_to(index)
                    break
        if tag in _BLOCKS:
            self._break()

    def handle_data(self, data):
        if self._title is not None:
            self._title.append(data[:MAX_STRING])
        elif not self._hiding and self._chars < 2 * MAX_EXTRACT_CHARS:
            piece = _SPACE.sub(" ", data)
            if piece.strip():
                self._on_line = True
            self._pieces.append(piece)
            self._chars += len(piece)

    def text(self) -> str:
        lines = [_SPACE.sub(" ", line).strip() for line in "".join(self._pieces).split("\n")]
        if self.title:
            lines.insert(0, self.title)
        return "\n".join(line for line in lines if line)


def _visible(page: str, strict: bool) -> str:
    parser = _VisibleText(strict)
    try:
        parser.feed(page[:MAX_VISIBLE_PAGE_CHARS])
        parser.close()
    except Exception:  # noqa: BLE001 - a hostile page must not break the import
        pass
    return parser.text()


def extract_recipe_text(page: str) -> str:
    """The recipe JSON-LD as JSON, else the page's visible text; empty when
    the page has no text at all."""
    text = _from_json_ld(page)
    if text is None:
        text = _visible(page, strict=True)
        if len(text) < SHORT_RESULT:  # an unclosed <nav> may have swallowed the page
            loose = _visible(page, strict=False)
            if len(loose) > len(text):
                text = loose
        if not any(char.isalnum() for char in text):
            return ""  # punctuation or control characters only: no text at all
    return text[:MAX_EXTRACT_CHARS]
