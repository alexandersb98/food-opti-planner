"""Write the body of GET /api/units, the fixture the app's tests build on.

Usage: python -m server.export_units web/src/test-units.json
"""

import json
import sys
from pathlib import Path

from .api.units import unit_catalogue


def units_json() -> str:
    return json.dumps(unit_catalogue().model_dump(mode="json"), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    Path(sys.argv[1]).write_text(units_json(), encoding="utf-8")
