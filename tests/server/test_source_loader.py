import copy
import gzip
import json
import logging
import time
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from server import models
from server.db import migrate
from server.source_loader import DataFileError, load_all, load_file, read_file

from .data_source_files import test_source, write


@pytest.fixture
def engine(database_url):
    migrate(database_url)
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    with Session(engine) as session:
        yield session


def load(db, tmp_path, data, name="testsource.json.gz"):
    return load_file(db, read_file(write(tmp_path, data, name)))


def count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def source_of(db, key="testsource"):
    return db.scalars(select(models.DataSource).where(models.DataSource.key == key)).one()


def foods(db):
    return {f.key: f for f in db.scalars(select(models.SourceFood))}


def columns(db):
    return {c.key: c for c in db.scalars(select(models.SourceColumn))}


def value(db, food_key, column_key):
    return db.scalar(
        select(models.SourceFoodValue.value).where(
            models.SourceFoodValue.food_id == foods(db)[food_key].id,
            models.SourceFoodValue.column_id == columns(db)[column_key].id,
        )
    )


def tag_names_of(db, food_key):
    rows = db.scalars(
        select(models.Tag.name)
        .join(models.source_food_tags, models.source_food_tags.c.tag_id == models.Tag.id)
        .where(models.source_food_tags.c.food_id == foods(db)[food_key].id)
        .order_by(models.Tag.name)
    )
    return list(rows)


def test_the_first_load_makes_the_copy(db, tmp_path):
    assert load(db, tmp_path, test_source()) is True

    source = source_of(db)
    assert (source.name, source.version) == ("TEST Source", "2026-01-01")
    assert source.attribution == "TEST data, not real: for tests only."
    assert source.imported_at is not None
    assert len(source.colour) == 7 and source.colour.startswith("#")
    assert {k: (c.name, c.unit) for k, c in columns(db).items()} == {
        "PROT": ("TEST Protein", "g"),
        "ENERC:kcal": ("TEST Energy", "kcal"),
        "VITD": ("TEST Vitamin D", "µg"),
    }
    assert {k: f.name for k, f in foods(db).items()} == {
        "1": "TEST Oats",
        "2": "TEST Milk",
        "10": "TEST Cheese",
    }
    assert value(db, "1", "PROT") == Decimal("13.5")
    assert value(db, "1", "VITD") == Decimal("0")
    assert value(db, "2", "VITD") is None  # missing is not 0
    assert count(db, models.SourceFoodValue) == 7
    tags = {t.name: t for t in db.scalars(select(models.Tag))}
    assert set(tags) == {"TEST Grains", "TEST Dairy"}
    assert all(t.source_id == source.id and t.derive == "any" for t in tags.values())
    assert tag_names_of(db, "2") == tag_names_of(db, "10") == ["TEST Dairy"]
    assert tag_names_of(db, "1") == ["TEST Grains"]


def test_the_same_version_loads_nothing(db, tmp_path):
    load(db, tmp_path, test_source())
    imported_at = source_of(db).imported_at
    changed = test_source()
    changed["foods"][0]["values"]["PROT"] = "99"

    assert load(db, tmp_path, changed) is False

    assert value(db, "1", "PROT") == Decimal("13.5")
    assert source_of(db).imported_at == imported_at


def version_2():
    data = test_source(version="2026-02-01")
    data["foods"][0]["name"] = "TEST Rolled Oats"
    data["foods"][0]["values"]["PROT"] = "14"
    data["foods"] = [f for f in data["foods"] if f["key"] != "10"]
    data["foods"].append(
        {"key": "3", "name": "TEST Rye", "groups": ["TEST Grains"], "values": {"FIBTG": "15"}}
    )
    data["columns"] = [c for c in data["columns"] if c["key"] != "VITD"]
    data["columns"].append({"key": "FIBTG", "name": "TEST Fibre", "unit": "g"})
    for food in data["foods"]:
        food["values"].pop("VITD", None)
    return data


def test_a_new_version_adds_updates_and_withdraws(db, tmp_path):
    load(db, tmp_path, test_source())
    food_ids = {k: f.id for k, f in foods(db).items()}
    column_ids = {k: c.id for k, c in columns(db).items()}
    first_imported_at = source_of(db).imported_at
    time.sleep(0.01)

    assert load(db, tmp_path, version_2()) is True
    db.expire_all()

    assert {k: f.id for k, f in foods(db).items() if k in food_ids} == food_ids
    assert {k: c.id for k, c in columns(db).items() if k in column_ids} == column_ids
    assert foods(db)["1"].name == "TEST Rolled Oats"
    assert value(db, "1", "PROT") == Decimal("14")
    assert foods(db)["3"].withdrawn is False and value(db, "3", "FIBTG") == Decimal("15")
    assert columns(db)["FIBTG"].withdrawn is False
    assert foods(db)["10"].withdrawn is True
    assert columns(db)["VITD"].withdrawn is True
    # a withdrawn food keeps its values and tags; a withdrawn column its values
    assert value(db, "10", "PROT") == Decimal("25")
    assert tag_names_of(db, "10") == ["TEST Dairy"]
    assert value(db, "1", "VITD") is None  # food 1 is in the file: its values were replaced
    source = source_of(db)
    assert source.version == "2026-02-01" and source.imported_at > first_imported_at


