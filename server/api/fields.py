"""Field types that request and response models share."""

from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer, StringConstraints, WithJsonSchema

from .. import models

# Trimmed, 1 to 100 characters. Names are compared exactly, as in the library.
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=models.NAME_LENGTH)
]


def _plain(number: Decimal) -> str:
    """As typed, without the zeros the database pads it with: "100", "0.5"."""
    return format(number.normalize() + 0, "f")  # + 0 turns -0 into 0


# A number as typed on a form, stored in a models.EXACT_NUMBER column. Sent
# as a JSON number or string; answered as a string, so it reads back exactly
# as it was entered. The request's schema is spelled out, as Pydantic
# versions describe decimals differently.
Number = Annotated[
    Decimal,
    Field(max_digits=models.VALUE_DIGITS, decimal_places=models.VALUE_DECIMALS),
    PlainSerializer(_plain, return_type=str),
    WithJsonSchema({"anyOf": [{"type": "number"}, {"type": "string"}]}, mode="validation"),
]
