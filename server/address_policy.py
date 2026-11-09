"""Which IP addresses a fetched page may live at.

IPv6 is an allow-list (only global unicast, minus the special-purpose ranges
inside it), IPv4 is a deny-list, and Python's own `is_global` is a second lock:
both must say yes. This is the only place the rules live; the page fetcher
applies `is_public_text` to every address a name resolves to, on every hop."""

import ipaddress
from ipaddress import IPv4Address, IPv6Address

_IPV4_REFUSED = tuple(
    ipaddress.ip_network(net)
    for net in (
        "0.0.0.0/8",  # this network, 0.0.0.0
        "10.0.0.0/8",  # private
        "100.64.0.0/10",  # carrier-grade NAT; Alibaba's metadata server 100.100.100.200
        "127.0.0.0/8",  # loopback
        "169.254.0.0/16",  # link-local; the Cloud Run, GCE and AWS metadata server 169.254.169.254
        "172.16.0.0/12",  # private
        "192.0.0.0/24",  # protocol assignments; Oracle's metadata server 192.0.0.192
        "192.0.2.0/24",  # documentation (TEST-NET-1)
        "192.88.99.0/24",  # 6to4 relay anycast (deprecated)
        "192.168.0.0/16",  # private
        "198.18.0.0/15",  # benchmarking
        "198.51.100.0/24",  # documentation (TEST-NET-2)
        "203.0.113.0/24",  # documentation (TEST-NET-3)
        "224.0.0.0/4",  # multicast
        "240.0.0.0/4",  # reserved, and 255.255.255.255
    )
)

_IPV6_ALLOWED = ipaddress.ip_network("2000::/3")  # global unicast
_IPV6_REFUSED_INSIDE_2000 = tuple(
    ipaddress.ip_network(net)
    for net in (
        "2001::/23",  # protocol assignments: Teredo 2001::/32, ORCHID
        "2001:db8::/32",  # documentation
        "2002::/16",  # 6to4: embeds any IPv4 address, loopback included
        "3fff::/20",  # documentation
    )
)
# Left out by construction: ::, ::1, fc00::/7 (unique local, AWS's fd00:ec2::254),
# fe80::/10, fec0::/10, ff00::/8, 100::/64, ::/96, 64:ff9b::/96 and 64:ff9b:1::/48
# (NAT64) and ::ffff:0:0/96 (IPv4-mapped, refused whatever it wraps).


def parse_address(text: str) -> IPv4Address | IPv6Address | None:
    """The address `text` spells, or None (also for text with a scope id)."""
    text = text.strip()
    if "%" in text:
        return None
    try:
        return ipaddress.ip_address(text)
    except ValueError:
        return None


def is_public(address: IPv4Address | IPv6Address) -> bool:
    """Whether a page may be fetched from this address."""
    if isinstance(address, IPv4Address):
        return address.is_global and not any(address in net for net in _IPV4_REFUSED)
    return (
        address.ipv4_mapped is None
        and address in _IPV6_ALLOWED
        and not any(address in net for net in _IPV6_REFUSED_INSIDE_2000)
        and address.is_global
    )


def is_public_text(text: str) -> bool:
    address = parse_address(text)
    return address is not None and is_public(address)
