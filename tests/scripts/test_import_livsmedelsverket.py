import copy
import gzip
import http.server
import importlib.util
import json
import os
import threading
import urllib.parse
from decimal import Decimal
from pathlib import Path

import pytest

from server import units

ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "scripts" / "import_livsmedelsverket.py"
FIXTURE = Path(__file__).parent / "fixtures" / "livsmedelsverket" / "responses.json"

spec = importlib.util.spec_from_file_location("import_livsmedelsverket", SCRIPT)
iv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(iv)

MICRO = "µg"  # the catalogue spelling, U+00B5
GREEK = "μg"  # Greek mu, U+03BC


def build(fetcher=None, **kw):
    kw.setdefault("version", "2026-11-08")
    kw.setdefault("min_foods", 0)
    kw.setdefault("workers", 1)
    kw.setdefault("page_size", 2)
    kw.setdefault("log", lambda *_: None)
    data, report = iv.build_data_file(fetcher or iv.ReplayFetcher(FIXTURE), **kw)
    return data


def fixture_responses():
    return iv.ReplayFetcher(FIXTURE).responses


def without_group_entries(responses):
    out = copy.deepcopy(responses)
    for key, body in out.items():
        if key.endswith("/klassificeringar?sprak=1"):
            body[:] = [e for e in body if e["typ"] != "Livsmedelsgrupp"]
    return out


def column(data, key):
    return next(c for c in data["columns"] if c["key"] == key)


def food(data, key):
    return next(f for f in data["foods"] if f["key"] == key)


# ---------------------------------------------------------------- file shape


def test_file_shape_on_the_fixture():
    data = build()
    assert list(data) == ["key", "name", "version", "licence", "attribution", "columns", "foods"]
    assert data["key"] == "livsmedelsverket"
    assert data["name"] == "Livsmedelsverket"
    assert data["version"] == "2026-11-08"
    assert data["licence"] == "CC BY 4.0"
    assert data["attribution"] == iv.SOURCE["attribution"]
    assert "Livsmedelsverket" in data["attribution"]
    assert [f["key"] for f in data["foods"]] == ["1", "2", "10"]
    keys = [c["key"] for c in data["columns"]]
    assert keys == sorted(keys)
    for c in data["columns"]:
        assert set(c) == {"key", "name", "unit"}
    for f in data["foods"]:
        assert isinstance(f["key"], str) and f["name"]
        assert all(isinstance(g, str) for g in f["groups"])
        assert list(f["values"]) == sorted(f["values"])
        for k, v in f["values"].items():
            assert k in keys
            assert isinstance(v, str)


# ------------------------------------------------------------ decimal strings


def test_values_are_decimal_strings():
    data = build()
    assert food(data, "1")["values"]["PROT"] == "13.5"
    assert food(data, "1")["values"]["VITD"] == "1.5"
    assert food(data, "1")["values"]["ENERC:kJ"] == "1500"
    assert food(data, "10")["values"]["VITD"] == "0.1"
    for f in data["foods"]:
        for v in f["values"].values():
            assert not {"e", "E"} & set(v) and "inf" not in v.lower()


def test_no_float_noise():
    assert iv.decimal_string(Decimal("0.3")) == "0.3"
    parsed = json.loads('{"v": 0.3}', parse_float=Decimal)["v"]
    assert iv.decimal_string(parsed) == "0.3"
    assert "0.30000000000000004" not in iv.decimal_string(0.1 + 0.2)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("13.50", "13.5"), (Decimal("13.50"), "13.5"), (0, "0"), ("0,0", "0"), ("0.0", "0"),
        (Decimal("1E+3"), "1000"), (Decimal("1E-7"), "0"), ("1 234,5", "1234.5"), (7, "7"),
        (None, None), ("", None), ("  ", None), ("spår", None), ("<0.1", None), (True, None),
        ("NaN", None), ("Infinity", None), (Decimal("NaN"), None),
    ],
)
def test_decimal_string(raw, expected):
    assert iv.decimal_string(raw) == expected


@pytest.mark.parametrize(
    "vikt, expected",
    [(50, "20"), (100, "10"), ("100", "10"), (Decimal("100.0"), "10"), (200, "5"),
     (0, None), ("x", None), (None, "10"), (True, None)],
)
def test_decimal_string_scales_to_per_100_g(vikt, expected):
    assert iv.decimal_string(10, vikt) == expected


