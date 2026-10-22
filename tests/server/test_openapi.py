from pathlib import Path

from server.export_openapi import openapi_json

COMMITTED = Path(__file__).resolve().parents[2] / "web" / "openapi.json"


def test_committed_openapi_description_is_up_to_date():
    """Regenerate with: npm --prefix web run gen:api"""
    assert COMMITTED.read_text() == openapi_json()
