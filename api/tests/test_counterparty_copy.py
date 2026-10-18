"""Escalation copy names the company on the case ("State Farm stayed quiet..."), not always "the bank"."""
import json
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


@pytest.mark.parametrize("raw,n,want", [
    ("Liberty Mutual Personal Insurance Company of America", 40, "Liberty Mutual Personal Insurance"),
    ("State Farm", 40, "State Farm"),
    ("A" * 50, 40, "A" * 40),
    ("1Z999AA10123456784XXXXXXXXXXXXXXXX", 30, "1Z999AA10123456784XXXXXXXXXXXX"),
    ("2026-10-12T00:00", 10, "2026-10-12"),
    ("Exactly forty characters long okay right", 40, "Exactly forty characters long okay right"),
    ("Word boundary falls right here at forty then more", 40, "Word boundary falls right here at forty"),
    ("  padded name  ", 40, "padded name"),
    (None, 40, None),
])
def test_clean_cuts_at_a_word_boundary(raw, n, want):
    out = pipeline._clean(raw, n)
    assert out == want
    assert out is None or len(out) <= n


def test_word_boundary_cut_reaches_the_fo_request(monkeypatch):
    """_clean also builds Fo's instructions: the cut name goes there too, and a spaceless name is cut at 40, not
    dropped."""
    long_name = "Liberty Mutual Personal Insurance Company of America"
    spaceless = "B" * 55
    ev = {"merchant": {"status": "present", "value": spaceless}}
    monkeypatch.setattr(db, "get_case_row", lambda _id: {"evidence": json.dumps(ev)})
    case = {"id": "case_x", "type": "insurance_claim", "amount_cents": 78000, "counterparty": long_name}
    for follow_up in (False, True):
        req = pipeline.build_fo_request(case, "test bank inbox", follow_up=follow_up)
        assert "with Liberty Mutual Personal Insurance" in req
        assert "Liberty Mutual Personal Insurance Comp" not in req
        assert f"- merchant: {'B' * 40}\n" in req or req.endswith(f"- merchant: {'B' * 40}")
        assert "B" * 41 not in req


def test_spaceless_and_exact_forty():
    assert pipeline._clean("C" * 41) == "C" * 40
    assert pipeline._clean("D" * 40) == "D" * 40
    forty = "Exactly forty characters long okay right"
    assert len(forty) == 40 and pipeline._clean(forty + " tail") == forty