def test_scaled_values_are_rounded_to_six_decimals():
    assert iv.decimal_string(1, 3) == "33.333333"


# -------------------------------------------------------- missing is not zero


def test_missing_is_not_zero():
    messages = []
    data, report = iv.build_data_file(
        iv.ReplayFetcher(FIXTURE), version="v", min_foods=0, workers=1, page_size=2,
        log=messages.append,
    )
    assert "FE" not in food(data, "2")["values"]
    assert food(data, "1")["values"]["FE"] == "4.2"
    assert report.skipped_missing == 1
    assert report.skipped_non_numeric == 0
    assert messages  # the report is printed through log


def test_non_numeric_values_are_counted_with_examples():
    responses = fixture_responses()
    responses["/livsmedel/1/naringsvarden?sprak=1"].append(
        {"euroFIRkod": "FIBTG", "namn": "Fibre", "enhet": "g", "varde": "spår", "viktGram": 100}
    )
    data, report = iv.build_data_file(
        iv.ReplayFetcher(responses), version="v", min_foods=0, workers=1, page_size=2,
        log=lambda *_: None,
    )
    assert report.skipped_non_numeric == 1
    assert "spår" in report.skipped_examples[0]
    assert "FIBTG" not in food(data, "1")["values"]


# ------------------------------------------------------- unit normalisation


def test_units_are_normalised_through_the_catalogue():
    data = build()
    assert column(data, "VITD")["unit"] == MICRO
    assert column(data, "VITB12")["unit"] == MICRO
    assert column(data, "CO2E")["unit"] == "kg CO2e"
    assert column(data, "PROT")["unit"] == "g"
    assert column(data, "FE")["unit"] == "mg"
    assert column(data, "ENERC:kJ")["unit"] == "kJ"
    assert column(data, "ENERC:kcal")["unit"] == "kcal"


def test_three_micro_spellings_make_one_column():
    responses = fixture_responses()
    spellings = {
        entry["enhet"]
        for key, body in responses.items()
        if key.endswith("/naringsvarden?sprak=1")
        for entry in (body["naringsvarden"] if isinstance(body, dict) else body)
        if entry["euroFIRkod"] == "VITD"
    }
    assert spellings == {MICRO, GREEK, "ug"}
    data = build()
    assert [c["key"] for c in data["columns"]].count("VITD") == 1
    assert not any(c["key"].startswith("VITD:") for c in data["columns"])


def test_the_script_has_no_unit_table_of_its_own():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "from server.units import normalise" in source or "units.normalise" in source
    responses = fixture_responses()
    responses["/livsmedel/1/naringsvarden?sprak=1"].append(
        {"euroFIRkod": "X1", "namn": "Odd", "enhet": "Mikrog", "varde": 2, "viktGram": 100}
    )
    data = build(iv.ReplayFetcher(responses))
    assert column(data, "X1")["unit"] == units.normalise("Mikrog") == MICRO


# ------------------------------------------------------------------- columns


def test_energy_columns_are_split_by_unit():
    data = build()
    keys = [c["key"] for c in data["columns"]]
    assert "ENERC" not in keys and "PROT" in keys
    assert column(data, "ENERC:kJ")["name"] == "Energi (kJ)"
    assert column(data, "ENERC:kcal")["name"] == "Energi (kcal)"
    assert column(data, "PROT")["name"] == "Protein"
    assert food(data, "2")["values"]["ENERC:kcal"] == "215"


def test_a_name_that_already_has_the_unit_is_not_extended():
    responses = fixture_responses()
    for key in ("/livsmedel/1/naringsvarden?sprak=1",):
        for entry in responses[key]:
            if entry["euroFIRkod"] == "ENERC":
                entry["namn"] = f"Energi ({entry['enhet']})"
    data = build(iv.ReplayFetcher(responses))
    names = {c["key"]: c["name"] for c in data["columns"]}
    assert names["ENERC:kJ"] == "Energi (kJ)"
    assert names["ENERC:kcal"] == "Energi (kcal)"


