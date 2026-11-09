# Slice R5 — Import from a Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Recipes can be imported from a web page. I1 (`/recipes/import`) opens on
a **Link** field with a **Paste text** switch that shows R4's large text box
instead. `POST /api/recipe-imports` takes `{url}` as well as `{text}`: the server
fetches the page under strict limits (http and https only, 10 s, 2 MB, 3
redirects, HTML only, **every internal address refused on every hop, DNS
rebinding included**), takes the schema.org `Recipe` JSON-LD when the page has it
and otherwise the page's visible text, and from there runs R4's pipeline
unchanged (convert, check, suggest factors). The draft carries the page's URL as
`source_url`, so the recipe keeps its source link and C2's banner names the site
("Imported from *ica.se*. 2 lines need you."). A page that can't be read or has no
recipe gets the spec's messages on I1, with the input kept. Nothing is stored
until Save.

**Architecture:** Three new server modules, none of which knows FastAPI, plus
changes to R4's route and the I1 page.

- `server/address_policy.py`: `is_public(ip)`, the one place that says which IP
  addresses may be fetched. An allow-list for IPv6 (global unicast `2000::/3`
  minus the special-purpose ranges inside it), a deny-list for IPv4, and
  Python's own `is_global` as a second lock (both must say yes).
- `server/page_fetch.py`: `PageFetcher.fetch(url) -> FetchedPage`. It does its
  own redirect loop, and on **every hop** it re-parses the URL, checks scheme,
  port, user info and host name, **resolves the name once**, refuses the hop if
  **any** answer is not public, and then **connects to the checked IP address**
  (the URL is rewritten to the IP, the `Host` header and the TLS `sni_hostname`
  keep the name, so the certificate is still checked against the name). There is
  no second lookup between the check and the connection, so DNS rebinding has
  nothing to rebind. It talks to an `httpx.BaseTransport` directly (no
  `httpx.Client`: no cookie jar, no redirect following, no environment proxies),
  which is also what the tests stub.
- `server/page_text.py`: `extract_recipe_text(html) -> str`: the `Recipe`
  JSON-LD reduced to an allow-list of fields, else the visible text, with
  `html.parser` from the standard library (no new dependency).

`server/api/recipe_imports.py` (R4) takes `url`, fetches and extracts before R4's
service, and passes the page's URL on as `source_url`; `create_app` builds the
fetcher once and closes it at shutdown. On the web, `ImportPage.vue` gets the
Link field and the switch, `importReview.ts` gets `siteName(url)`, and
`RecipePage.vue`'s banner uses it.

**Tech Stack:** FastAPI, httpx (already in the `server` extra), standard library
(`ipaddress`, `socket`, `html.parser`, `json`); Vue 3, Quasar, vue-i18n, Vitest,
Playwright.

**Specs:** the import spec
[`2026-11-07-recipe-import-design.md`](../specs/2026-11-07-recipe-import-design.md)
("Import flow" step 1, URL half; "Safety"; "Screens" I1 and C2's banner; "Errors";
"Testing", page fetching against a stubbed transport); the master plan's R5 entry
([`2026-11-08-units-sources-import-slices.md`](2026-11-08-units-sources-import-slices.md));
R4's plan ([`2026-11-08-slice-r4-import-from-pasted-text.md`](2026-11-08-slice-r4-import-from-pasted-text.md);
planned when this was written, **built before this slice**: the route, the
service, `ImportPage`, the banner, `importReview.ts`, the error types and
`MAX_TEXT_CHARS`); R2's `source_url` rules (at most 2000 characters, empty or
`http(s)://`, error `invalid_url`). The wireframes spec gets I1's final shape in
Task 7.

**Status:** Planned; to be built task by task on branch
claude/implement-remaining-slices-qwrp83.

## Global Constraints

- `meal_planner/` is not changed. **No Alembic migration** (no schema change).
- **No test calls the internet, a real DNS server for a public name, or a real AI
  service.** Fetch tests use `httpx.MockTransport` (as `tests/server/test_ai_transport.py`
  does) and a fake resolver (a dict from host name to IP addresses). The only real
  resolver call in a test is on numeric host forms (`2130706433`, `0x7f000001`,
  `127.1`), which the C library parses without a lookup; those tests assert the
  transport is never called.
- **Security is the point of this slice.** Every refusal listed in Task 1 and Task
  2 has a test that fails if the check is removed, and each of those tests also
  asserts that **the stubbed transport received no request for the refused hop**.
  Nothing a refused or failed fetch knows (the reason, the resolved addresses, the
  page, the status) reaches an API answer; the answer is one fixed sentence. Reasons
  go to the log as short codes with the host name only (no path or query: they may
  hold tokens).
- No bypass of the address check exists in production code: no setting, no
  parameter that turns it off. Tests inject a resolver and a transport, and the
  address policy is applied to what the resolver returns.
- All GUI text goes through vue-i18n, English file only (`web/src/i18n/en.json`).
- After Task 4 (API change): `npm run gen:api` in `web/` (`web/openapi.json`,
  `web/src/api/schema.ts`; `web/src/test-units.json` must come out unchanged), then
  `npm run typecheck` stays green.
- Checks before each commit: `python3 -m pytest -q` at the root; `npm run lint`,
  `npm run typecheck`, `npm test` in `web/` (the web ones only for Tasks 5 to 7). On
  Task 4 also `TEST_DATABASE_URL="postgresql+psycopg://postgres@localhost:5433/planner_test" python3 -m pytest -q tests/server`
  (not at the same time as another run).
