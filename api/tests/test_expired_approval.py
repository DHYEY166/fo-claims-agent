"""Expired approval cards: a late click gets a 409 (not a 500) and the case is escalated, not stuck;
cards nobody clicks are swept after the TTL. Real SQLite and the real trust gate; nothing reaches Fo."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import bus, config, db, main, pipeline, trust_bridge as tb


@pytest.fixture
def case_with_card(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    monkeypatch.setattr(bus, "publish", lambda *a, **k: None)
    db.init()

    class NoFo:
        def __init__(self, *a, **k):
            raise AssertionError("Fo must not be reached")

    monkeypatch.setattr(pipeline, "FoClient", NoFo)
    cid = db.insert_case(type="insurance_claim", title="t", counterparty="Insurer", amount_cents=100,
                         status="awaiting_approval", mock=0)["id"]
    aid = tb.call("request_approval", cid, "email", tb.TEST_BANK_ALIAS, "msg", 0)
    ev = pipeline.emit(cid, "approval_requested", "Approve?", "agent", proposed_action={
        "kind": "first", "channel": "email", "to": tb.TEST_BANK_ALIAS, "message": "msg", "approval_id": aid},
        pending=True)
    return cid, ev, aid


def _age_gate(aid: str, seconds: int) -> None:
    with tb._lock:
        tb._trust.db.execute("UPDATE approvals SET created=created-? WHERE id=?", (seconds, aid))
        tb._trust.db.commit()


def test_late_click_on_expired_card_is_409_and_escalates(case_with_card, monkeypatch):
    cid, ev, aid = case_with_card
    _age_gate(aid, tb.APPROVAL_TTL_S + 60)
    monkeypatch.setattr(main, "_local_only", lambda request: None)
    client = TestClient(main.app, raise_server_exceptions=False)  # no lifespan: no scheduler thread
    r = client.post(f"/api/cases/{cid}/approvals", json={"event_id": ev["id"], "decision": "approve"})
    assert r.status_code == 409
    assert "expired" in r.json()["detail"]
    assert db.get_case(cid)["status"] == "escalated"
    assert db.get_event(ev["id"])["pending"] is False
    titles = [e["title"] for e in db.list_events(cid)]
    assert "Approval expired, case handed back to you" in titles
    assert not db.case_has_test_send(cid)


def test_decide_expired_raises_valueerror_not_approvalconflict(case_with_card):
    cid, ev, aid = case_with_card
    _age_gate(aid, tb.APPROVAL_TTL_S + 1)
    with pytest.raises(ValueError, match="expired"):
        pipeline.decide(cid, ev["id"], "approve")
    with pytest.raises(ValueError, match="no pending approval"):
        pipeline.decide(cid, ev["id"], "approve")  # card is gone; a second click is a plain 409 too


def test_sweep_closes_unclicked_card_after_ttl(case_with_card):
    cid, ev, aid = case_with_card
    later = datetime.now(timezone.utc) + timedelta(seconds=tb.APPROVAL_TTL_S + 5)
    pipeline.expire_stale_approvals(later)
    assert db.get_event(ev["id"])["pending"] is False
    assert db.get_case(cid)["status"] == "escalated"
    pipeline.expire_stale_approvals(later)  # idempotent: one escalation per card
    assert sum(e["kind"] == "escalated_to_human" for e in db.list_events(cid)) == 1


def test_sweep_leaves_fresh_card_alone(case_with_card):
    cid, ev, aid = case_with_card
    pipeline.expire_stale_approvals(datetime.now(timezone.utc))
    assert db.get_event(ev["id"])["pending"] is True
    assert db.get_case(cid)["status"] == "awaiting_approval"
