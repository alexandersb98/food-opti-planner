from decimal import Decimal

from meal_planner.scaling import INT64_MAX, fits_int64, from_int, to_decimal, to_int


def test_to_int_scales_by_precision():
    assert to_int(1.5, 3) == 1500
    assert to_int(2, 0) == 2
    assert to_int("0.125", 3) == 125


def test_float_is_read_as_its_decimal_text():
    assert to_int(0.1, 1) == 1
    assert to_decimal(0.1) == Decimal("0.1")


def test_round_trip_within_precision_is_exact():
    for text in ("0", "1", "12.345", "-7.5", "1000000.001"):
        assert from_int(to_int(text, 3), 3) == Decimal(text)


def test_digits_beyond_precision_round_once_half_up():
    assert to_int("1.2345", 3) == 1235
    assert to_int("1.2344", 3) == 1234
    assert to_int("-1.2345", 3) == -1235
    assert from_int(to_int("1.2345", 3), 3) == Decimal("1.235")


def test_overflow_guard():
    assert fits_int64(INT64_MAX)
    assert fits_int64(-INT64_MAX)
    assert not fits_int64(INT64_MAX + 1)