def test_a_withdrawn_food_and_column_come_back(db, tmp_path):
    load(db, tmp_path, test_source())
    ids = {k: f.id for k, f in foods(db).items()}
    column_ids = {k: c.id for k, c in columns(db).items()}
    load(db, tmp_path, version_2())
    back = test_source(version="2026-03-01")
    back["foods"][2]["values"]["PROT"] = "26"

    load(db, tmp_path, back)
    db.expire_all()

    assert foods(db)["10"].withdrawn is False and columns(db)["VITD"].withdrawn is False
    assert foods(db)["10"].id == ids["10"] and columns(db)["VITD"].id == column_ids["VITD"]
    assert value(db, "10", "PROT") == Decimal("26")
    assert value(db, "1", "VITD") == Decimal("0")
    assert foods(db)["3"].withdrawn is True


def map_columns(db, **by_key):
    """Map columns (by key) to new attributes given as key -> (name, unit)."""
    for key, (name, unit) in by_key.items():
        attribute = models.Attribute(name=name, unit=unit, decimals=1)
        db.add(attribute)
        db.flush()
        columns(db)[key].attribute_id = attribute.id
    db.commit()


def mapped(db):
    db.expire_all()
    return {k: c.attribute_id is not None for k, c in columns(db).items()}


def test_a_new_file_clears_a_mapping_that_no_longer_converts(db, tmp_path, caplog):
    load(db, tmp_path, test_source())
    map_columns(db, PROT=("Protein", "g"), **{"ENERC:kcal": ("Energy", "kcal")})
    data = test_source(version="2026-02-01")
    data["columns"][0]["unit"] = "kcal"  # PROT: g -> kcal, no longer converts
    data["columns"][1]["unit"] = "kJ"  # ENERC: kcal -> kJ, same category

    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        load(db, tmp_path, data)

    assert mapped(db) == {"PROT": False, "ENERC:kcal": True, "VITD": False}
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings == ["column TEST Protein of TEST Source now in kcal; mapping to Protein cleared"]


def test_a_unit_change_within_the_category_keeps_the_mapping(db, tmp_path):
    load(db, tmp_path, test_source())
    map_columns(db, PROT=("Protein", "g"))
    data = test_source(version="2026-02-01")
    data["columns"][0]["unit"] = "mg"

    load(db, tmp_path, data)

    assert mapped(db)["PROT"] is True


def test_a_withdrawn_column_keeps_its_mapping(db, tmp_path):
    load(db, tmp_path, test_source())
    map_columns(db, VITD=("Vitamin D", "µg"))

    load(db, tmp_path, version_2())  # version 2 has no VITD

    assert columns(db)["VITD"].withdrawn is True
    assert mapped(db)["VITD"] is True


def test_a_groups_tag_survives_its_group_leaving(db, tmp_path):
    load(db, tmp_path, test_source())
    dairy = db.scalars(select(models.Tag).where(models.Tag.name == "TEST Dairy")).one().id
    moved = test_source(version="2026-02-01")
    for food in moved["foods"]:
        if food["groups"] == ["TEST Dairy"]:
            food["groups"] = ["TEST Cheeses"]

    load(db, tmp_path, moved)
    db.expire_all()

    tags = {t.name: t for t in db.scalars(select(models.Tag))}
    assert set(tags) == {"TEST Grains", "TEST Dairy", "TEST Cheeses"}
    assert tags["TEST Dairy"].id == dairy
    assert tag_names_of(db, "2") == tag_names_of(db, "10") == ["TEST Cheeses"]


def test_the_colour_is_never_touched_by_a_load_and_sources_differ(db, tmp_path):
    load(db, tmp_path, test_source())
    first = source_of(db)
    first.colour = "#112233"
    db.commit()

    load(db, tmp_path, test_source(version="2026-02-01"))
    db.expire_all()
    assert source_of(db).colour == "#112233"

    other = test_source(key="other", name="TEST Other")
    load(db, tmp_path, other, "other.json.gz")
    assert source_of(db, "other").colour not in ("#112233", None)
    assert source_of(db, "other").colour != source_of(db).colour


