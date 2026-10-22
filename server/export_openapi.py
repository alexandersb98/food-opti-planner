"""Write the API's OpenAPI description, from which web/src/api/schema.ts is made.

Usage: python -m server.export_openapi web/openapi.json
"""

import json
import sys
from pathlib import Path

from .app import create_app
from .settings import Settings


def openapi_json() -> str:
    app = create_app(Settings(migrate_on_startup=False, web_dist=Path("/nonexistent")))
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    Path(sys.argv[1]).write_text(openapi_json())
