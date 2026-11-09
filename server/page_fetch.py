"""Fetch a web page for import, safely (import spec, "Safety").

`PageFetcher.fetch` follows redirects itself. On every hop it re-parses the URL,
checks scheme, port, user info and host name, resolves the name once, refuses
the hop if any answer is not a public address (`address_policy`), and then
connects to the address it checked: the URL is rewritten to the IP address, the
`Host` header and the TLS `sni_hostname` keep the name, so the certificate is
still verified against the name. There is no second lookup between the check
and the connection, so DNS rebinding has nothing to rebind.

It talks to an `httpx.BaseTransport` directly (no client: no cookie jar, no
redirect following, no environment proxies), which is also what tests stub.
Every refusal is `PageUnreadable` with a short reason code; nothing a refusal
knows is meant for an API answer."""

import codecs
import logging
import re
import socket
import ssl
import threading
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass

import httpcore
import httpx

from .address_policy import is_public, parse_address

log = logging.getLogger(__name__)

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_SECONDS = 10.0
MAX_REDIRECTS = 3
ALLOWED_PORTS = (80, 443)
MAX_CONNECT_ATTEMPTS = 4
READ_WAIT_SECONDS = 5.0
USER_AGENT = "meal-planner-import/1.0"

_REDIRECTS = (301, 302, 303, 307, 308)
_HTML_TYPES = ("text/html", "application/xhtml+xml")
_INTERNAL_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")
_META_CHARSET = re.compile(r"<meta[^>]+charset\s*=\s*[\"']?([^\"'>\s;/]+)", re.IGNORECASE)
_lookups = ThreadPoolExecutor(max_workers=16, thread_name_prefix="page-resolver")


_current = threading.local()  # the running fetch's absolute deadline (time.monotonic), per thread


def _time_left() -> float | None:
    deadline = getattr(_current, "deadline", None)
    return None if deadline is None else deadline - time.monotonic()


def _capped(timeout: float | None, exc: type[Exception]) -> float | None:
    """`timeout` limited to what is left of the fetch's deadline; raises `exc`
    when none is left."""
    left = _time_left()
    if left is None:
        return timeout
    if left <= 0:
        raise exc("deadline")
    return left if timeout is None else min(timeout, left)


class _DeadlineStream(httpcore.NetworkStream):
    """A connection whose every read, write and handshake is limited by the
    fetch's overall deadline, so a server that trickles bytes can't keep a
    worker beyond it (httpcore's own timeouts restart on every read)."""

    def __init__(self, inner: httpcore.NetworkStream):
        self._inner = inner

    def read(self, max_bytes, timeout=None):
        return self._inner.read(max_bytes, timeout=_capped(timeout, httpcore.ReadTimeout))

    def write(self, buffer, timeout=None):
        return self._inner.write(buffer, timeout=_capped(timeout, httpcore.WriteTimeout))

    def close(self):
        self._inner.close()

    def start_tls(self, ssl_context, server_hostname=None, timeout=None):
        return _DeadlineStream(
            self._inner.start_tls(ssl_context, server_hostname, timeout=_capped(timeout, httpcore.ConnectTimeout))
        )

    def get_extra_info(self, info):
        return self._inner.get_extra_info(info)


class _DeadlineBackend(httpcore.NetworkBackend):
    def __init__(self, inner: httpcore.NetworkBackend):
        self._inner = inner

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        stream = self._inner.connect_tcp(
            host, port, timeout=_capped(timeout, httpcore.ConnectTimeout), local_address=local_address,
            socket_options=socket_options,
        )  # fmt: skip
        return _DeadlineStream(stream)

    def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise httpcore.ConnectError("unix sockets are not used")

    def sleep(self, seconds):
        self._inner.sleep(seconds)


def _default_transport() -> httpx.HTTPTransport:
    """A bare transport (no environment proxies) whose connections obey the
    fetch's overall deadline."""
    transport = httpx.HTTPTransport()
    pool = transport._pool  # httpx pins httpcore's pool here; a test checks it
    pool._network_backend = _DeadlineBackend(pool._network_backend)
    return transport


