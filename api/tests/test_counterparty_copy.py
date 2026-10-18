"""Escalation copy names the company on the case ("State Farm stayed quiet..."), not always "the bank"."""
from datetime import datetime, timedelta, timezone

import pytest

from app import bus, config, db, pipeline, trust_bridge as tb


@pytest.mark.parametrize("case,want", [
    ({"type": "insurance_claim", "counterparty": "State Farm"}, "State Farm"),
    ({"type": "package_claim", "counterparty": "UPS"}, "UPS"),
    ({"type": "insurance_claim", "counterparty": None}, "The insurer"),
    ({"type": "package_claim", "counterparty": ""}, "The carrier"),
    ({"type": "card_dispute"}, "The bank"),
    ({"type": "other", "counterparty": None}, "The company"),
    ({"type": "card_dispute", "counterparty": "a@b.invalid <x>"}, "ab.invalid x"),
])
def test_who_names_the_case_company(case, want):
    assert pipeline.who(case) == want


@pytest.fixture
def quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    monkeypatch.setattr(bus, "publish", lambda *a, **k: None)
    monkeypatch.setattr(tb, "call", lambda *a, **k: None)
    db.init()


def test_quiet_after_follow_up_names_the_insurer(quiet, monkeypatch):
    monkeypatch.setattr(pipeline, "request_follow_up", lambda _cid: False)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    cid = db.insert_case(type="insurance_claim", title="t", counterparty="State Farm", amount_cents=100,
                         status="follow_up_scheduled", follow_up_at=past, mock=1)["id"]
    pipeline.run_follow_ups()
    titles = [e["title"] for e in db.list_events(cid) if e["kind"] == "escalated_to_human"]
    assert titles == ["State Farm stayed quiet after the follow-up"]
    assert not any("Bank" in t for t in titles)


def test_declined_follow_up_names_the_carrier(quiet, monkeypatch):
    cid = db.insert_case(type="package_claim", title="t", counterparty="UPS", amount_cents=100,
                         status="awaiting_approval", mock=1)["id"]
    ev = pipeline.emit(cid, "approval_requested", "Approve?", "agent", pending=True,
                       proposed_action={"kind": "follow_up", "approval_id": "apr_x"})
    pipeline.decide(cid, ev["id"], "reject")
    details = [e["detail"] for e in db.list_events(cid) if e["kind"] == "escalated_to_human"]
    assert details == ["No follow-up was sent. UPS hasn't replied, so the next step is yours."]
