"""Approval-gated follow-up: drafted on timer expiry, never auto-sent, one per case, audited."""
from datetime import datetime, timedelta, timezone

import pytest

from app import config, db, pipeline, trust_bridge as tb
from trust.gate import Trust


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    monkeypatch.setattr(config, "FO_MOCK", True)
    monkeypatch.setattr(config, "MOCK_STEP_SECONDS", 0)
    monkeypatch.setattr(config, "MOCK_BANK_SILENT", True)
    monkeypatch.setattr(tb, "outbound_target", lambda: tb.MOCK_TARGET)
    clock = {"t": 1_000_000.0}
    trust = Trust(db=str(tmp_path / "audit.db"), allowed_targets={tb.MOCK_TARGET}, max_spend_cents=0,
                  clock=lambda: clock["t"])
    monkeypatch.setattr(tb, "_trust", trust)
    sent: list = []
    real_mock = pipeline._mock_contact
    monkeypatch.setattr(pipeline, "_mock_contact", lambda cid, a, t0: (sent.append(a), real_mock(cid, a, t0)))
    monkeypatch.setattr(pipeline, "_bg", lambda fn, *a: fn(*a))  # run approvals inline
    db.init()
    return {"trust": trust, "clock": clock, "sent": sent}


def _due_case() -> str:
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    return db.insert_case(type="card_dispute", title="t", counterparty="Test Bank", amount_cents=4999,
                          status="follow_up_scheduled", follow_up_at=past, mock=1,
                          fo_conversation_id="mock-conv-x")["id"]


def _expire(cid: str) -> None:
    db.update_case(cid, follow_up_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat())


def _pending(cid: str) -> dict:
    [ev] = [e for e in db.list_events(cid) if e["kind"] == "approval_requested" and e.get("pending")]
    return ev


def _audit(trust, cid) -> list:
    return [r[0] for r in trust.db.execute("SELECT event FROM audit_log WHERE case_id=? ORDER BY id", (cid,))]


def test_draft_created_on_expiry_and_nothing_sent(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    c = db.get_case(cid)
    assert c["status"] == "awaiting_approval" and c["follow_up_at"] is None
    ev = _pending(cid)
    act = ev["proposed_action"]
    assert act["kind"] == "follow_up" and act["to"] == tb.MOCK_TARGET and act["spend_cents"] == 0
    assert "follow-up email" in act["message"] and "no reply has arrived" in act["message"]
    assert env["sent"] == []
    assert "follow_up_drafted" in _audit(env["trust"], cid)
    pipeline.run_follow_ups()  # nothing due now; still no send, no second draft
    assert env["sent"] == [] and len([e for e in db.list_events(cid) if e["kind"] == "approval_requested"]) == 1


def test_no_send_without_approval(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    act = _pending(cid)["proposed_action"]
    pipeline.contact(cid, act)  # straight to contact without approving: the gate refuses
    assert env["sent"] == []
    assert db.get_case(cid)["status"] == "escalated"
    assert any(e["title"] == "Blocked by trust gate" for e in db.list_events(cid))


def test_edited_follow_up_is_refused(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    ev = _pending(cid)
    env["trust"].decide(ev["proposed_action"]["approval_id"], "approved")
    pipeline.contact(cid, dict(ev["proposed_action"], message="something else"))
    assert env["sent"] == [] and db.get_case(cid)["status"] == "escalated"


def test_expired_follow_up_approval_is_refused(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    ev = _pending(cid)
    env["trust"].decide(ev["proposed_action"]["approval_id"], "approved")
    env["clock"]["t"] += 901
    pipeline.contact(cid, ev["proposed_action"])
    assert env["sent"] == [] and db.get_case(cid)["status"] == "escalated"


def test_approval_sends_once_then_second_follow_up_refused(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    ev = _pending(cid)
    pipeline.decide(cid, ev["id"], "approve")
    assert len(env["sent"]) == 1 and env["sent"][0]["kind"] == "follow_up"
    assert db.get_case(cid)["status"] == "follow_up_scheduled"
    with pytest.raises(ValueError):
        pipeline.decide(cid, ev["id"], "approve")  # same approval can't be used twice
    pipeline.contact(cid, ev["proposed_action"])  # replaying the approved action: single-use gate refuses
    assert len(env["sent"]) == 1
    # Bank stays quiet after the follow-up: no second draft, hand back to the user.
    db.update_case(cid, status="follow_up_scheduled")
    _expire(cid)
    pipeline.run_follow_ups()
    assert len(env["sent"]) == 1
    assert len([e for e in db.list_events(cid) if e["kind"] == "approval_requested"]) == 1
    assert db.get_case(cid)["status"] == "escalated"
    assert pipeline.request_follow_up(cid) is False
    log = _audit(env["trust"], cid)
    for step in ("follow_up_drafted", "approval_decided", "follow_up_approved", "fo_ask_authorized",
                 "ask_fo_sent", "follow_up_scheduled", "follow_up_due_escalated", "follow_up_refused"):
        assert step in log, step
    assert env["trust"].chain_ok()


def test_reject_path_hands_case_back(env):
    cid = _due_case()
    pipeline.run_follow_ups()
    ev = _pending(cid)
    pipeline.decide(cid, ev["id"], "reject", "not now")
    assert env["sent"] == []
    assert db.get_case(cid)["status"] == "escalated"
    assert "follow_up_rejected" in _audit(env["trust"], cid)
    assert pipeline.request_follow_up(cid) is False  # a rejected draft still uses up the one follow-up


def test_real_follow_up_has_its_own_slot_and_counts_toward_cap(env):
    day = datetime.now(timezone.utc).date().isoformat()  # same UTC day the pipeline counts sends by
    assert db.reserve_test_send("case_a", day, 3)
    assert db.reserve_test_send(pipeline.follow_up_send_key("case_a"), day, 3)
    assert not db.reserve_test_send(pipeline.follow_up_send_key("case_a"), day, 3)  # one follow-up ever
    assert db.case_has_test_send("case_a")
    assert db.reserve_test_send("case_b", day, 3)
    assert not db.reserve_test_send(pipeline.follow_up_send_key("case_b"), day, 3)  # cap of 3 includes it
