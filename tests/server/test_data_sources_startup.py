import logging
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from server import models
from server.source_loader import read_file

from .conftest import logged_in_client
from .data_source_files import test_source, write

FIXTURE = Path(__file__).parent.parent / "data" / "data_sources" / "testsource.json.gz"


def rows(database_url, model):
    engine = create_engine(database_url)
    with Session(engine) as db:
        result = list(db.scalars(select(model)))
    engine.dispose()
    return result


def test_the_app_loads_the_files_of_its_data_directory(data_client, database_url):
    assert [s.key for s in rows(database_url, models.DataSource)] == ["testsource"]
    assert len(rows(database_url, models.SourceColumn)) == 3
    assert len(rows(database_url, models.SourceFood)) == 3


def test_the_app_starts_without_a_data_directory(client, database_url):
    assert client.get("/api/counts").status_code == 200
    assert rows(database_url, models.DataSource) == []


def test_a_broken_file_does_not_stop_the_app(database_url, web_dist, tmp_path, caplog):
    directory = tmp_path / "data"
    directory.mkdir()
    (directory / "broken.json.gz").write_bytes(b"not gzip")

    with caplog.at_level(logging.INFO):
        with logged_in_client(database_url, web_dist, data_sources_dir=directory) as client:
            assert client.get("/api/health").status_code == 200

    assert any("broken.json.gz" in r.getMessage() and r.levelno == logging.ERROR for r in caplog.records)
    assert rows(database_url, models.DataSource) == []


def test_a_restart_loads_a_changed_version_only(database_url, web_dist, tmp_path):
    directory = tmp_path / "data"
    write(directory, test_source())
    with logged_in_client(database_url, web_dist, data_sources_dir=directory):
        pass
    first = rows(database_url, models.DataSource)[0].imported_at

    changed = test_source()
    changed["foods"][0]["name"] = "TEST Same version"
    write(directory, changed)
    with logged_in_client(database_url, web_dist, data_sources_dir=directory):
        pass
    assert rows(database_url, models.DataSource)[0].imported_at == first
    assert "TEST Oats" in [f.name for f in rows(database_url, models.SourceFood)]

    changed["version"] = "2026-02-01"
    write(directory, changed)
    with logged_in_client(database_url, web_dist, data_sources_dir=directory):
        pass
    source = rows(database_url, models.DataSource)[0]
    assert (source.version, source.imported_at > first) == ("2026-02-01", True)
    assert "TEST Same version" in [f.name for f in rows(database_url, models.SourceFood)]


def test_the_committed_fixture_file_is_the_helpers_file(tmp_path):
    assert read_file(FIXTURE) == read_file(write(tmp_path, test_source()))
