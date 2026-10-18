"""Real-send path with the real SQLite test_sends table (only Fo is faked): an approved follow-up on a case
that already had its first send must reserve exactly one follow-up slot and reach Fo once."""
from datetime import datetime, timezone

import pytest

from app import config, db, pipeline, trust_bridge as tb


class _Reached(Exception):
    pass


@pytest.fixture
def real_path(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    monkeypatch.setattr(config, "MAX_TEST_SENDS_PER_DAY", 3)
    monkeypatch.setattr(tb, "resolve", lambda to: "bank@example.invalid")
    asks: list = []

    class FakeFo:
        def ask(self, message, new=True):
            asks.append(message)
            raise _Reached()

    monkeypatch.setattr(pipeline, "FoClient", FakeFo)
    db.init()
    return asks


def _rows() -> list:
    with db.conn() as c:
        return [r[0] for r in c.execute("SELECT case_id FROM test_sends ORDER BY id")]


def _case() -> str:
    return db.insert_case(type="package_claim", title="t", counterparty="Test Bank", amount_cents=100,
                          status="awaiting_approval", mock=0)["id"]


def _action(kind: str) -> dict:
    return {"kind": kind, "to": tb.TEST_BANK_ALIAS, "message": f"{kind} to {tb.TEST_BANK_ALIAS}"}


def test_follow_up_after_first_send_reaches_fo_once(real_path):
    cid = _case()
    day = datetime.now(timezone.utc).date().isoformat()
    assert db.reserve_test_send(cid, day, config.MAX_TEST_SENDS_PER_DAY)  # the earlier first send
    with pytest.raises(_Reached):
        pipeline._real_contact(cid, _action("follow_up"), 0.0)
    assert len(real_path) == 1
    assert _rows() == [cid, pipeline.follow_up_send_key(cid)]
    assert not any(e["title"] == "Daily test-send cap reached" for e in db.list_events(cid))


def test_second_follow_up_refused_without_new_row(real_path):
    cid = _case()
    day = datetime.now(timezone.utc).date().isoformat()
    db.reserve_test_send(cid, day, config.MAX_TEST_SENDS_PER_DAY)
    with pytest.raises(_Reached):
        pipeline._real_contact(cid, _action("follow_up"), 0.0)
    pipeline._real_contact(cid, _action("follow_up"), 0.0)
    assert len(real_path) == 1 and len(_rows()) == 2
    assert db.get_case(cid)["status"] == "escalated"


def test_follow_up_counts_toward_cap(real_path):
    day = datetime.now(timezone.utc).date().isoformat()
    a, b, c = _case(), _case(), _case()
    for cid in (a, b, c):
        assert db.reserve_test_send(cid, day, config.MAX_TEST_SENDS_PER_DAY)
    pipeline._real_contact(a, _action("follow_up"), 0.0)
    assert real_path == [] and len(_rows()) == 3
    assert db.get_case(a)["status"] == "escalated"


def test_first_send_still_reserves_once(real_path):
    cid = _case()
    with pytest.raises(_Reached):
        pipeline._real_contact(cid, _action("first"), 0.0)
    assert _rows() == [cid] and len(real_path) == 1
