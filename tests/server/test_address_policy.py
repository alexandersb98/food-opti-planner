import ipaddress

import pytest

from server import address_policy
from server.address_policy import is_public, is_public_text, parse_address

REFUSED = """0.0.0.0 0.1.2.3 10.0.0.1 10.255.255.255 100.64.0.1 100.100.100.200 100.127.255.255 127.0.0.1
127.255.255.254 169.254.169.254 169.254.0.1 172.16.0.1 172.31.255.255 192.0.0.1 192.0.0.192 192.0.2.1
192.88.99.1 192.168.0.1 192.168.255.255 198.18.0.1 198.19.255.255 198.51.100.1 203.0.113.1 224.0.0.1
239.255.255.255 240.0.0.1 255.255.255.255 :: ::1 ::127.0.0.1 ::ffff:127.0.0.1 ::ffff:10.0.0.1
::ffff:169.254.169.254 ::ffff:8.8.8.8 ::ffff:7f00:1 64:ff9b::7f00:1 64:ff9b::808:808 64:ff9b:1::1 100::1
2001::1 2001:0:4136:e378:8000:63bf:3fff:fdd2 2001:db8::1 2002:7f00:1::1 2002:808:808::1 3fff::1 fc00::1
fd00:ec2::254 fe80::1 fec0::1 ff02::1 ff00::""".split()

ALLOWED = """8.8.8.8 1.1.1.1 93.184.216.34 100.63.255.255 100.128.0.1 172.15.255.255 172.32.0.1 169.253.255.255
169.255.0.1 192.0.1.1 198.17.255.255 198.20.0.1 223.255.255.255 2606:4700:4700::1111
2a00:1450:4001:81b::200e 2001:4860:4860::8888 2620:fe::fe""".split()


@pytest.mark.parametrize("text", REFUSED)
def test_refused(text):
    assert not is_public_text(text)


@pytest.mark.parametrize("text", ALLOWED)
def test_allowed(text):
    assert is_public_text(text)


@pytest.mark.parametrize("text", ["fe80::1%eth0", "", "localhost", "127.1", "2130706433", "0x7f000001"])
def test_text_that_is_not_an_address_is_refused(text):
    assert parse_address(text) is None
    assert not is_public_text(text)


def test_every_table_edge_is_refused():
    nets = list(address_policy._IPV4_REFUSED) + list(address_policy._IPV6_REFUSED_INSIDE_2000)
    for net in nets:
        assert not is_public(net[0]), net
        assert not is_public(net[-1]), net


def test_ipv6_outside_global_unicast_is_refused():
    assert not is_public(ipaddress.ip_address("1fff:ffff::1"))
    assert not is_public(ipaddress.ip_address("4000::1"))
