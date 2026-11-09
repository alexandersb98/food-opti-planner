"""The page fetcher, against a stubbed transport and a fake resolver. Nothing
here touches the internet. Every refusal test asserts the reason and that the
transport saw only the hops before the refused one."""

import inspect
import ssl
import threading

import httpcore._sync.connection as httpcore_connection
import httpx
import pytest

from server import page_fetch
from server.page_fetch import MAX_BYTES, FetchedPage, PageFetcher, PageUnreadable, system_resolver

PUBLIC = "93.184.216.34"
PAGE = "<html><body>hello</body></html>"


def html_response(body=PAGE, status=200, **headers):
    headers.setdefault("Content-Type", "text/html")
    content = body.encode() if isinstance(body, str) else body
    return httpx.Response(status, content=content, headers=headers)


def redirect(location, status=302, **headers):
    return httpx.Response(status, headers={"Location": location, **headers})


class Rig:
    def __init__(self, replies, hosts, **kw):
        self.requests: list[httpx.Request] = []
        self.lookups: list[tuple[str, int]] = []
        self._replies = list(replies)

        def handler(request):
            self.requests.append(request)
            reply = self._replies.pop(0) if self._replies else html_response()
            if isinstance(reply, Exception):
                raise reply
            return reply(request) if callable(reply) else reply

        def resolve(host, port):
            self.lookups.append((host, port))
            answer = hosts[host]
            return answer() if callable(answer) else answer

        self.fetcher = PageFetcher(httpx.MockTransport(handler), resolver=resolve, **kw)

    def fetch(self, url):
        return self.fetcher.fetch(url)


def rig(*replies, hosts=None, **kw):
    return Rig(list(replies), hosts if hosts is not None else {"recipes.example": [PUBLIC], "other.example": ["93.184.216.35"]}, **kw)


def refused(r, url, reason=None, requests=0):
    with pytest.raises(PageUnreadable) as caught:
        r.fetch(url)
    if reason is not None:
        assert caught.value.reason == reason
    assert len(r.requests) == requests
    return caught.value


# --- happy path -----------------------------------------------------------


def test_https_page_is_fetched_from_the_checked_address():
    r = rig(html_response())
    page = r.fetch("https://recipes.example/pasta?x=1#top")
    assert page == FetchedPage("https://recipes.example/pasta?x=1", PAGE)
    (request,) = r.requests
    assert request.url.host == PUBLIC and request.url.port is None and request.url.scheme == "https"
    assert request.headers["Host"] == "recipes.example"
    assert request.extensions["sni_hostname"] == "recipes.example"
    assert request.headers["Connection"] == "close"
    assert request.headers["Accept-Encoding"] == "identity"
    assert request.headers["User-Agent"] == page_fetch.USER_AGENT
    assert "text/html" in request.headers["Accept"]
    for name in ("Cookie", "Authorization", "Referer"):
        assert name not in request.headers
    assert "#" not in str(request.url)
    assert r.lookups == [("recipes.example", 443)]


def test_http_uses_port_80_and_no_sni():
    r = rig(html_response())
    r.fetch("http://recipes.example/")
    (request,) = r.requests
    assert request.headers["Host"] == "recipes.example"
    assert "sni_hostname" not in request.extensions
    assert r.lookups == [("recipes.example", 80)]


@pytest.mark.parametrize("url", ["http://recipes.example:80/", "https://recipes.example:443/"])
def test_explicit_allowed_ports(url):
    r = rig(html_response())
    r.fetch(url)
    assert len(r.requests) == 1


def test_an_ipv6_answer_is_connected_to_with_the_name_kept():
    r = rig(html_response(), hosts={"recipes.example": ["2606:4700:4700::1111"]})
    r.fetch("https://recipes.example/")
    (request,) = r.requests
    assert request.url.host == "2606:4700:4700::1111"
    assert request.headers["Host"] == "recipes.example"