def test_a_tag_name_clash_names_the_source_tag_after_its_source(db, tmp_path):
    db.add(models.Tag(name="TEST Grains", derive="all"))
    db.commit()

    load(db, tmp_path, test_source())

    tags = {t.name: t for t in db.scalars(select(models.Tag))}
    assert set(tags) == {"TEST Grains", "TEST Grains (TEST Source)", "TEST Dairy"}
    assert tags["TEST Grains"].source_id is None and tags["TEST Grains"].derive == "all"
    assert tags["TEST Grains (TEST Source)"].source_id is not None
    assert tag_names_of(db, "1") == ["TEST Grains (TEST Source)"]

    load(db, tmp_path, test_source(version="2026-02-01"))
    assert count(db, models.Tag) == 3


def test_a_food_with_several_groups_has_them_all(db, tmp_path):
    data = test_source()
    data["foods"][0]["groups"] = ["A", "B"]

    load(db, tmp_path, data)

    assert tag_names_of(db, "1") == ["A", "B"]


def test_group_and_food_names_are_trimmed(db, tmp_path):
    # The tags PUT trims names, so a source tag must carry the trimmed name.
    data = test_source()
    data["foods"][0]["name"] = "  TEST Oats "
    data["foods"][0]["groups"] = [" TEST Grains ", "TEST Grains", " "]
    data["foods"][1]["groups"] = ["TEST Dairy  "]

    with pytest.raises(DataFileError, match="non-empty"):
        read_file(write(tmp_path, data))
    data["foods"][0]["groups"] = [" TEST Grains ", "TEST Grains"]
    load(db, tmp_path, data)

    assert foods(db)["1"].name == "TEST Oats"
    assert tag_names_of(db, "1") == ["TEST Grains"]
    assert tag_names_of(db, "2") == ["TEST Dairy"]


def test_a_failed_load_changes_nothing_and_load_all_goes_on(db, engine, tmp_path, caplog):
    load(db, tmp_path / "bad", test_source())
    # Both names version 2's new group could get are taken by user tags: only
    # the database work of the load finds that, after it has begun writing.
    db.add(models.Tag(name="TEST New", derive="all"))
    db.add(models.Tag(name="TEST New (TEST Source)", derive="all"))
    db.commit()
    broken = test_source(version="2026-02-01")
    broken["foods"][0]["name"] = "TEST Changed"
    broken["foods"][0]["values"]["PROT"] = "50"
    broken["foods"][0]["groups"] = ["TEST New"]
    write(tmp_path / "bad", broken)
    write(tmp_path / "bad", test_source(key="good", name="TEST Good"), "good.json.gz")

    with pytest.raises(DataFileError, match="TEST New"):
        load_file(db, read_file(tmp_path / "bad" / "testsource.json.gz"))
    db.expire_all()
    assert source_of(db).version == "2026-01-01"
    assert foods(db)["1"].name == "TEST Oats"
    assert value(db, "1", "PROT") == Decimal("13.5")
    assert count(db, models.SourceFoodValue) == 7

    with caplog.at_level(logging.INFO):
        assert load_all(engine, tmp_path / "bad") == ["good"]
    assert any("testsource.json.gz" in r.getMessage() and r.levelno == logging.ERROR for r in caplog.records)
    db.expire_all()
    assert source_of(db).version == "2026-01-01"
    assert source_of(db, "good").version == "2026-01-01"


def write_raw(tmp_path, content: bytes, gzipped=True):
    path = tmp_path / "bad.json.gz"
    path.write_bytes(gzip.compress(content) if gzipped else content)
    return path


def with_change(change):
    data = copy.deepcopy(test_source())
    change(data)
    return data


def set_value(food, column, raw):
    def change(data):
        data["foods"][food]["values"][column] = raw

    return change


def mutated(change):
    """A file made from the fixture with `change` applied to its dict."""
    return lambda directory: write(directory, with_change(change))