def test_a_nutrient_without_a_code_is_keyed_by_its_name():
    payload = [{"namn": "Salt", "enhet": "g", "varde": 1, "viktGram": 100}]
    raw = iv.read_values(payload)
    assert raw[0].code == "" and raw[0].name == "Salt"
    responses = fixture_responses()
    responses["/livsmedel/1/naringsvarden?sprak=1"].append(payload[0])
    data = build(iv.ReplayFetcher(responses))
    assert column(data, "Salt")["name"] == "Salt"
    assert food(data, "1")["values"]["Salt"] == "1"


# -------------------------------------------------------------------- groups


def test_groups_on_the_fixture():
    data = build()
    assert food(data, "1")["groups"] == ["TEST Grains"]
    assert food(data, "2")["groups"] == ["TEST Fish and shellfish"]
    assert food(data, "10")["groups"] == []


def test_extract_groups():
    entries = [
        {"typ": "LanguaL", "namn": "L"},
        {"typ": "Livsmedelsgrupper", "namn": "First"},
        {"typ": "livsmedelsgrupp", "namn": "Second"},
    ]
    assert iv.extract_groups(entries) == ["First"]
    assert iv.extract_groups([{"Typ": "FOOD GROUP", "Namn": "G"}]) == ["G"]
    assert iv.extract_groups(entries, group_types=("LanguaL",)) == ["L"]
    assert iv.extract_groups([{"typ": "LanguaL", "namn": "L"}]) == []
    assert iv.extract_groups([]) == []
    assert iv.extract_groups(None) == []
    assert iv.extract_groups("nonsense") == []
    assert iv.extract_groups([1, None, "x", {"typ": "Livsmedelsgrupp"}]) == []
    assert iv.extract_groups(
        [{"typ": "Livsmedelsgrupp", "namn": ""}, {"typ": "Livsmedelsgrupp", "namn": "Next"}]
    ) == ["Next"]
    assert iv.extract_groups([{"klassificeringstyp": "Matgrupp", "benamning": "B"}]) == ["B"]


def test_no_group_at_all_fails_and_names_the_types_seen():
    fetcher = iv.ReplayFetcher(without_group_entries(fixture_responses()))
    with pytest.raises(iv.ImportError_) as err:
        build(fetcher)
    message = str(err.value)
    assert "LanguaL" in message and "FoodEx2" in message and "--group-type" in message


def test_no_group_is_allowed_on_request():
    fetcher = iv.ReplayFetcher(without_group_entries(fixture_responses()))
    data = build(fetcher, allow_no_groups=True)
    assert all(f["groups"] == [] for f in data["foods"])


def test_group_type_picks_another_classification():
    fetcher = iv.ReplayFetcher(without_group_entries(fixture_responses()))
    data = build(fetcher, group_types=("LanguaL",))
    assert food(data, "1")["groups"] == ["TEST CEREAL GRAIN"]
    assert food(data, "2")["groups"] == []


# ---------------------------------------------------------- reader tolerance

FOODS = [{"nummer": 1, "namn": "A"}, {"nummer": "2", "namn": "B"}]


@pytest.mark.parametrize(
    "payload",
    [
        FOODS,
        {"livsmedel": FOODS},
        {"items": FOODS},
        {"Data": FOODS},
        [{"Nummer": 1, "Namn": "A"}, {"LivsmedelsNummer": "2", "livsmedelsNamn": "B"}],
        [{"id": 1, "namn": "A"}, {"livsmedelsnummer": 2, "namn": "B"}],
    ],
)
def test_read_foods_accepts_several_shapes(payload):
    assert iv.read_foods(payload) == [("1", "A"), ("2", "B")]


def test_read_foods_skips_incomplete_entries():
    assert iv.read_foods([{"nummer": 1}, {"namn": "x"}, "junk", {"nummer": 3, "namn": "C"}]) == [("3", "C")]


def test_read_foods_names_the_keys_it_saw():
    with pytest.raises(iv.ImportError_) as err:
        iv.read_foods({"wat": 1, "other": "x"})
    assert "wat" in str(err.value) and "other" in str(err.value)
    with pytest.raises(iv.ImportError_):
        iv.read_foods("text")