def test_a_public_ip_literal_skips_the_resolver():
    r = rig(html_response(), hosts={})
    r.fetch("http://93.184.216.34/x")
    assert r.lookups == [] and r.requests[0].headers["Host"] == "93.184.216.34"


# --- DNS rebinding --------------------------------------------------------


def test_the_name_is_resolved_once_per_hop_and_never_connected_to():
    answers = iter([[PUBLIC], ["127.0.0.1"]])
    r = rig(redirect("https://recipes.example/again"), hosts={"recipes.example": lambda: next(answers)})
    with pytest.raises(PageUnreadable) as caught:
        r.fetch("https://recipes.example/start")
    assert caught.value.reason == "refused_address"
    assert len(r.lookups) == 2  # each hop is its own check
    assert [q.url.host for q in r.requests] == [PUBLIC]  # the second hop sent nothing


def test_one_hop_looks_up_once():
    answers = iter([[PUBLIC], ["127.0.0.1"]])
    r = rig(html_response(), hosts={"recipes.example": lambda: next(answers)})
    r.fetch("https://recipes.example/")
    assert len(r.lookups) == 1 and r.requests[0].url.host == PUBLIC


@pytest.mark.parametrize(
    "answer", [[PUBLIC, "10.0.0.5"], ["10.0.0.5", PUBLIC], ["::ffff:93.184.216.34"], [PUBLIC, "::1"]]
)
def test_any_refused_answer_refuses_the_hop(answer):
    refused(rig(hosts={"recipes.example": answer}), "https://recipes.example/", "refused_address")


@pytest.mark.parametrize("answer", [[], ["fe80::1%eth0"], ["not an address"]])
def test_no_or_unparsable_answer(answer):
    r = rig(hosts={"recipes.example": answer})
    err = refused(r, "https://recipes.example/")
    assert err.reason in ("unresolved", "refused_address")


# --- refused hosts --------------------------------------------------------

LITERALS = [
    "http://127.0.0.1/",
    "http://127.0.0.1:80/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[fd00:ec2::254]/",
    "http://[64:ff9b::7f00:1]/",
    "http://100.64.0.1/",
    "http://100.100.100.200/",
    "http://192.168.0.1/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
]


@pytest.mark.parametrize("url", LITERALS)
def test_ip_literals_are_refused_without_a_lookup(url):
    def boom(host, port):
        raise AssertionError("looked up")

    sent = []
    fetcher = PageFetcher(httpx.MockTransport(lambda q: sent.append(q)), resolver=boom)
    with pytest.raises(PageUnreadable) as caught:
        fetcher.fetch(url)
    assert caught.value.reason == "refused_address" and sent == []


NAMES = [
    "http://localhost/",
    "http://LOCALHOST./",
    "http://app.localhost/",
    "http://printer.local/",
    "http://metadata.google.internal/",
    "http://metadata/",
    "http://intranet/",
    "http://router.home.arpa/",
    "http://box.localdomain/",
]


@pytest.mark.parametrize("url", NAMES)
def test_internal_names_are_refused_before_a_lookup(url):
    r = rig(hosts={})  # a lookup would raise KeyError
    refused(r, url, "host_name")
    assert r.lookups == []