REFUSED = [
    ("not gzip", lambda p: write_raw(p, b"hello", gzipped=False), "not a gzip"),
    ("not json", lambda p: write_raw(p, b"{nope"), "not JSON"),
    ("not an object", lambda p: write_raw(p, b"[]"), "JSON object"),
    ("no key", mutated(lambda d: d.pop("key")), "`key`"),
    ("no version", mutated(lambda d: d.pop("version")), "`version`"),
    ("no columns", mutated(lambda d: d.pop("columns")), "`columns`"),
    ("no foods", mutated(lambda d: d.pop("foods")), "`foods`"),
    ("capital in key", mutated(lambda d: d.update(key="Test")), "`key`"),
    ("space in key", mutated(lambda d: d.update(key="test source")), "`key`"),
    ("empty name", mutated(lambda d: d.update(name="")), "`name`"),
    ("duplicate column", mutated(lambda d: d["columns"].append(dict(d["columns"][0]))), "duplicate column"),
    ("duplicate food", mutated(lambda d: d["foods"].append(dict(d["foods"][0]))), "duplicate food"),
    ("unknown column", mutated(set_value(0, "NOPE", "1")), "unknown column 'NOPE'"),
    ("number not string", mutated(set_value(0, "PROT", 13.5)), "not a number"),
    ("integer not string", mutated(set_value(0, "PROT", 13)), "not a number"),
    ("letters", mutated(set_value(0, "PROT", "abc")), "'abc'"),
    ("NaN", mutated(set_value(0, "PROT", "NaN")), "'NaN'"),
    ("exponent", mutated(set_value(0, "PROT", "1e5")), "'1e5'"),
    ("too many digits", mutated(set_value(0, "PROT", "1234567890")), "too many digits"),
    ("long group", mutated(lambda d: d["foods"][0].update(groups=["x" * 101])), "101 characters"),
    ("long unit", mutated(lambda d: d["columns"][0].update(unit="u" * 21)), "`unit`"),
    ("groups not a list", mutated(lambda d: d["foods"][0].update(groups="TEST")), "`groups`"),
]


@pytest.mark.parametrize(("change", "message"), [r[1:] for r in REFUSED], ids=[r[0] for r in REFUSED])
def test_read_file_refuses_what_is_not_a_data_file(tmp_path, change, message):
    path = change(tmp_path)
    with pytest.raises(DataFileError, match=message) as error:
        read_file(path)
    assert path.name in str(error.value)


def test_a_value_with_eight_decimals_loads_rounded_to_six(db, tmp_path):
    data = test_source()
    data["foods"][0]["values"]["PROT"] = "1.23456750"
    data["foods"][1]["values"]["PROT"] = "-0.0000005"

    load(db, tmp_path, data)

    assert value(db, "1", "PROT") == Decimal("1.234568")
    assert value(db, "2", "PROT") == Decimal("-0.000001")


def test_attribution_defaults_to_the_licence_or_nothing(tmp_path):
    no_attribution = test_source()
    del no_attribution["attribution"]
    assert read_file(write(tmp_path, no_attribution)).attribution is None
    no_attribution["licence"] = "CC BY 4.0"
    assert read_file(write(tmp_path, no_attribution)).attribution == "Licence: CC BY 4.0"
    assert read_file(write(tmp_path, test_source())).attribution.startswith("TEST data")


@pytest.mark.parametrize("make_directory", [False, True])
def test_load_all_with_no_files_logs_one_line(engine, tmp_path, caplog, make_directory):
    directory = tmp_path / "data"
    if make_directory:
        directory.mkdir()

    with caplog.at_level(logging.INFO):
        assert load_all(engine, directory) == []

    with Session(engine) as db:
        assert count(db, models.DataSource) == 0
    messages = [r for r in caplog.records if "no data files" in r.getMessage()]
    assert len(messages) == 1 and messages[0].levelno == logging.INFO


@pytest.mark.benchmark
def test_loading_a_reference_size_file_is_quick_enough(db, tmp_path):
    column_keys = [f"C{i}" for i in range(55)]
    data = test_source(
        columns=[{"key": k, "name": f"TEST {k}", "unit": "g"} for k in column_keys],
        foods=[
            {
                "key": str(i),
                "name": f"TEST Food {i}",
                "groups": [f"TEST Group {i % 100}"],
                "values": {k: f"{i % 97}.{j}" for j, k in enumerate(column_keys)},
            }
            for i in range(2500)
        ],
    )
    started = time.perf_counter()
    assert load(db, tmp_path, data) is True
    first = time.perf_counter() - started
    for food in data["foods"]:
        food["values"] = {k: f"{float(v) + 1:.1f}" for k, v in food["values"].items()}
    data["version"] = "2026-02-01"
    started = time.perf_counter()
    assert load(db, tmp_path, data) is True
    update = time.perf_counter() - started
    print(f"\nfirst load {first:.1f} s, update load {update:.1f} s")
    assert count(db, models.SourceFood) == 2500
    assert count(db, models.SourceFoodValue) == 2500 * 55
    assert count(db, models.Tag) == 100


def test_json_is_what_the_helper_writes(tmp_path):
    path = write(tmp_path, test_source())
    assert json.loads(gzip.decompress(path.read_bytes()))["key"] == "testsource"
    assert path.read_bytes() == write(tmp_path, test_source()).read_bytes()  # deterministic