@pytest.mark.parametrize("code_field", ["euroFIRkod", "euroFirKod", "EuroFIRKod", "kod"])
def test_read_values_accepts_code_spellings(code_field):
    entry = {code_field: "PROT", "namn": "Protein", "enhet": "g", "varde": 3, "viktGram": 100}
    for payload in ([entry], {"naringsvarden": [entry]}):
        (value,) = iv.read_values(payload)
        assert (value.code, value.name, value.unit, value.value, value.vikt_gram) == (
            "PROT", "Protein", "g", 3, 100)


def test_read_values_other_spellings_and_shape_errors():
    (value,) = iv.read_values([{"benamning": "Fat", "enhet": " g ", "värde": "2,5"}])
    assert (value.code, value.name, value.unit, value.value, value.vikt_gram) == ("", "Fat", "g", "2,5", None)
    with pytest.raises(iv.ImportError_) as err:
        iv.read_values({"nothing": 1})
    assert "nothing" in str(err.value)


def test_read_classifications():
    assert iv.read_classifications([{"typ": "a"}, "junk"]) == [{"typ": "a"}]
    assert iv.read_classifications({"klassificeringar": [{"typ": "a"}]}) == [{"typ": "a"}]
    with pytest.raises(iv.ImportError_):
        iv.read_classifications({"x": 1})


def test_page_total():
    assert iv.page_total({"_meta": {"totalRecords": 7}}) == 7
    assert iv.page_total({"totalRecords": 8}) == 8
    assert iv.page_total({"total": "9"}) == 9
    assert iv.page_total({"totalCount": Decimal(10)}) == 10
    assert iv.page_total({"livsmedel": []}) is None
    assert iv.page_total([]) is None
    assert iv.page_total({"total": "many"}) is None


# -------------------------------------------------------------------- paging


class FakeFetcher:
    """Serves ALL foods in pages as asked, with options to misbehave."""

    ALL = [{"nummer": i, "namn": f"F{i}"} for i in range(1, 6)]

    def __init__(self, *, total=False, cap=None, ignore_offset=False, repeat_last=False):
        self.total, self.cap, self.ignore_offset, self.repeat_last = total, cap, ignore_offset, repeat_last
        self.calls = []

    def get(self, path, params):
        assert path == "/livsmedel"
        self.calls.append(dict(params))
        offset = 0 if self.ignore_offset else int(params["offset"])
        limit = int(params["limit"])
        if self.cap:
            limit = min(limit, self.cap)
        page = self.ALL[offset:offset + limit]
        if self.repeat_last and offset > 0:
            page = self.ALL[max(offset - 1, 0):offset + limit]
        body = {"livsmedel": page}
        if self.total:
            body["_meta"] = {"totalRecords": len(self.ALL)}
        return body


@pytest.mark.parametrize("size", [2, 5, 100])
def test_paging_reaches_all_foods(size):
    for total in (True, False):
        foods = iv.fetch_food_list(FakeFetcher(total=total), language=1, page_size=size)
        assert [k for k, _ in foods] == ["1", "2", "3", "4", "5"]


def test_paging_stops_on_a_reported_total():
    fetcher = FakeFetcher(total=True)
    iv.fetch_food_list(fetcher, language=1, page_size=5)
    assert len(fetcher.calls) == 1
    fetcher = FakeFetcher(total=True)
    iv.fetch_food_list(fetcher, language=1, page_size=2)
    assert [c["offset"] for c in fetcher.calls] == [0, 2, 4]
    assert all(c["sprak"] == 1 and c["limit"] == 2 for c in fetcher.calls)


def test_paging_stops_on_an_empty_page_without_a_total():
    fetcher = FakeFetcher()
    iv.fetch_food_list(fetcher, language=1, page_size=5)
    assert [c["offset"] for c in fetcher.calls] == [0, 5]


def test_paging_ends_when_the_server_ignores_offset():
    fetcher = FakeFetcher(ignore_offset=True)
    foods = iv.fetch_food_list(fetcher, language=1, page_size=2)
    assert [k for k, _ in foods] == ["1", "2"]
    assert len(fetcher.calls) == 2


def test_a_short_page_is_not_the_end():
    fetcher = FakeFetcher(cap=2)
    foods = iv.fetch_food_list(fetcher, language=1, page_size=100)
    assert len(foods) == 5


