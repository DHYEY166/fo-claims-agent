"""The daily cap on real sends to the private test-bank inbox (api/app/db.py reserve_test_send)."""
import concurrent.futures as cf
import importlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api"))


@pytest.fixture()
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "cases.db"))
    monkeypatch.setenv("FO_MOCK", "1")
    from app import config
    importlib.reload(config)
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "cases.db"))
    from app import db as dbmod
    importlib.reload(dbmod)
    dbmod.init()
    return dbmod


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def test_cap_allows_three_then_refuses(db):
    got = [db.reserve_test_send(f"case_{i}", _today(), 3) for i in range(5)]
    assert got == [True, True, True, False, False]


def test_cap_holds_under_concurrency(db):
    with cf.ThreadPoolExecutor(10) as ex:
        got = list(ex.map(lambda i: db.reserve_test_send(f"case_{i}", _today(), 3), range(10)))
    assert got.count(True) == 3


def test_cap_resets_on_a_new_utc_day(db):
    for i in range(3):
        assert db.reserve_test_send(f"case_{i}", _today(), 3)
    assert db.reserve_test_send("case_x", "2099-01-01", 3) is True  # different day prefix, separate budget
