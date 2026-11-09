"""Helpers for tests that need a data file: the fake "TEST" source and a
writer that makes the file as D1's script does. Not a test module."""

import gzip
import json
from pathlib import Path


def test_source(**changes) -> dict:
    """The fixture file as a dict; `changes` replace top-level keys."""
    data = {
        "key": "testsource",
        "name": "TEST Source",
        "version": "2026-01-01",
        "attribution": "TEST data, not real: for tests only.",
        "columns": [
            {"key": "PROT", "name": "TEST Protein", "unit": "g"},
            {"key": "ENERC:kcal", "name": "TEST Energy", "unit": "kcal"},
            {"key": "VITD", "name": "TEST Vitamin D", "unit": "µg"},
        ],
        "foods": [
            {
                "key": "1",
                "name": "TEST Oats",
                "groups": ["TEST Grains"],
                "values": {"PROT": "13.5", "ENERC:kcal": "389", "VITD": "0"},
            },
            {
                "key": "2",
                "name": "TEST Milk",
                "groups": ["TEST Dairy"],
                "values": {"PROT": "3.4", "ENERC:kcal": "64"},
            },
            {
                "key": "10",
                "name": "TEST Cheese",
                "groups": ["TEST Dairy"],
                "values": {"PROT": "25", "ENERC:kcal": "402"},
            },
        ],
    }
    return {**data, **changes}


test_source.__test__ = False  # not a pytest test, despite the name


def write(directory: Path, data: dict, name: str = "testsource.json.gz") -> Path:
    """Write `data` as D1 does: compact UTF-8 JSON, gzip with mtime 0."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with path.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as stream:
        stream.write(text.encode("utf-8"))
    return path