def test_a_food_repeated_across_pages_is_kept_once():
    foods = iv.fetch_food_list(FakeFetcher(repeat_last=True), language=1, page_size=2)
    assert [k for k, _ in foods] == ["1", "2", "3", "4", "5"]


def test_limit_foods_stops_the_list_early():
    fetcher = FakeFetcher()
    foods = iv.fetch_food_list(fetcher, language=1, page_size=2, limit_foods=3)
    assert len(foods) == 3
    assert len(fetcher.calls) == 2


# ------------------------------------------------------------- failure paths


class Boom(iv.ReplayFetcher):
    def get(self, path, params):
        if path == "/livsmedel/2/naringsvarden":
            raise iv.ImportError_("HTTP 500 for " + path)
        return super().get(path, params)


@pytest.mark.parametrize("workers", [1, 4])
def test_a_failing_request_propagates(workers):
    with pytest.raises(iv.ImportError_, match="HTTP 500"):
        build(Boom(FIXTURE), workers=workers)


def test_too_few_foods_fails():
    with pytest.raises(iv.ImportError_, match=r"\b3 foods\b"):
        build(min_foods=1000)


def test_no_values_at_all_fails():
    responses = fixture_responses()
    for key in list(responses):
        if key.endswith("/naringsvarden?sprak=1"):
            responses[key] = []
    with pytest.raises(iv.ImportError_, match="nutrient values"):
        build(iv.ReplayFetcher(responses))


def test_replay_of_an_unrecorded_request_names_the_key():
    fetcher = iv.ReplayFetcher(FIXTURE)
    with pytest.raises(iv.ImportError_, match=r"no recorded response for /livsmedel\?limit=2&offset=4&sprak=1"):
        fetcher.get("/livsmedel", {"sprak": 1, "offset": 4, "limit": 2})


def test_request_key_sorts_the_query_and_omits_an_empty_one():
    assert iv.request_key("/livsmedel", {"sprak": 1, "offset": 0, "limit": 2}) == "/livsmedel?limit=2&offset=0&sprak=1"
    assert iv.request_key("/x", {}) == "/x"


def test_an_unrecognised_list_shape_stops_the_build():
    responses = fixture_responses()
    responses["/livsmedel?limit=2&offset=0&sprak=1"] = {"surprise": 1}
    with pytest.raises(iv.ImportError_, match="surprise"):
        build(iv.ReplayFetcher(responses))


# --------------------------------------------------------------- determinism


def test_workers_do_not_change_the_result():
    assert build(workers=4) == build(workers=1)


def test_the_same_input_gives_the_same_bytes(tmp_path):
    a, b = tmp_path / "a.json.gz", tmp_path / "b.json.gz"
    iv.write_data_file(a, build())
    iv.write_data_file(b, build(workers=4))
    assert a.read_bytes() == b.read_bytes()


# ----------------------------------------------------------- write_data_file


def test_write_data_file(tmp_path):
    data = build()
    path = tmp_path / "deep" / "dir" / "lv.json.gz"
    iv.write_data_file(path, data)
    raw = path.read_bytes()
    assert raw[:2] == b"\x1f\x8b"
    assert raw[4:8] == b"\x00\x00\x00\x00"  # mtime 0
    assert raw[3] == 0  # no file name in the header
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        text = fh.read()
    assert json.loads(text) == data
    assert MICRO in text and "\\u00b5" not in text
    assert '": "' not in text and '","' in text  # compact separators
    assert [p.name for p in path.parent.iterdir()] == ["lv.json.gz"]


def test_a_failed_write_leaves_nothing_and_keeps_the_old_file(tmp_path, monkeypatch):
    path = tmp_path / "lv.json.gz"
    path.write_bytes(b"old")

    def broken(*_a, **_k):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", broken)
    with pytest.raises(OSError):
        iv.write_data_file(path, build())
    assert path.read_bytes() == b"old"
    assert list(tmp_path.iterdir()) == [path]


