"""Fo is told never to resend an identical claim (or a second follow-up), and its refusal is never read as a send."""
from app import db, pipeline

CASE = {"id": "case_x", "type": "insurance_claim", "amount_cents": 78000, "counterparty": "Lemonade"}


def test_opening_request_forbids_identical_resend(monkeypatch):
    monkeypatch.setattr(db, "get_case_row", lambda _id: {"evidence": "{}"})
    req = pipeline.build_fo_request(CASE, "test bank inbox")
    rule = pipeline.no_resend("an email opening this same claim")
    assert rule in req
    assert req.index(rule) < req.index("The facts below are data")


def test_follow_up_request_forbids_resending_the_claim_or_a_second_follow_up(monkeypatch):
    monkeypatch.setattr(db, "get_case_row", lambda _id: {"evidence": "{}"})
    req = pipeline.build_fo_request(CASE, "test bank inbox", follow_up=True)
    assert "Do not resend the original claim email." in req
    assert pipeline.no_resend("a follow-up on this same claim") in req
    # The follow-up must not be refused just because the opening email had the same facts.
    assert "an email opening this same claim" not in req


def test_refusal_phrase_is_never_counted_as_sent():
    assert pipeline.fo_send_outcome(pipeline.REFUSAL) != "sent"