class PageUnreadable(Exception):
    """The page was refused or could not be read. `str` is the reason code
    only: scheme, userinfo, port, host_name, unresolved, refused_address,
    redirects, redirect_target, status, not_html, encoding, too_large, timeout
    or network."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class FetchedPage:
    url: str  # the last page's URL, without the fragment
    html: str


Resolver = Callable[[str, int], Sequence[str]]


def system_resolver(host: str, port: int) -> list[str]:
    """The distinct addresses the system resolver gives, in order."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        return []
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


@dataclass(frozen=True)
class _Target:
    url: httpx.URL
    host: str
    port: int
    addresses: list[str]


class PageFetcher:
    def __init__(
        self,
        transport: httpx.BaseTransport | None = None,
        resolver: Resolver | None = None,
        *,
        timeout: float = TIMEOUT_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.transport = transport if transport is not None else _default_transport()
        self.resolver: Resolver = resolver or system_resolver
        self.timeout = timeout
        self.clock = clock
        self._closed = False

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            self.transport.close()

    def fetch(self, url: str) -> FetchedPage:
        deadline = self.clock() + self.timeout
        _current.deadline = time.monotonic() + self.timeout
        try:
            return self._fetch(url, deadline)
        finally:
            _current.deadline = None

    def _fetch(self, url: str, deadline: float) -> FetchedPage:
        current = url
        for hop in range(MAX_REDIRECTS + 1):
            target = self._check(current, deadline, redirect=hop > 0)
            log.debug("page fetch hop %d host=%s", hop, target.host)
            response = self._request(target, deadline)
            try:
                if response.status_code in _REDIRECTS:
                    location = response.headers.get("location")
                    if not location:
                        raise PageUnreadable("redirect_target")
                    if hop == MAX_REDIRECTS:
                        raise PageUnreadable("redirects")
                    try:
                        current = str(httpx.URL(current).join(location))
                    except httpx.InvalidURL:
                        raise PageUnreadable("redirect_target") from None
                    continue
                html = self._read(response, deadline)
            finally:
                response.close()
            return FetchedPage(str(target.url.copy_with(fragment=None)), html)
        raise PageUnreadable("redirects")  # not reached: the last hop raises

    def _left(self, deadline: float) -> float:
        remaining = deadline - self.clock()
        if remaining <= 0:
            raise PageUnreadable("timeout")
        return remaining

    def _check(self, raw: str, deadline: float, *, redirect: bool) -> _Target:
        refused = "redirect_target" if redirect else None
        try:
            url = httpx.URL(raw)
        except httpx.InvalidURL:
            raise PageUnreadable(refused or "scheme") from None
        if url.scheme not in ("http", "https"):
            raise PageUnreadable(refused or "scheme")
        host = url.raw_host.decode("ascii").lower()  # punycode for an IDN name
        if not host:
            raise PageUnreadable(refused or "scheme")
        if url.userinfo:
            raise PageUnreadable(refused or "userinfo")
        port = url.port if url.port is not None else (443 if url.scheme == "https" else 80)
        if port not in ALLOWED_PORTS:
            raise PageUnreadable(refused or "port")
        literal = parse_address(host)
        if literal is not None:
            addresses = [str(literal)]
        else:
            host = host.removesuffix(".")
            if host == "localhost" or host.endswith(_INTERNAL_SUFFIXES) or "." not in host:
                raise PageUnreadable("host_name")
            addresses = self._resolve(host, port, deadline)
        if not addresses:
            raise PageUnreadable("unresolved")
        parsed = [parse_address(address) for address in dict.fromkeys(addresses)]
        if not all(address is not None and is_public(address) for address in parsed):
            raise PageUnreadable("refused_address")
        addresses = list(dict.fromkeys(str(address) for address in parsed))  # exactly what was checked
        return _Target(url, host, port, addresses)

    def _resolve(self, host: str, port: int, deadline: float) -> Sequence[str]:
        remaining = self._left(deadline)
        future = _lookups.submit(self.resolver, host, port)
        try:
            return future.result(timeout=remaining)
        except FutureTimeout:
            raise PageUnreadable("timeout") from None

    def _request(self, target: _Target, deadline: float) -> httpx.Response:
        url = target.url
        default_port = 443 if url.scheme == "https" else 80
        name = f"[{target.host}]" if ":" in target.host else target.host
        headers = {
            "Host": name if target.port == default_port else f"{name}:{target.port}",
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9",
            "Accept-Encoding": "identity",
            "Connection": "close",
        }
        last: PageUnreadable | None = None
        for address in target.addresses[:MAX_CONNECT_ATTEMPTS]:
            remaining = self._left(deadline)
            extensions: dict = {
                "timeout": {
                    "connect": remaining,
                    "read": min(remaining, READ_WAIT_SECONDS),
                    "write": min(remaining, READ_WAIT_SECONDS),
                    "pool": min(remaining, READ_WAIT_SECONDS),
                }
            }
            if url.scheme == "https":
                extensions["sni_hostname"] = target.host
            request = httpx.Request(
                "GET", url.copy_with(host=address, fragment=None), headers=headers, extensions=extensions
            )
            try:
                return self.transport.handle_request(request)
            except httpx.ConnectTimeout:
                last = PageUnreadable("timeout")
            except httpx.ConnectError:
                last = PageUnreadable("network")
            except httpx.TimeoutException:
                raise PageUnreadable("timeout") from None
            except (httpx.HTTPError, OSError, ssl.SSLError):
                raise PageUnreadable("network") from None
        assert last is not None
        raise last

    def _read(self, response: httpx.Response, deadline: float) -> str:
        if not 200 <= response.status_code < 300:
            raise PageUnreadable("status")
        content_type = response.headers.get("content-type", "")
        media = content_type.split(";", 1)[0].strip().lower()
        if media not in _HTML_TYPES:
            raise PageUnreadable("not_html")
        if response.headers.get("content-encoding", "identity").strip().lower() not in ("", "identity"):
            raise PageUnreadable("encoding")
        try:
            if int(response.headers.get("content-length", "")) > MAX_BYTES:
                raise PageUnreadable("too_large")
        except ValueError:
            pass
        body = bytearray()
        try:
            for chunk in response.stream:  # type: ignore[union-attr]
                body += chunk
                if len(body) > MAX_BYTES:
                    raise PageUnreadable("too_large")
                self._left(deadline)
        except httpx.TimeoutException:
            raise PageUnreadable("timeout") from None
        except (httpx.HTTPError, OSError, ssl.SSLError):
            raise PageUnreadable("network") from None
        return _decode(bytes(body), content_type)


def _known(name: str) -> str | None:
    """The codec's name if it is a text encoding (not base64, hex, zlib, ...)."""
    try:
        info = codecs.lookup(name.strip())
    except (LookupError, ValueError):
        return None
    return info.name if getattr(info, "_is_text_encoding", True) else None


def _decode(body: bytes, content_type: str) -> str:
    """The header's charset if Python knows it, else a meta tag's in the first
    2048 bytes, else UTF-8; bad bytes become U+FFFD."""
    encoding = None
    match = re.search(r"charset\s*=\s*[\"']?([^\s;\"']+)", content_type, re.IGNORECASE)
    if match:
        encoding = _known(match.group(1))
    if encoding is None:
        meta = _META_CHARSET.search(body[:2048].decode("latin-1"))
        if meta:
            encoding = _known(meta.group(1))
    try:
        return body.decode(encoding or "utf-8", errors="replace")
    except (LookupError, UnicodeError):  # e.g. "undefined", which is a "text" codec that always fails
        return body.decode("utf-8", errors="replace")