def test_a_failure_while_compressing_leaves_no_tmp_file(tmp_path, monkeypatch):
    path = tmp_path / "lv.json.gz"

    def broken(*_a, **_k):
        raise OSError("boom")

    monkeypatch.setattr(iv.gzip, "GzipFile", broken)
    with pytest.raises(OSError):
        iv.write_data_file(path, build())
    assert list(tmp_path.iterdir()) == []


# ----------------------------------------------------------- RecordingFetcher


def test_record_and_replay_round_trip(tmp_path):
    recorder = iv.RecordingFetcher(iv.ReplayFetcher(FIXTURE))
    first = build(recorder, workers=4)
    saved = tmp_path / "rec.json"
    recorder.save(saved)
    assert build(iv.ReplayFetcher(saved)) == first
    # numbers are written back unchanged, not through a float
    text = saved.read_text(encoding="utf-8")
    assert '"varde": 13.5' in text or '"varde":13.5' in text
    assert json.loads(text, parse_float=Decimal)["/livsmedel/1/naringsvarden?sprak=1"][2]["varde"] == Decimal("13.5")


# --------------------------------------------------------------- command line

FIXTURE_ARGS = ["--replay", str(FIXTURE), "--min-foods", "0", "--page-size", "2", "--version", "2026-11-08"]