@pytest.mark.parametrize("address", ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1", "fe80::1", "100.64.0.9", "0.0.0.0"])
def test_names_that_resolve_to_internal_addresses(address):
    r = rig(hosts={"internal.example": [address]})
    refused(r, "https://internal.example/", "refused_address")
    assert r.lookups == [("internal.example", 443)]


@pytest.mark.parametrize(
    "url",
    [
        "http://2130706433/",
        "http://0x7f000001/",
        "http://0x7f.0.0.1/",
        "http://0177.0.0.1/",
        "http://127.1/",
        "http://017700000001/",
        "http://2852039166/",
    ],
)
def test_legacy_numeric_hosts_with_the_real_resolver(url):
    sent = []
    fetcher = PageFetcher(httpx.MockTransport(lambda q: sent.append(q)))
    assert fetcher.resolver is system_resolver
    with pytest.raises(PageUnreadable):
        fetcher.fetch(url)
    assert sent == []


@pytest.mark.parametrize(
    "url",
    ["ftp://x/", "file:///etc/passwd", "gopher://x/", "javascript:alert(1)", "data:text/html,x", "//recipes.example/", "recipes.example/x", "", "http://"],
)
def test_other_schemes_and_shapes(url):
    refused(rig(), url, "scheme")


@pytest.mark.parametrize("url", ["https://user:pw@recipes.example/", "https://user@recipes.example/"])
def test_user_info(url):
    refused(rig(), url, "userinfo")


@pytest.mark.parametrize("port", [22, 25, 8080, 8443, 6379, 65535])
def test_other_ports(port):
    r = rig()
    refused(r, f"https://recipes.example:{port}/", "port")
    assert r.lookups == []


# --- redirects ------------------------------------------------------------


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_redirects_are_followed(status):
    r = rig(redirect("https://other.example/new", status), html_response())
    page = r.fetch("https://recipes.example/old")
    assert page.url == "https://other.example/new"
    assert [q.url.host for q in r.requests] == [PUBLIC, "93.184.216.35"]
    assert r.requests[1].headers["Host"] == "other.example"


@pytest.mark.parametrize(
    ("location", "expected"),
    [("/other", "https://recipes.example/other"), ("../x", "https://recipes.example/x"), ("//other.example/y", "https://other.example/y")],
)
def test_relative_locations_join_against_the_name(location, expected):
    r = rig(redirect(location), html_response())
    assert r.fetch("https://recipes.example/a/b").url == expected


def test_three_redirects_then_a_page():
    r = rig(redirect("/1"), redirect("/2"), redirect("/3"), html_response())
    assert r.fetch("https://recipes.example/").url.endswith("/3")
    assert len(r.requests) == 4


def test_a_fourth_redirect_is_refused():
    r = rig(redirect("/1"), redirect("/2"), redirect("/3"), redirect("/4"), html_response())
    refused(r, "https://recipes.example/", "redirects", requests=4)


def test_a_redirect_loop():
    r = rig(*[redirect("/") for _ in range(10)])
    refused(r, "https://recipes.example/", "redirects", requests=4)


def test_a_redirect_without_location():
    refused(rig(httpx.Response(302)), "https://recipes.example/", "redirect_target", requests=1)


@pytest.mark.parametrize(
    "target", ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1/", "http://[::1]/", "http://10.0.0.1/", "http://localhost/"]
)
def test_redirects_to_internal_hosts_send_nothing(target):
    r = rig(redirect(target), html_response())
    err = refused(r, "https://recipes.example/", requests=1)
    assert err.reason in ("refused_address", "host_name")


def test_a_redirect_to_a_name_with_an_internal_address():
    r = rig(redirect("https://internal.example/"), hosts={"recipes.example": [PUBLIC], "internal.example": ["10.0.0.5"]})
    refused(r, "https://recipes.example/", "refused_address", requests=1)


@pytest.mark.parametrize("target", ["file:///etc/passwd", "ftp://x/", "gopher://x/", "https://user:pw@x/", "http://x:22/", "http://localhost:8000/"])
def test_redirects_to_bad_schemes_ports_and_user_info(target):
    refused(rig(redirect(target)), "https://recipes.example/", "redirect_target", requests=1)


def test_a_downgrade_to_http_is_followed_under_the_same_policy():
    r = rig(redirect("http://other.example/"), html_response())
    assert r.fetch("https://recipes.example/").url == "http://other.example/"
    assert "sni_hostname" not in r.requests[1].extensions


def test_cookies_are_not_carried_and_a_redirect_body_is_not_read():
    class Explodes(httpx.SyncByteStream):
        def __iter__(self):
            raise AssertionError("body read")
            yield b""

        def close(self):
            self.closed = True

    stream = Explodes()
    first = httpx.Response(302, headers={"Location": "/next", "Set-Cookie": "a=b"}, stream=stream)
    r = rig(first, html_response())
    r.fetch("https://recipes.example/")
    assert "Cookie" not in r.requests[1].headers
    assert stream.closed is True


# --- status and content ---------------------------------------------------


@pytest.mark.parametrize("status", [404, 403, 410, 500, 503])
def test_error_statuses(status):
    refused(rig(html_response(status=status)), "https://recipes.example/", "status", requests=1)


def test_a_204_is_not_html():
    refused(rig(httpx.Response(204)), "https://recipes.example/", "not_html", requests=1)


@pytest.mark.parametrize("media", ["text/html", "TEXT/HTML; charset=utf-8", "application/xhtml+xml"])
def test_html_types_are_read(media):
    assert rig(html_response(**{"Content-Type": media})).fetch("https://recipes.example/").html == PAGE


@pytest.mark.parametrize(
    "media", ["text/plain", "application/json", "application/pdf", "image/png", "application/octet-stream", "application/xml"]
)
def test_other_types_are_refused(media):
    refused(rig(html_response(**{"Content-Type": media})), "https://recipes.example/", "not_html", requests=1)


def test_no_content_type():
    reply = httpx.Response(200, content=b"x")
    refused(rig(reply), "https://recipes.example/", "not_html", requests=1)


@pytest.mark.parametrize("encoding", ["gzip", "br"])
def test_compressed_bodies_are_refused_unread(encoding):
    class Explodes(httpx.SyncByteStream):
        def __iter__(self):
            raise AssertionError("body read")
            yield b""

    reply = httpx.Response(200, headers={"Content-Type": "text/html", "Content-Encoding": encoding}, stream=Explodes())
    refused(rig(reply), "https://recipes.example/", "encoding", requests=1)


def test_identity_encoding_passes():
    assert rig(html_response(**{"Content-Encoding": "identity"})).fetch("https://recipes.example/").html == PAGE


def test_charsets():
    latin = html_response("<p>smör</p>".encode("latin-1"), **{"Content-Type": "text/html; charset=iso-8859-1"})
    assert rig(latin).fetch("https://recipes.example/").html == "<p>smör</p>"
    unknown = html_response(b"<p>\xff ok</p>", **{"Content-Type": "text/html; charset=nonsense"})
    assert rig(unknown).fetch("https://recipes.example/").html == "<p>� ok</p>"
    meta = html_response('<meta charset="windows-1252"><p>€</p>'.encode("windows-1252"))
    assert rig(meta).fetch("https://recipes.example/").html.endswith("<p>€</p>")
    late = b"<p>" + b"x" * 2100 + b'</p><meta charset="windows-1252">\x80'
    assert rig(html_response(late)).fetch("https://recipes.example/").html.endswith("�")


# --- size -----------------------------------------------------------------


class Chunks(httpx.SyncByteStream):
    def __init__(self, count, size=64 * 1024):
        self.count, self.size, self.served = count, size, 0

    def __iter__(self):
        for _ in range(self.count):
            self.served += 1
            yield b"a" * self.size

    def close(self):
        pass


def test_content_length_over_the_limit_is_refused_unread():
    stream = Chunks(1)
    reply = httpx.Response(200, headers={"Content-Type": "text/html", "Content-Length": str(MAX_BYTES + 1)}, stream=stream)
    refused(rig(reply), "https://recipes.example/", "too_large", requests=1)
    assert stream.served == 0


def test_exactly_two_mib_passes():
    page = rig(html_response(b"a" * MAX_BYTES)).fetch("https://recipes.example/")
    assert len(page.html) == MAX_BYTES


def test_one_byte_over_without_content_length_stops_reading():
    stream = Chunks(MAX_BYTES // (64 * 1024) + 40)
    reply = httpx.Response(200, headers={"Content-Type": "text/html"}, stream=stream)
    refused(rig(reply), "https://recipes.example/", "too_large", requests=1)
    assert stream.served == MAX_BYTES // (64 * 1024) + 1


def test_a_lying_content_length_is_still_stopped():
    stream = Chunks(100)
    reply = httpx.Response(200, headers={"Content-Type": "text/html", "Content-Length": "10"}, stream=stream)
    refused(rig(reply), "https://recipes.example/", "too_large", requests=1)
    assert stream.served < 100


def test_an_unparsable_content_length_is_ignored():
    reply = html_response(**{"Content-Length": "lots"})
    assert rig(reply).fetch("https://recipes.example/").html == PAGE


# --- time and failures ----------------------------------------------------


@pytest.mark.parametrize("error", [httpx.ReadTimeout("x"), httpx.ConnectTimeout("x"), httpx.WriteTimeout("x"), httpx.PoolTimeout("x")])
def test_timeouts(error):
    refused(rig(error), "https://recipes.example/", "timeout", requests=1)


def test_connect_error_tries_the_next_address_in_order():
    r = rig(httpx.ConnectError("x"), html_response(), hosts={"recipes.example": [PUBLIC, "93.184.216.40"]})
    assert r.fetch("https://recipes.example/").html == PAGE
    assert [q.url.host for q in r.requests] == [PUBLIC, "93.184.216.40"]


def test_only_four_addresses_are_tried():
    addresses = [f"93.184.216.{n}" for n in range(1, 8)]
    r = rig(*[httpx.ConnectError("x")] * 7, hosts={"recipes.example": addresses})
    refused(r, "https://recipes.example/", "network", requests=4)
    assert [q.url.host for q in r.requests] == addresses[:4]


def test_connect_timeout_on_every_address_is_a_timeout():
    r = rig(httpx.ConnectTimeout("x"), httpx.ConnectTimeout("x"), hosts={"recipes.example": [PUBLIC, "93.184.216.40"]})
    refused(r, "https://recipes.example/", "timeout", requests=2)


@pytest.mark.parametrize("error", [httpx.RemoteProtocolError("x"), ssl.SSLError("bad certificate"), OSError("reset")])
def test_other_transport_errors_are_network(error):
    refused(rig(error), "https://recipes.example/", "network", requests=1)


class Ticking:
    def __init__(self, step):
        self.now, self.step = 0.0, step

    def __call__(self):
        value = self.now
        self.now += self.step
        return value


def test_the_deadline_applies_while_reading():
    stream = Chunks(3)
    reply = httpx.Response(200, headers={"Content-Type": "text/html"}, stream=stream)
    refused(rig(reply, clock=Ticking(4)), "https://recipes.example/", "timeout", requests=1)
    assert stream.served <= 3


def test_the_deadline_applies_between_hops():
    r = rig(redirect("/1"), redirect("/2"), html_response(), clock=Ticking(4))
    refused(r, "https://recipes.example/", "timeout", requests=1)


def test_the_request_gets_the_time_left():
    r = rig(html_response(), clock=Ticking(1))
    r.fetch("https://recipes.example/")
    timeout = r.requests[0].extensions["timeout"]
    assert timeout["connect"] <= 10 and timeout["read"] == min(timeout["connect"], 5.0)
    assert timeout["write"] == timeout["read"] and timeout["pool"] == timeout["read"]


def test_a_stuck_lookup_times_out():
    release = threading.Event()
    r = rig(hosts={"recipes.example": lambda: release.wait(5) or [PUBLIC]}, timeout=0.2)
    try:
        refused(r, "https://recipes.example/", "timeout")
    finally:
        release.set()


def test_unexpected_errors_are_not_swallowed():
    with pytest.raises(ZeroDivisionError):
        rig(ZeroDivisionError()).fetch("https://recipes.example/")


# --- lifecycle ------------------------------------------------------------


def test_close_closes_the_transport_once():
    class Transport(httpx.BaseTransport):
        closed = 0

        def close(self):
            self.closed += 1

    transport = Transport()
    fetcher = PageFetcher(transport)
    fetcher.close()
    fetcher.close()
    assert transport.closed == 1


def test_the_defaults():
    fetcher = PageFetcher()
    assert isinstance(fetcher.transport, httpx.HTTPTransport) and fetcher.resolver is system_resolver
    fetcher.close()


def test_httpcore_still_honours_sni_hostname():
    source = inspect.getsource(httpcore_connection.HTTPConnection._connect)
    assert "sni_hostname" in source and "server_hostname" in source


# --- review fixes -----------------------------------------------------------


def test_an_idn_host_uses_punycode_for_the_lookup_host_header_and_sni():
    r = rig(html_response(), hosts={"xn--mnchen-3ya.de": [PUBLIC]})
    r.fetch("https://münchen.de/rezept")
    assert r.lookups == [("xn--mnchen-3ya.de", 443)]
    (request,) = r.requests
    assert request.headers["Host"] == "xn--mnchen-3ya.de"
    assert request.extensions["sni_hostname"] == "xn--mnchen-3ya.de"


def test_a_redirect_to_an_idn_host():
    r = rig(redirect("https://räksmörgås.example/x".encode()), html_response(), hosts={"recipes.example": [PUBLIC], "xn--rksmrgs-5wao1o.example": [PUBLIC]})
    assert r.fetch("https://recipes.example/").url.startswith("https://xn--rksmrgs-5wao1o.example/")


@pytest.mark.parametrize("charset", ["base64", "hex", "zlib", "bz2", "rot13", "idna", "undefined", "uu", "quopri"])
def test_non_text_charsets_fall_back_to_utf8(charset):
    header = html_response(b"<p>ok \xff</p>", **{"Content-Type": f"text/html; charset={charset}"})
    assert rig(header).fetch("https://recipes.example/").html == "<p>ok �</p>"
    meta = html_response(f'<meta charset="{charset}"><p>ok</p>'.encode())
    assert rig(meta).fetch("https://recipes.example/").html.endswith("<p>ok</p>")


def test_a_padded_answer_is_pinned_as_the_checked_address():
    r = rig(html_response(), hosts={"recipes.example": [f" {PUBLIC} "]})
    r.fetch("https://recipes.example/")
    assert r.requests[0].url.host == PUBLIC


@pytest.mark.parametrize("url", ["http://recipes.example:0/", "https://recipes.example:0/"])
def test_port_zero_is_refused(url):
    refused(rig(), url, "port")


def test_the_default_transport_obeys_the_deadline():
    fetcher = PageFetcher()
    assert isinstance(fetcher.transport._pool._network_backend, page_fetch._DeadlineBackend)
    fetcher.close()


def test_a_server_that_trickles_its_headers_is_cut_at_the_deadline(monkeypatch):
    """A real loopback socket and the real transport (the address check is off
    for this test only, to reach 127.0.0.1)."""
    import socket
    import time

    monkeypatch.setattr(page_fetch, "is_public", lambda address: True)
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]
    monkeypatch.setattr(page_fetch, "ALLOWED_PORTS", (80, 443, port))
    stop = threading.Event()

    def trickle():
        conn, _ = server.accept()
        conn.recv(65536)
        conn.sendall(b"HTTP/1.1 200 OK\r\n")
        while not stop.is_set():
            try:
                conn.sendall(b"X-Slow: 1\r\n")
            except OSError:
                break
            stop.wait(0.2)
        conn.close()

    thread = threading.Thread(target=trickle, daemon=True)
    thread.start()
    fetcher = PageFetcher(timeout=1.0, resolver=lambda host, p: ["127.0.0.1"])
    start = time.monotonic()
    try:
        with pytest.raises(PageUnreadable) as caught:
            fetcher.fetch(f"http://recipes.example:{port}/")
        elapsed = time.monotonic() - start
    finally:
        stop.set()
        fetcher.close()
        server.close()
    assert caught.value.reason == "timeout" and elapsed < 3.0