- **Built after R4. This plan was written when R4 was not built.** It names R4's
  functions, tests, i18n keys and files by their planned names, never line numbers.
  **Before each task, re-read the built code it touches** (`server/api/recipe_imports.py`,
  `server/recipe_import.py`, `server/app.py`, `server/ai_runtime.py`,
  `tests/server/conftest.py`, `tests/server/test_recipe_imports.py`,
  `web/src/pages/ImportPage.vue`, `web/src/importReview.ts`, `RecipePage.vue`, the
  e2e flow's import step). Where this plan and the built code disagree on a name,
  the code wins; on a behaviour, the plan wins. If R4 is not built, stop: this slice
  needs it.

## Interpretations made in this plan

1. **What is refused, in one table.** Every case is `PageUnreadable(reason)`, which
   the route turns into the one answer 422 `page_unreadable`. Reasons (log only):
   `scheme`, `userinfo`, `port`, `host_name`, `unresolved`, `refused_address`,
   `redirects`, `redirect_target`, `status`, `not_html`, `encoding`, `too_large`,
   `timeout`, `network`.
2. **Invalid input versus refused page.** A link that is not an http or https URL
   with a host (no scheme, `ftp://`, `javascript:`, `http://`, over 2000
   characters) is the user's typo: 422 `url_invalid` ("Enter a link that starts with
   http:// or https://."), decided before any network call and revealing nothing.
   Everything the server can only find out by looking (user info, port, host name,
   address, unreachable, wrong content) is `page_unreadable`, with the same words for
   a refused internal address as for a dead site, so the answer is no probe of the
   internal network. No scheme is not guessed (`example.com/x` is `url_invalid`).
3. **Ports.** Only 80 and 443 (the URL's own port or the scheme's default), on the
   first URL and on every redirect. The spec says "http and https only"; this goes one
   step further because recipe pages are never on other ports, and it keeps the
   fetcher out of everything else listening on an external host. A redirect to
   another port is `redirect_target`. User info in a URL (`https://user:pw@host/`) is
   refused (`userinfo`): it is never a recipe link and it would be sent as a header.
4. **Host names refused before resolving** (saves a lookup, defence in depth; the
   address check would catch them anyway): `localhost`, anything ending in
   `.localhost`, `.local`, `.internal` (this covers `metadata.google.internal`),
   `.localdomain` or `.home.arpa`, after lower-casing and removing one trailing dot.
   A host with no dot that is not an IP literal is also refused (`host_name`): a
   single-label name is only ever an internal one on this network.
5. **Addresses.** `address_policy.is_public(ip)` is true only if Python's
   `ip.is_global` says so **and** the address is outside the tables below. The tables
   are the whole point of the module and have a test row for each line.
   - IPv4 refused: `0.0.0.0/8` (this network, `0.0.0.0`), `10.0.0.0/8`,
     `100.64.0.0/10` (CGNAT, also Alibaba's metadata `100.100.100.200`),
     `127.0.0.0/8`, `169.254.0.0/16` (link-local, **the Cloud Run / GCE / AWS metadata
     server `169.254.169.254`**), `172.16.0.0/12`, `192.0.0.0/24` (protocol
     assignments, Oracle's metadata `192.0.0.192`), `192.0.2.0/24`, `192.88.99.0/24`,
     `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`,
     `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved and `255.255.255.255`).
   - IPv6 is an **allow-list**: only `2000::/3` (global unicast), minus
     `2001::/23` (protocol assignments, Teredo `2001::/32`, ORCHID), `2001:db8::/32`
     (documentation), `2002::/16` (6to4: embeds any IPv4 address, loopback included)
     and `3fff::/20` (documentation). That leaves out by construction `::`, `::1`,
     `fc00::/7` (unique local, includes AWS's `fd00:ec2::254`), `fe80::/10`
     (link-local), `fec0::/10`, `ff00::/8`, `100::/64`, `::/96` (IPv4-compatible),
     `64:ff9b::/96` and `64:ff9b:1::/48` (NAT64: a DNS64 name could map to any IPv4
     address) and **`::ffff:0:0/96` (IPv4-mapped: refused whatever address it
     wraps, `::ffff:8.8.8.8` included; no real site resolves to one)**.
   - Text with a `%` (an IPv6 scope id such as `fe80::1%eth0`) is not an address and
     is refused.
6. **Resolving and pinning.** The name is resolved **once per hop**, with
   `socket.getaddrinfo(host, port, type=SOCK_STREAM)`, run on a small thread pool so
   the fetch's deadline applies to a stuck lookup too (a lookup that outlives the
   deadline is abandoned: `timeout`). **If any returned address is not public the hop
   is refused**, even if others are (mixed answers are what an attacker sends). The
   first public address is connected to; if the connection itself fails
   (`ConnectError`, `ConnectTimeout`) the next checked address is tried, at most 4.
   An IP literal in the URL skips the resolver and goes through the same policy.
   Legacy numeric forms (`2130706433`, `0x7f.1`, `127.1`, `0177.0.0.1`) are not IP
   literals to `ipaddress`, so they go to `getaddrinfo`, which turns them into
   `127.0.0.1`, which the policy refuses (tested with the real resolver).
7. **The request.** The URL's host is replaced by the checked IP (`URL.copy_with(host=ip)`;
   an IPv6 address is bracketed by httpx). Headers: `Host: <name>` (with `:port` when
   not the scheme's default), `User-Agent: meal-planner-import/1.0`, `Accept:
   text/html,application/xhtml+xml;q=0.9`, `Accept-Encoding: identity` (no compressed
   bodies, so the size limit is on what is read and a decompression bomb is not
   possible; a reply with any other `Content-Encoding` is `encoding`), `Connection:
   close` (a pooled connection to one IP is never reused for another name). For https
   the request's `extensions` carry `sni_hostname: <name>`, which httpcore 1.x passes
   as `server_hostname` to the TLS handshake, so the certificate is verified against
   the **name**, not the IP (the default TLS verification stays on; nothing disables
   it). No cookies, no `Authorization`, no `Referer` are ever sent. The task checks
   httpcore's `_connect` still does this (the installed 1.0.9 does).
8. **No environment proxies.** The default transport is a bare `httpx.HTTPTransport()`,
   which ignores `HTTP(S)_PROXY`; a proxy would resolve the name itself and make the
   pinning meaningless. The app is not run behind an outbound proxy.
9. **Limits.** 10 s is a deadline for the whole fetch (resolving, all hops, reading),
   from a monotonic clock the tests can replace. Each request gets `connect` =
   the time left and `read`, `write` and `pool` = `min(time left, 5 s)`; the deadline is
   checked before each hop and after every chunk read, so the worst case is the
   deadline plus one read wait. At most **3 redirects** are followed (statuses 301,
   302, 303, 307, 308, needing a `Location`; a 4th redirect answer is `redirects`); the
   method stays GET. **2 MB is 2 MiB (2 097 152 bytes)**: a `Content-Length` above it is
   `too_large` before reading, otherwise the body is read in chunks and stopped at the
   first byte over (a body of exactly 2 MiB passes). Only 2xx counts as read; every
   other final status is `status`. HTML only: the media type (before `;`, case
   insensitively) must be `text/html` or `application/xhtml+xml`; a missing or any other
   type is `not_html`.
10. **Decoding.** The charset of the `Content-Type` if Python knows it, else a
    `<meta charset=...>` / `<meta http-equiv=content-type ...>` in the first 2048
    bytes, else UTF-8; always `errors="replace"`.
11. **The URL kept as `source_url`** is the URL of the **last page** (after redirects:
    a short link then names the real page), without the fragment. If that is over 2000
    characters or not `http(s)` (it always is, we checked), the entered URL, if it is
    short enough, else `""` (R2's rule for the field: at most 2000 characters).
12. **JSON-LD.** Every `<script type="application/ld+json">` (any case, parameters
    allowed) is parsed with `json.loads`; a block that fails (or is nested so deep that
    Python's recursion limit trips) is ignored. A node is a recipe when its `@type` is
    `Recipe`, `https://schema.org/Recipe` or similar (the part after the last `/` or `#`
    equals `Recipe`), or a list holding such a type. They are looked for in the block
    itself, in lists, in `@graph` and in `mainEntity` / `mainEntityOfPage`, breadth first, at most
    depth 6 and 10 000 nodes. The first recipe **with at least one ingredient string** in
    `recipeIngredient` (or the older `ingredients`) wins; none means the visible text is
    used instead. Only an allow-list of fields is kept and sent: `name`, `description`,
    `recipeYield`, `recipeIngredient`, `recipeInstructions`, `recipeCategory`,
    `recipeCuisine`, `inLanguage`, `prepTime`, `cookTime`, `totalTime`. Everything else
    (reviews, comments, author, nutrition, video, anything the page owner added) is
    dropped, which also shrinks what a hostile page can say to the model.
    `recipeInstructions` is flattened (strings, `HowToStep`, nested `HowToSection` /
    `itemListElement`, in order) to a list of strings; every string is HTML-unescaped,
    stripped of tags, whitespace-collapsed and cut to 2000 characters; at most 200
    ingredient lines and 100 instruction steps. The result is `json.dumps(..., ensure_ascii=False)`.
13. **Visible text.** From `html.parser`: dropped with their content: `script`,
    `style`, `noscript`, `template`, `svg`, `head` (except `<title>`, kept as the first
    line), `nav`, `header`, `footer`, `aside`, `form`, `iframe`, `button`, `select`,
    `dialog`, and any element with the `hidden` attribute, `aria-hidden="true"` or an
    inline `style` holding `display:none` or `visibility:hidden` (spaces ignored): text a
    visitor cannot see is where page owners hide instructions for models. Block
    elements end a line; whitespace is collapsed; blank lines collapse to one;
    entities are decoded. An unclosed `<nav>` would swallow the page, so when the
    result has fewer than 200 characters a second pass drops only
    `script`, `style`, `noscript`, `template`, `svg` and the head, and is used if longer.
    No text at all is **`no_recipe` without a model call**.
14. **Length.** The extractor returns at most 200 000 characters (R4's request limit);
    **the cut to `MAX_TEXT_CHARS` and the `cut` flag stay R4's** and apply to page text
    as to pasted text. A page is never `too_long` (that is for typed text).
15. **Order in the route** (`POST /api/recipe-imports`): 503 `ai_not_configured` first (a
    server with no AI never fetches anything); then the shape of the input (`text`
    xor `url`); then for a URL: `url_required` / `url_invalid`, the fetch, the
    extraction; then R4's service. The fetch makes no model call and so uses none of
    the daily limit; a fetch that fails or finds no text leaves it untouched.
16. **Request shape.** `{text?: string, url?: string}`, each optional; exactly one must be
    present (`null` counts as absent). Neither: 422 `input_required`; both: 422
    `one_input_only` (both `loc` `["body"]`). A present `text` follows R4 unchanged (an empty
    one is `text_required`, over 200 000 is `too_long`). A present `url` is trimmed; empty
    is `url_required` (`loc` `["body","url"]`). R4's test "422 for a missing field" now
    expects `input_required`.
17. **New error answers** (all `FieldErrors`, fixed English `msg`): `url_required` 422
    "Enter the link to the recipe."; `url_invalid` 422 "Enter a link that starts with
    http:// or https://."; `page_unreadable` 422 `loc` `["body","url"]` "Couldn't read this
    page. Paste the recipe text instead."; `input_required` 422 "Give a link or paste the
    recipe text."; `one_input_only` 422 "Give either a link or text, not both.". A page with
    no recipe is R4's `no_recipe` 422 (the same type for both inputs; the web app picks
    the sentence by input).
18. **One fetcher.** `create_app` builds `app.state.page_fetcher = PageFetcher(transport=page_transport,
    resolver=page_resolver)` (both optional, for tests, as R4's `ai_transport`) and closes it
    in the lifespan after `yield`. The route reads it from `request.app.state`.
19. **Messages on I1** (spec "Errors"): `page_unreadable`: "Couldn't read this page. Paste the
    recipe text instead."; `no_recipe` **in link mode**: "No recipe found on this page. Paste the
    recipe text instead." (in text mode R4's "No recipe found in this text." stays);
    `url_required`: "Enter the link to the recipe."; `url_invalid`: "Enter a link that starts
    with http:// or https://.". Both inputs keep their text when switching and after an error.
20. **Banner** (spec: "Imported from *site*. *N* lines need you."): the site is the host of
    `source_url` without a leading `www.` (`siteName`). No site (pasted text) keeps R4's wording.
    The site is text from the URL the user typed or the page redirected to; it is shown as
    plain text (Vue escapes it), never as HTML.
21. **Not covered, on purpose**: HTTP proxies and corporate TLS interception; pages that need
    JavaScript to show the recipe (no JSON-LD and an empty shell: `no_recipe`, "paste the text");
    pages behind a login or a cookie wall; PDF links; sites that refuse unknown clients (the
    user pastes the text); a cap on parallel fetches (the app has one login; each fetch holds a
    worker thread for at most about 10 s). Residual risk, stated in the docs (Task 7): the check
    is as good as `is_public` and the resolver's answer; a hostile public name that resolves to
    a public address is fetched, and its page is untrusted text that goes to a model with no
    tools.
22. **No new dependency.** `beautifulsoup4` and `lxml` happen to be installed in some
    environments but are not in `pyproject.toml`; `html.parser` is enough and keeps the
    deploy image as it is.

## Tasks

### Task 1: Server: the address policy

**Files:** create `server/address_policy.py`, `tests/server/test_address_policy.py`.

**Build:**

- `parse_address(text: str) -> IPv4Address | IPv6Address | None`: `ipaddress.ip_address`
  of the stripped text; `None` when it does not parse or contains `%`.
- `is_public(address: IPv4Address | IPv6Address) -> bool` implementing interpretation 5:
  `address.is_global and not any(address in net for net in _IPV4_REFUSED)` for IPv4;
  for IPv6 `address.ipv4_mapped is None and address in 2000::/3 and address not in
  _IPV6_REFUSED_INSIDE_2000 and address.is_global`. The network tables are module
  constants with one comment per line naming what the range is (metadata servers
  named where they fall). `is_public_text(text) -> bool` = `parse_address` then
  `is_public`, false for `None`.
- Module docstring: states "allow-list for IPv6, deny-list for IPv4, both locks must
  agree", and that **this is the only place the rules live**.

**Tests (write first), `test_address_policy.py`:**

- Refused (parametrised, one id each): `0.0.0.0`, `0.1.2.3`, `10.0.0.1`, `10.255.255.255`,
  `100.64.0.1`, `100.100.100.200`, `100.127.255.255`, `127.0.0.1`, `127.255.255.254`,
  `169.254.169.254`, `169.254.0.1`, `172.16.0.1`, `172.31.255.255`, `192.0.0.1`, `192.0.0.192`,
  `192.0.2.1`, `192.88.99.1`, `192.168.0.1`, `192.168.255.255`, `198.18.0.1`, `198.19.255.255`,
  `198.51.100.1`, `203.0.113.1`, `224.0.0.1`, `239.255.255.255`, `240.0.0.1`, `255.255.255.255`;
  IPv6: `::`, `::1`, `::127.0.0.1`, `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `::ffff:169.254.169.254`,
  `::ffff:8.8.8.8`, `::ffff:7f00:1`, `64:ff9b::7f00:1`, `64:ff9b::808:808`, `64:ff9b:1::1`, `100::1`,
  `2001::1`, `2001:0:4136:e378:8000:63bf:3fff:fdd2` (Teredo), `2001:db8::1`, `2002:7f00:1::1`,
  `2002:808:808::1`, `3fff::1`, `fc00::1`, `fd00:ec2::254`, `fe80::1`, `fec0::1`, `ff02::1`, `ff00::`.
- Text that is not an address refuses: `fe80::1%eth0`, `""`, `localhost`, `127.1`, `2130706433`,
  `0x7f000001` (`parse_address` is `None`; `is_public_text` false; the fetcher's real-resolver test in
  Task 2 covers what these resolve to).
- Allowed: `8.8.8.8`, `1.1.1.1`, `93.184.216.34`, `100.63.255.255`, `100.128.0.1`, `172.15.255.255`,
  `172.32.0.1`, `169.253.255.255`, `169.255.0.1`, `192.0.1.1`, `198.17.255.255`, `198.20.0.1`,
  `223.255.255.255`, `2606:4700:4700::1111`, `2a00:1450:4001:81b::200e`, `2001:4860:4860::8888`,
  `2620:fe::fe`.
- A guard test: for every network in the two tables, its first and last address are refused
  (so a typo in a prefix length shows up), and `ipaddress.ip_network("0.0.0.0/0")` minus the IPv4
  table has no `is_global` address that the table refuses by mistake: iterate the table's edges
  only (no scan of 2^32 addresses).

**Verify:** `python3 -m pytest -q tests/server/test_address_policy.py`.

**Commit:** "server: address policy for fetched pages".

### Task 2: Server: the page fetcher

**Files:** create `server/page_fetch.py`, `tests/server/test_page_fetch.py`.

**Build (interpretations 1, 3, 4, 6, 7, 8, 9, 10):**

- Constants `MAX_BYTES = 2 * 1024 * 1024`, `TIMEOUT_SECONDS = 10.0`, `MAX_REDIRECTS = 3`,
  `ALLOWED_PORTS = (80, 443)`, `MAX_CONNECT_ATTEMPTS = 4`, `READ_WAIT_SECONDS = 5.0`,
  `USER_AGENT = "meal-planner-import/1.0"`.
- `class PageUnreadable(Exception)` with `reason: str` (one of interpretation 1's codes; its `str`
  is the reason only, never a URL or address).
- `@dataclass(frozen=True) class FetchedPage: url: str; html: str` (`url` is the last page's URL
  without the fragment).
- `Resolver = Callable[[str, int], Sequence[str]]`; `system_resolver(host, port)`:
  `socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)`, the distinct `sockaddr[0]`
  strings in order; `socket.gaierror` becomes an empty list.
- `class PageFetcher(transport: httpx.BaseTransport | None = None, resolver: Resolver | None
  = None, *, timeout: float = TIMEOUT_SECONDS, clock: Callable[[], float] = time.monotonic)`:
  `transport` defaults to `httpx.HTTPTransport()`; `close()` closes it (idempotent).
  `fetch(url: str) -> FetchedPage`:
  1. `deadline = clock() + timeout`; `current = url`; `for hop in range(MAX_REDIRECTS + 1)`:
  2. `target = self._check(current)`: parse with `httpx.URL` (`httpx.InvalidURL` is `scheme`),
     scheme must be `http` or `https` (`scheme`), host non-empty, **no user info** (`userinfo`), port
     (`url.port or default`) in `ALLOWED_PORTS` (`port`; the first URL's port error is `port`, a
     redirect's is `redirect_target`), host lower-cased with one trailing dot removed and the
     name rules of interpretation 4 (`host_name`); addresses: `parse_address(host)` if it parses
     (literal, no resolver call), else the resolver through a module-level
     `ThreadPoolExecutor(max_workers=4)` with `future.result(timeout=remaining)` (`timeout` when
     it does not finish; an empty answer is `unresolved`); the addresses are de-duplicated; **any
     address failing `is_public_text` is `refused_address`** (nothing else is tried).
  3. For each of the first `MAX_CONNECT_ATTEMPTS` addresses: build `httpx.Request("GET",
     url.copy_with(host=ip), headers=..., extensions=...)` (the fragment is never sent on the wire; verified
     with httpx 0.28: an IPv6 `copy_with(host=...)` is bracketed and `.host` reads back unbracketed); headers and
     `extensions` as interpretation 7, `extensions["timeout"] = {"connect": remaining, "read": min(remaining, 5),
     "write": min(remaining, 5), "pool": min(remaining, 5)}`; the **name's** URL is what `Location` joins against.
     Call `self.transport.handle_request(request)`; `httpx.ConnectError` / `httpx.ConnectTimeout` try the
     next address (none left: `network` / `timeout`); `httpx.TimeoutException` is `timeout`; any other
     `httpx.HTTPError` or `OSError`/`ssl.SSLError` is `network`.
  4. A redirect status: close the response; no `Location` header is `redirect_target`; hop already
     3 is `redirects`; else `current = str(httpx.URL(current).join(location))` (a relative `Location`
     joins against the **name's** URL, not the IP's) and loop, which runs the full check on it. A
     target the check refuses on scheme/port/userinfo is `redirect_target`; the address/name refusals
     keep their own reasons.
  5. A non-2xx final status: `status`. Content-Type, `Content-Encoding` (`identity` or absent),
     `Content-Length` (an unparsable value is ignored) as interpretation 9; then read
     `response.stream` in chunks, counting bytes, checking the deadline after each chunk; `response.close()`
     in a `finally` on every path.
  6. Decode as interpretation 10; return `FetchedPage(final URL without fragment, html)`.
  The whole of `fetch` converts any `PageUnreadable` unchanged and nothing else: an unexpected
  exception is a bug and propagates (the route's 500), it is not swallowed into a refusal.
- Log at DEBUG per hop (host, hop number); the route logs failures.

**Tests (write first), `test_page_fetch.py`.** Helpers: `fetcher(handler, resolve_map, **kw)` builds
a `PageFetcher(httpx.MockTransport(handler), resolver=lambda h, p: resolve_map[h])` (a name not in the
map raises, so an unexpected lookup fails the test) and a recording `Requests` list; `html_response(body,
**headers)`. Every refusal test asserts the exception's `reason`, **and that the recorded requests are
exactly those of the hops before the refused one**.

- *Happy path:* an https page `https://recipes.example/pasta?x=1#top` resolving to `93.184.216.34`:
  returns the html, `url == "https://recipes.example/pasta?x=1"`; the one request went to
  `request.url.host == "93.184.216.34"` and port 443, with `Host: recipes.example`, `request.extensions["sni_hostname"]
  == "recipes.example"`, `Connection: close`, `Accept-Encoding: identity`, the user agent, an `Accept` for html, and
  **no** `Cookie`, `Authorization` or `Referer`; the resolver was called exactly once with `("recipes.example", 443)`.
  http on port 80: `Host` has no port, no `sni_hostname` extension. An explicit allowed port: `http://recipes.example:80/`
  and `https://recipes.example:443/` fine. An IPv6 answer `2606:4700:4700::1111`: `request.url.host` is that address and
  the `Host` header is still the name.
- *DNS rebinding:* a resolver that answers `["93.184.216.34"]` the first time and `["127.0.0.1"]` after is
  called once for one hop, and the request went to `93.184.216.34` (the name is never looked up again, and the
  transport never sees the name as the connection host); a redirect to the **same** name is a new hop and is resolved
  again (the resolver is now asked a second time and its private answer is refused, `refused_address`): each hop is
  its own check.
- *Mixed answers:* `["93.184.216.34", "10.0.0.5"]` is `refused_address` and the transport is not called;
  `["10.0.0.5", "93.184.216.34"]` too; IPv4-mapped `["::ffff:93.184.216.34"]` too.
- *Refused hosts, first URL* (each parametrised; transport never called; for the IP literals and the
  numeric forms the resolver is **not** asked either, asserted with a resolver that raises): `http://127.0.0.1/`,
  `http://127.0.0.1:80/`, `http://0.0.0.0/`, `http://169.254.169.254/latest/meta-data/`, `http://[::1]/`,
  `http://[::ffff:7f00:1]/`, `http://[::ffff:169.254.169.254]/`, `http://[fd00:ec2::254]/`,
  `http://[64:ff9b::7f00:1]/`, `http://100.64.0.1/`, `http://100.100.100.200/`, `http://192.168.0.1/`,
  `http://10.1.2.3/`, `http://172.16.0.1/`, `http://localhost/`, `http://LOCALHOST./`, `http://app.localhost/`,
  `http://printer.local/`, `http://metadata.google.internal/`, `http://metadata/`, `http://intranet/`,
  `http://router.home.arpa/`. Names that resolve to refused addresses (`internal.example` → `10.0.0.5`,
  `127.0.0.1`, `169.254.169.254`, `::1`, `fe80::1`, `100.64.0.9`, `0.0.0.0`) are `refused_address`.
- *Legacy numeric hosts with the real resolver* (`PageFetcher(transport, resolver=None)`, so `system_resolver`
  runs; no lookup is needed): `http://2130706433/`, `http://0x7f000001/`, `http://0x7f.0.0.1/`, `http://0177.0.0.1/`,
  `http://127.1/`, `http://017700000001/`, `http://2852039166/` (169.254.169.254) are refused, transport never
  called. (Reason is `refused_address`, or `host_name` for a form the C library does not take: assert it is a
  `PageUnreadable` and the transport was not called; do not pin the reason.)
- *Schemes, ports, user info:* `ftp://x/`, `file:///etc/passwd`, `gopher://x/`, `javascript:alert(1)`, `data:text/html,x`,
  `//recipes.example/`, `recipes.example/x`, `""`, `http://` are `scheme`; `https://user:pw@recipes.example/` and
  `https://user@recipes.example/` are `userinfo`; ports 22, 25, 8080, 8443, 6379, 65535 are `port`.
- *Redirects:* 301 to a public absolute URL is followed (resolver called for the new host; two requests); 302, 303,
  307, 308 likewise; a relative `Location` (`/other`, `../x`, `//cdn.example/y`) joins against the previous URL; a chain
  of 3 redirects then a 200 succeeds; a **4th** redirect is `redirects` and exactly 4 requests were made; a redirect
  loop is `redirects`; no `Location` is `redirect_target`; redirect to `http://169.254.169.254/latest/meta-data/` is
  `refused_address` and only the first request was made; to `http://localhost:8000/`, `http://127.0.0.1/`, `http://[::1]/`,
  `http://10.0.0.1/` refused; to a name resolving to `10.0.0.5` refused (`refused_address`); to `file:///etc/passwd`, `ftp://x/`,
  `gopher://x/`, `https://user:pw@x/`, `http://x:22/` is `redirect_target`; https to http downgrade followed (policy-checked);
  a `Set-Cookie` on hop 1 is not sent on hop 2 and a redirect response's body is never read (the response is
  closed; use a stream that raises if iterated).
- *Status:* 404, 403, 410, 500, 503, 301 with no more hops allowed handled above; 204 with no body is `not_html` or
  `status` per the order (2xx passes the status check, then `not_html` for no content type: assert `PageUnreadable`).
- *Content:* `text/html`, `TEXT/HTML; charset=utf-8`, `application/xhtml+xml` are read; `text/plain`, `application/json`,
  `application/pdf`, `image/png`, `application/octet-stream`, `application/xml`, no `Content-Type` are `not_html`;
  `Content-Encoding: gzip` and `br` are `encoding` (and the body is not read); `identity` passes. Charsets: `charset=iso-8859-1`
  with a `ö` byte decodes to `ö`; an unknown charset name and a bad byte fall back to UTF-8 with `�`; a
  `<meta charset="windows-1252">` in the first bytes with no header charset is honoured; a meta after byte 2048 is not.
- *Size:* `Content-Length: 2097153` is `too_large` **and the body stream was never iterated**; an exactly 2 MiB body passes;
  2 MiB + 1 byte with no `Content-Length` (a generator in 64 KiB chunks) is `too_large` and the generator was not
  drained past the limit; a lying `Content-Length: 10` with a bigger body is still stopped at the limit; an unparsable
  `Content-Length` is ignored.
- *Time:* the transport raising `httpx.ReadTimeout`, `httpx.ConnectTimeout`, `httpx.WriteTimeout`, `httpx.PoolTimeout` is
  `timeout`; `httpx.ConnectError` on the first address and success on the second (resolver gives two public IPs) works and
  tried both in order, a `ConnectError` on all (more than 4 addresses: only 4 tried) is `network`; `httpx.RemoteProtocolError`
  and `ssl.SSLError` are `network`; **the deadline**: with an injected clock that advances 4 s per call, a body of three slow
  chunks is `timeout` after the third chunk, and a chain of redirects is `timeout` when the clock passes the deadline before a
  hop; the request's `extensions["timeout"]` has `read == min(remaining, 5)`; a resolver that blocks on an
  `Event` with `timeout=0.2` is `timeout` (release the event in a `finally`).
- *Unexpected errors are not swallowed:* a transport raising `ZeroDivisionError` propagates (the route turns it into
  a 500, never into a quiet refusal).
- *Lifecycle:* `close()` closes the transport once and twice is safe; `PageFetcher()` with no arguments builds an
  `httpx.HTTPTransport` (assert the type; no `httpx.Client` is involved, so environment proxies are not read) and `system_resolver` is the default (assert the attribute).
- *httpcore check:* a test reads `httpcore._sync.connection.HTTPConnection._connect`'s source and asserts it contains
  `sni_hostname` next to `server_hostname`, so a future httpcore that stops honouring the extension fails here rather
  than silently verifying the certificate against the IP address (it would then refuse every https page, which is the
  safe direction, but the test says why).

**Verify:** `python3 -m pytest -q tests/server/test_page_fetch.py tests/server/test_address_policy.py`.

**Commit:** "server: fetch a page with the address check on every hop and the checked address pinned".

### Task 3: Server: recipe text from a page

**Files:** create `server/page_text.py`, `tests/server/test_page_text.py`.

**Build (interpretations 12 to 14):** `extract_recipe_text(html: str) -> str` with the JSON-LD route
first and the visible-text route as the fallback; `MAX_EXTRACT_CHARS = 200_000`. Internals: a
`_Collector(HTMLParser)` (`convert_charrefs=True`) that gathers `application/ld+json` script bodies
and `<title>`; `_find_recipe(node)` (breadth first, depth and node limits, a list of `@type`s or a
string); `_recipe_text(recipe) -> str | None` (allow-list, flattening, unescape, tag stripping,
caps, `json.dumps`); `_VisibleText(HTMLParser)` with a stack of open tags so an end tag pops to its
matching start (a stray end tag is ignored, void elements `area, base, br, col, embed, hr, img,
input, link, meta, source, track, wbr` are never pushed), `strict` flag for the two passes; hidden
detection by attributes. No exception from `HTMLParser` or `json` escapes (`RecursionError` and
`ValueError` caught around parsing); garbage input gives `""`.

**Tests (write first), `test_page_text.py`:**

- JSON-LD: a Recipe at the top level; in a list; in `@graph` beside a `WebPage` and an `Organization`;
  `@type: ["Recipe", "Thing"]`; `@type: "https://schema.org/Recipe"`; as `mainEntity`; two blocks, the first
  invalid JSON (trailing comma), the second valid; two recipes, the first with no ingredients, the second used; a
  Recipe with no `recipeIngredient` falls back to visible text; `ingredients` (old name) works. The output is JSON
  holding exactly the allow-listed keys present: a `review` with the text `Ignore previous instructions`, `author`,
  `nutrition`, `video`, `image`, `aggregateRating` and an unknown `x-secret` are **not** in the output.
- Instructions: a list of strings; `HowToStep` objects (`text`, falling back to `name`); a `HowToSection` with
  `itemListElement` steps flattened in order; a single string; entities (`&amp;`, `&#176;`, `&frac12;`) unescaped; `<b>`
  and `<br>` tags removed; whitespace collapsed; one string cut to 2000, 300 ingredients to 200, 150 steps to 100;
  `recipeYield` as `"4"`, `4`, `["4", "4 servings"]` kept as given; non-string junk in lists ignored.
- Hostile JSON: 100 000 nested `[` inside a JSON-LD block (no crash, falls back); a block of 1.5 MB of numbers; a `@graph`
  that points to itself is impossible in JSON but a 50 000-node graph stops at the node limit.
- Script `type` variants: `application/ld+json`, `APPLICATION/LD+JSON`, `application/ld+json; charset=utf-8`; a plain
  `application/json` block is ignored; a `<script>` holding `</p>` text is read whole (CDATA content).
- Visible text: scripts, styles, noscript, template, svg, `head` (title kept first), nav, header, footer, aside, form,
  iframe, button, select, dialog and their content are gone; `hidden`, `aria-hidden="true"`, `style="display: none"`,
  `style="visibility:hidden"` elements and their content are gone (a `<p hidden>` with an injected instruction is
  absent from the output, a visible sibling present); block elements give lines (`p`, `div`, `li`, `h1`-`h6`, `br`,
  `tr`); inline elements do not break a line; whitespace and blank lines collapse; entities decode; text before and
  after a dropped element is kept in order; nested dropped elements and an end tag with no start do not crash or
  unbalance the stack; an unclosed `<nav>` followed by a recipe: the strict pass yields under 200 characters, the second
  pass is used and holds the recipe (and still has no script text); a 300 000-character page is cut at 200 000; an empty
  page, only scripts, and `"<<<>>><a href='"` give `""` and do not raise; a page with both JSON-LD and visible text
  uses the JSON-LD.

**Verify:** `python3 -m pytest -q tests/server/test_page_text.py`.

**Commit:** "server: recipe text from a page, schema.org JSON-LD or visible text".

### Task 4: Server: `{url}` on `/api/recipe-imports`

**Files:** modify `server/api/recipe_imports.py`, `server/recipe_import.py` (a `source_url`
keyword), `server/app.py`, `tests/server/conftest.py`, `tests/server/test_recipe_imports.py`; create
`tests/server/test_recipe_imports_url.py` (the URL cases, to keep the R4 file readable). Re-read all
of them as built.

**Build:**

- `recipe_import.import_recipe(db, text, converter, suggester, *, source_url: str = "")`: the draft's
  `source_url` is that value (R4 left `""`); nothing else in the service changes.
- `app.py`: `create_app(settings=None, *, ai_transport=None, page_transport=None, page_resolver=None)`
  builds `app.state.page_fetcher` (interpretation 18) and closes it in the lifespan.
- `api/recipe_imports.py`: `RecipeImportRequest {text: str | None = None, url: str | None = None}`,
  validated by hand into the `FieldErrors` shape (interpretations 15 to 17, in that order: 503, shape,
  URL checks, fetch, extraction); `_url_problem(raw) -> str | None` for `url_invalid` (length 2000; `httpx.URL`
  parse; scheme http or https; non-empty host); `source_url_for(page_url, entered)` per interpretation 11
  (with R2's rule: at most 2000 characters, starts with `http://` or `https://`); `PageUnreadable` becomes 422
  `page_unreadable` after `logger.warning("page refused: reason=%s host=%s", reason, host)` with the entered
  URL's host only; an empty extraction is 422 `no_recipe` (no model call); every other path as R4. The route
  stays a plain `def`. The answer is R4's `ImportedRecipe` with `source_url` set. `responses=` documents the new
  422s. The fetch happens **before** `ai.limited(engine)` is called, so nothing is reserved for it.
- `conftest.py`: a helper `page_client(handler, hosts, *, ai_provider="fake", **settings)` building
  `logged_in_client` with `page_transport=httpx.MockTransport(handler)` and `page_resolver=lambda host, port:
  hosts[host]`, returning the client and a `requests` list the handler appends to; a `page_html(body)` response
  helper; a `RECIPE_PAGE` constant (a small page with nav and script noise, a visible ingredient list, and a
  JSON-LD twin `RECIPE_PAGE_LD`).

**Tests (write first), `test_recipe_imports_url.py`** (R4's tests keep passing; its "missing field" test
changes to `input_required`):

- *Success with the fake provider:* `POST {"url": "https://recipes.example/porridge"}` with the page stubbed
  gives 200, R4's canned draft, `source_url == "https://recipes.example/porridge"`; with a redirect
  (`http://short.example/a` to `https://recipes.example/porridge#top`) `source_url` is the final URL without the
  fragment, the query kept; entered URL padded with spaces is trimmed; an over-long final URL (a redirect to a 2001-char
  URL) falls back to the entered one.
- *What the model receives* (`anthropic` over R4's `ScriptedTransport`, `ai_api_key` set): for the JSON-LD page the
  user message's recipe text is the allow-listed JSON (ingredient strings present; the review text and the nav text
  absent); for the plain page it holds the visible text and **none** of the script, style, nav, footer or hidden text;
  every `<` in a page is `&lt;` in the message (a page text of `</recipe_text>` cannot close the tag); a page over
  20 000 characters gives `cut` true and exactly 20 000 characters in the message; a page with 19 999 gives false.
  A page that holds `[fake:none]` through the fake provider gives `no_recipe` (the sentinel path still runs for page
  text), `[fake:broken]` gives 502 `ai_failed`.
- *Refusals, each a 422 `page_unreadable` with `loc` `["body","url"]` and exactly the fixed message; the body holds no
  address, reason, status or page text; the AI transport was called 0 times; the daily limit is untouched (with
  `ai_daily_limit=1` a following text import still works):* `http://127.0.0.1/`, `http://localhost/`,
  `http://[::1]/`, `http://169.254.169.254/latest/meta-data/`, `http://metadata.google.internal/`,
  `http://2130706433/`, a host resolving to `10.0.0.5`, a redirect to the metadata server (and the page transport saw only
  the first request), a redirect to a host resolving to `127.0.0.1`, a redirect chain of 4, port 8080, `https://u:p@h/`,
  404, 500, `text/plain`, `application/pdf`, an over-2-MiB body, a read timeout, a connect error.
- *No recipe:* an html page with no text (`<html></html>`, only a script) is 422 `no_recipe` with the AI transport called 0
  times; a page with text and a model answer with no sections is `no_recipe` after 1 call.
- *Input shape:* `{}` and `{"text": null, "url": null}` are `input_required`; `{"text": "x", "url": "https://a.example/"}`
  is `one_input_only`; `{"url": ""}` and `{"url": "   "}` are `url_required` (`loc` `["body","url"]`); `ftp://x/`,
  `example.com/x`, `javascript:alert(1)`, `http://`, `https://`, a 2001-character URL, a URL with a space inside, are
  `url_invalid`; none calls the page or AI transport; `{"text": ""}` is still `text_required` and a present `text` with an
  absent `url` is R4's path unchanged (its tests pass).
- *Order:* with default settings (AI not configured) `{"url": "https://recipes.example/x"}` is 503 `ai_not_configured`
  and the page transport was **not** called; 401 without a session, page transport not called; a daily limit of 0 gives
  429 `limit_reached` after the page was fetched (the fetch is free) and the model transport was not called.
- *Nothing stored:* `GET /api/recipes` and `/api/ingredients` unchanged after a URL import, as for text.
- *Wiring:* `create_app()` has `app.state.page_fetcher` whose transport is an `httpx.HTTPTransport` and whose resolver is
  `system_resolver`; with `page_transport` passed, the app's shutdown (the `TestClient` context exit) closes it once; the
  OpenAPI schema (`/openapi.json`) lists `url` and `text` as optional on `RecipeImportRequest`.
- *The key and the page stay out:* the scripted provider's error text containing the key is not in a URL import's
  answer either (R4's test, repeated once for the URL path).

**Then:** `cd web && npm run gen:api`; fix factories in `web/src/test-data.ts` if typecheck complains.

**Verify:** `python3 -m pytest -q`; then the whole server suite on Postgres (`TEST_DATABASE_URL`).

**Commit:** "server: import a recipe from a link".

### Task 5: Web: the Link field, the switch and the site in the banner

**Files:** modify `web/src/pages/ImportPage.vue`, `.test.ts`, `web/src/importReview.ts`, `.test.ts`,
`web/src/pages/RecipePage.vue`, `.test.ts`, `web/src/i18n/en.json`, `web/src/api/types.ts` (an
`ImportRequest` alias if the page wants one), `web/src/test-data.ts`. Re-read R4's built versions first.

**Build:**

- `en.json`: `import.intro` becomes "Paste a link or the recipe text. The AI reads it and makes a draft
  for you to check."; new `import.link` "Link", `import.linkHint` "Works for most recipe sites. If a site
  won't open, paste the recipe text instead.", `import.pasteText` "Paste text",
  `import.error.page_unreadable` "Couldn't read this page. Paste the recipe text instead.",
  `import.error.no_recipe_page` "No recipe found on this page. Paste the recipe text instead.",
  `import.error.url_required` "Enter the link to the recipe.", `import.error.url_invalid` "Enter a link that
  starts with http:// or https://."; `recipes.bannerSite` "Imported from {site}. {n} line needs you. |
  Imported from {site}. {n} lines need you.", `recipes.bannerSiteReady` "Imported from {site}. All lines are
  ready.". R4's `import.error.no_recipe` stays for text mode and `import.error.other` for everything else
  (`input_required`, `one_input_only`: the page can't produce them).
- `importReview.ts`: `siteName(url: string): string`: `new URL` in a try, only `http:` and `https:`, the
  lower-cased `hostname` without a leading `www.`; anything else `''`.
- `ImportPage.vue`: `mode` ref, `'link'` by default; a `q-toggle` (`aria-label` "Paste text", label
  `import.pasteText`) switches to R4's text box; the Link field is a `q-input` (`type="url"`, `inputmode="url"`,
  `aria-label` "Link", `autocomplete="off"`, `outlined`, the hint under it, read-only while a call is
  pending, Enter submits). Both values live in the page and are kept across switching and errors. **Import** is
  disabled while the **active** input is blank, in flight, or not configured. It posts `{url: link.trim()}` in link
  mode and `{text}` in text mode (**never both keys**); everything else as R4 (the draft hand-off, "Reading the recipe…",
  one POST at a time). The message for an error is `import.error.<errorType>`, except `no_recipe` in link mode which is
  `import.error.no_recipe_page`; a missing key or a network failure is `import.error.other`.
- `RecipePage.vue`: the banner uses `recipes.bannerSite` / `recipes.bannerSiteReady` with `site` when
  `siteName(draft.sourceUrl)` is non-empty, else R4's pasted-text keys. Nothing else changes: `fillImported`
  already sets `sourceUrl` from the answer, the Source field shows it (R2) and Save sends it as `source_url`.

**Tests (write first):**

- `importReview.test.ts`: `siteName` for `https://www.ica.se/recept/x` is `ica.se`; `http://Example.COM:8080/a?b#c`
  is `example.com`; `https://sub.www.example.org/` keeps `sub.www.example.org`; `https://xn--rksmrgs-5wao1o.example/`
  as is; `javascript:alert(1)`, `ftp://x/`, `''`, `not a url`, `//x` are `''`.
- `ImportPage.test.ts` (existing tests keep passing, adjusted only where the default input changed: they start by
  flipping **Paste text**): the Link field shows by default with the hint and no text box; Import is disabled while
  the link is blank or spaces; a click posts `{url}` trimmed with **no** `text` key (assert the whole body);
  Enter in the field posts; flipping **Paste text** shows the box and hides the field, posts `{text}` only; both
  inputs keep their text when flipping back and forth and after an error; Import is disabled by the **active**
  input only (text typed in the hidden box does not enable link mode); `page_unreadable` (422) shows the page-unreadable
  sentence with the link kept; `no_recipe` shows the **page** sentence in link mode and the **text** sentence in text
  mode; `url_invalid` and `url_required` sentences; `ai_failed`, `limit_reached`, `ai_not_configured` unchanged; a
  network error is `import.error.other`; the pending state ("Reading the recipe…", read-only link, one POST on a
  double click); success sets the draft and goes to `/recipes/new` (assert the draft's `source_url`).
- `RecipePage.test.ts`: an imported recipe whose `source_url` is `https://www.ica.se/recept/x` shows "Imported from
  ica.se. 2 lines need you."; the "All lines are ready." variant; with `source_url: ''` R4's "pasted text" banner; the Source
  field shows the URL; saving posts `source_url` unchanged; a hostile site name (`https://<img src=x onerror=alert(1)>.example`
  is not a valid URL: banner falls back to pasted text, nothing rendered as HTML; and `https://a.example/` with `<b>` in the
  path shows only the host).

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`.

**Commit:** "web: import from a link on I1, the site in C2's banner".

### Task 6: End-to-end step

**Files:** `web/e2e/catalog.e2e.ts` (R4's import step).

**Build:** The e2e server has no internet and the flow must not need any, so it exercises the link input
only through refusals that happen **before** a connection is made (the address policy, which is also the
real thing under test). At the start of R4's import step, before the paste part (re-read the flow):

- I1 opens on the **Link** field (the text box is not shown). Enter `http://127.0.0.1:8000/` and **Import**: the
  alert "Couldn't read this page. Paste the recipe text instead." shows and the link stays. Enter
  `http://169.254.169.254/latest/meta-data/`: the same alert. Enter `ftp://example.com/x`: "Enter a link that starts
  with http:// or https://." Clear it: **Import** is disabled.
- Flip **Paste text**: the box shows empty (the link is kept: flip back and see `ftp://example.com/x` still there, then
  flip to Paste text again) and continue with R4's paste steps unchanged.
- Update the file's header comment: import from a link (refused addresses) and from pasted text.

**Verify:** `cd web && npx vite build`; start uvicorn on an empty SQLite file in the scratchpad with `PASSWORD_HASH`,
`SESSION_KEY`, `AI_PROVIDER=fake`, `DATA_SOURCES_DIR=tests/data/data_sources`; `E2E_PASSWORD=... E2E_BASE_URL=http://localhost:8000
npm run e2e -- --trace off`; kill the server.

**Commit:** "e2e: link import refuses internal addresses".

### Task 7: Docs

**Files:** `README.md`, `docs/deploy.md`, the master plan, the import spec, the wireframes spec, this plan.

- `README.md`: the status paragraph says recipes can be imported from a link or pasted text; a short
  "Importing from a link" paragraph under the AI settings: the limits (10 s, 2 MB, 3 redirects, HTML only,
  ports 80 and 443), that the server refuses internal addresses on every hop (loopback, private, link-local and the
  cloud metadata server, CGNAT, IPv6 equivalents) and connects to the address it checked, that pages needing JavaScript or
  a login can't be read ("paste the text instead"), and that tests never touch the internet.
- `docs/deploy.md`: a note under the AI key step: link import needs outbound internet from the service (Cloud Run's default
  has it; with a VPC connector set to route all egress, the pages must stay reachable), and no new secret or setting; the
  fetch refuses the metadata server and private networks, so it can't be used to reach Google's internal services.
- Import spec: "Import flow" step 1 gains an "As built in R5" note with the settled details (the port rule, the address
  tables in one sentence and a pointer to `server/address_policy.py`, resolve-once-and-connect-to-the-checked-address, the
  deadline and size definitions, JSON-LD allow-list, visible-text rules, `source_url` is the last page's URL); "Errors" lists
  `page_unreadable`, `url_invalid`, `url_required` next to R4's; "Slices" marks 3 as R4 (built) and R5 (built).
- Wireframes spec: I1 shows the **Link** field by default with the **Paste text** switch, **Import**, "Reading the recipe…",
  the two page messages and the invalid-link message, input kept; C2's banner "Imported from *site*".
- Master plan: after R4's done line add "R5 done: see `2026-11-08-slice-r5-import-from-a-link.md`."
- This plan: Status "Built"; under each task how it was checked and the differences from the text, as earlier slice plans do.

**Verify:** the full checks once more: both suites, lint, typecheck, the Postgres run of the server suite, e2e.

## Done when

With a real AI provider (or `AI_PROVIDER=fake`), I1's Link field takes a recipe page's URL and gives an unsaved draft in C2 that
names the site in its banner and keeps the URL as the recipe's source; schema.org JSON-LD is used when present, else the visible
text; a page that can't be read, isn't HTML, is too big, too slow, redirects too often, or sits at an internal address (loopback,
private, link-local and metadata, CGNAT, IPv6 and IPv4-mapped forms, 0.0.0.0, legacy numeric hosts, on the first URL and on every
redirect, including a name whose address changes) is refused with the one fixed message and without a request for the refused
hop; the connection goes to the address that was checked; no test touches the internet; both test suites (also the server one on
Postgres), lint, typecheck and the end-to-end flow pass; and the docs say so.