def read_file(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def test_main_replay_writes_the_file(tmp_path, capsys):
    out = tmp_path / "x.json.gz"
    assert iv.main([*FIXTURE_ARGS, "--out", str(out)]) == 0
    assert read_file(out) == build()
    shown = capsys.readouterr()
    text = shown.out + shown.err
    assert "foods: 3" in text and "LanguaL" in text and "FoodEx2" in text and str(out) in text


def test_limit_foods_needs_an_explicit_out(tmp_path, capsys):
    default = iv.ROOT / "server" / "data_sources" / "livsmedelsverket.json.gz"
    before = default.exists()
    assert iv.main([*FIXTURE_ARGS, "--limit-foods", "2"]) == 2
    assert "--out" in capsys.readouterr().err
    assert default.exists() == before
    out = tmp_path / "t.json.gz"
    assert iv.main([*FIXTURE_ARGS, "--limit-foods", "2", "--out", str(out)]) == 0
    assert [f["key"] for f in read_file(out)["foods"]] == ["1", "2"]


def test_default_min_foods_refuses_and_writes_nothing(tmp_path, capsys):
    out = tmp_path / "x.json.gz"
    args = [a for a in FIXTURE_ARGS if a not in ("--min-foods", "0")]
    assert iv.main([*args, "--out", str(out)]) == 1
    assert "3 foods" in capsys.readouterr().err
    assert not out.exists() and list(tmp_path.iterdir()) == []


def test_replay_and_base_url_exclude_each_other(tmp_path):
    assert iv.main([*FIXTURE_ARGS, "--base-url", "http://127.0.0.1:1", "--out", str(tmp_path / "x")]) == 2


def test_help_works(capsys):
    assert iv.main(["--help"]) == 0
    assert "--limit-foods" in capsys.readouterr().out


def test_main_record_round_trip(tmp_path):
    rec, out1, out2 = tmp_path / "rec.json", tmp_path / "1.json.gz", tmp_path / "2.json.gz"
    assert iv.main([*FIXTURE_ARGS, "--out", str(out1), "--record", str(rec)]) == 0
    replay = ["--replay", str(rec)] + FIXTURE_ARGS[2:]
    assert iv.main([*replay, "--out", str(out2)]) == 0
    assert out1.read_bytes() == out2.read_bytes()


def test_group_flags_are_passed_through(tmp_path):
    stripped = tmp_path / "stripped.json"
    stripped.write_text(json.dumps(without_group_entries(json.loads(FIXTURE.read_text(encoding="utf-8")))),
                        encoding="utf-8")
    args = ["--replay", str(stripped)] + FIXTURE_ARGS[2:]
    out = tmp_path / "o.json.gz"
    assert iv.main([*args, "--out", str(out)]) == 1
    assert not out.exists()
    assert iv.main([*args, "--out", str(out), "--allow-no-groups"]) == 0
    assert all(f["groups"] == [] for f in read_file(out)["foods"])
    assert iv.main([*args, "--out", str(out), "--group-type", "LanguaL"]) == 0
    assert read_file(out)["foods"][0]["groups"] == ["TEST CEREAL GRAIN"]


def test_the_default_output_is_the_committed_path():
    source = SCRIPT.read_text(encoding="utf-8")
    assert '"server" / "data_sources" / "livsmedelsverket.json.gz"' in source


# ---------------------------------------------------------------- HttpFetcher

class Stub:
    """A local HTTP server answering from the fixture, with scripted failures."""

    def __init__(self, statuses=(), headers=None):
        self.requests = []
        self.statuses = list(statuses)  # consumed one per request; empty = serve normally
        self.forever = None
        self.headers = headers or {}
        replay = iv.ReplayFetcher(FIXTURE)
        stub = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                parts = urllib.parse.urlsplit(self.path)
                params = dict(urllib.parse.parse_qsl(parts.query))
                stub.requests.append((parts.path, params, dict(self.headers)))
                status = stub.forever or (stub.statuses.pop(0) if stub.statuses else 200)
                body = b""
                if status == 200:
                    try:
                        body = iv._dump(replay.get(parts.path.removeprefix("/api"), params)).encode("utf-8")
                    except iv.ImportError_:
                        status = 404
                self.send_response(status)
                for k, v in stub.headers.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/api"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()


def test_a_build_through_http_equals_the_replay_build():
    with Stub() as stub:
        fetcher = iv.HttpFetcher(stub.url, sleep=lambda _: None)
        assert build(fetcher, workers=4) == build()
        paths = {p for p, _, _ in stub.requests}
        assert "/api/livsmedel" in paths and "/api/livsmedel/1/naringsvarden" in paths


def test_the_request_carries_the_query_and_the_user_agent():
    with Stub() as stub:
        iv.HttpFetcher(stub.url).get("/livsmedel", {"limit": 2, "offset": 0, "sprak": 1})
        (path, params, headers), = stub.requests
    assert params == {"limit": "2", "offset": "0", "sprak": "1"}
    assert headers["User-Agent"] == "food-opti-planner data import (manual run)"
    assert headers["Accept"] == "application/json"


def test_http_retries_then_succeeds():
    sleeps = []
    with Stub(statuses=[503, 503]) as stub:
        body = iv.HttpFetcher(stub.url, sleep=sleeps.append).get("/livsmedel", {"limit": 2, "offset": 0, "sprak": 1})
        assert len(stub.requests) == 3
    assert sleeps == [1, 2]
    assert iv.read_foods(body)[0] == ("1", "TEST Oat flakes")


def test_http_gives_up_after_four_requests():
    sleeps = []
    with Stub() as stub:
        stub.forever = 503
        with pytest.raises(iv.ImportError_, match="HTTP 503"):
            iv.HttpFetcher(stub.url, sleep=sleeps.append).get("/livsmedel", {"limit": 2})
        assert len(stub.requests) == 4
    assert sleeps == [1, 2, 4]


def test_http_404_is_not_retried():
    sleeps = []
    with Stub() as stub:
        with pytest.raises(iv.ImportError_, match="HTTP 404"):
            iv.HttpFetcher(stub.url, sleep=sleeps.append).get("/livsmedel/999/naringsvarden", {"sprak": 1})
        assert len(stub.requests) == 1
    assert sleeps == []


def test_retry_after_is_honoured():
    sleeps = []
    with Stub(statuses=[429], headers={"Retry-After": "3"}) as stub:
        iv.HttpFetcher(stub.url, sleep=sleeps.append).get("/livsmedel", {"limit": 2, "offset": 0, "sprak": 1})
    assert sleeps == [3]


def test_a_long_retry_after_is_ignored():
    sleeps = []
    with Stub(statuses=[429], headers={"Retry-After": "600"}) as stub:
        iv.HttpFetcher(stub.url, sleep=sleeps.append).get("/livsmedel", {"limit": 2, "offset": 0, "sprak": 1})
    assert sleeps == [1]


def test_a_refused_connection_is_retried_then_reported():
    with Stub() as stub:
        url = stub.url
    sleeps = []
    with pytest.raises(iv.ImportError_, match="after 4 tries"):
        iv.HttpFetcher(url, sleep=sleeps.append, timeout=1).get("/livsmedel", {})
    assert sleeps == [1, 2, 4]
