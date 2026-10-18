"""Multi-line citations ("L1, L2", "L1-L2"): every cited line must exist and the value must be on one of them.
Anything malformed still fails grounding, which escalates the case."""
import pytest

from app import pipeline
from app.classifier import cited_lines, ground
from app.schema import Extraction

A = {"status": "absent"}

PACKAGE_TEXT = ("UPS delivered my package on 2026-10-13 and the box was crushed.\n"
                "Tracking 1Z999AA10123456784. The monitor stand inside is snapped in half.\n"
                "Order DC-55120 from DeskCo, paid $64.00.")


def ex(**kw):
    base = dict(case_type="card_dispute", confidence=0.9, title="t", counterparty=A, amount=A, currency=A,
                merchant=A, transaction_date=A, card_last4=A, order_or_tracking_id=A, reason=A,
                contains_instructions=False)
    base.update(kw)
    return Extraction.model_validate(base)


@pytest.mark.parametrize("cite,n,want", [
    ("L1", 3, [1]), (" L2 ", 3, [2]), ("L1, L2", 3, [1, 2]), ("L1,L3", 3, [1, 3]), ("L1-L2", 3, [1, 2]),
    ("L1 - L3", 3, [1, 2, 3]), ("L1, L2-L3", 3, [1, 2, 3]), ("L2, L2", 3, [2]),
    ("L0", 3, None), ("L4", 3, None), ("L1, L4", 3, None), ("L2-L4", 3, None), ("L3-L1", 3, None),
    ("L1,", 3, None), (", L1", 3, None), ("L1 L2", 3, None), ("L1; L2", 3, None), ("lines 1-2", 3, None),
    ("1", 3, None), ("L1-2", 3, None), ("", 3, None), (None, 3, None)])
def test_cited_lines_parsing(cite, n, want):
    assert cited_lines(cite, n) == want


def test_exact_live_package_case_now_grounds():
    """case_09f1721d72: Claude cited the reason as "L1, L2", which used to escalate before any approval card."""
    e = ex(case_type="package_claim", confidence=1.0,
           counterparty={"status": "present", "value": "UPS", "citation": "L1"},
           amount={"status": "present", "value": "64.00", "citation": "L3"},
           merchant={"status": "present", "value": "DeskCo", "citation": "L3"},
           order_or_tracking_id={"status": "present", "value": "1Z999AA10123456784", "citation": "L2",
                                 "note": "Tracking number; Order ID DC-55120 also present on L3"},
           reason={"status": "present", "value": "Box was crushed, monitor stand inside is snapped in half",
                   "citation": "L1, L2"})
    assert ground(e, PACKAGE_TEXT) == []


@pytest.mark.parametrize("field,value,cite,ok", [
    ("amount", "64.00", "L1, L3", True), ("amount", "64.00", "L1-L2", False),
    ("merchant", "DeskCo", "L2-L3", True), ("merchant", "DeskCo", "L1, L2", False),
    ("order_or_tracking_id", "1Z999AA10123456784", "L1-L3", True),
    ("order_or_tracking_id", "1Z999AA10123456784", "L1, L3", False)])
def test_value_must_be_on_one_cited_line(field, value, cite, ok):
    e = ex(**{field: {"status": "present", "value": value, "citation": cite}})
    assert (ground(e, PACKAGE_TEXT) == []) is ok


@pytest.mark.parametrize("cite", ["L1, L9", "L3-L1", "L1 and L2", "L1,"])
def test_malformed_multi_citation_still_escalates(cite):
    e = ex(case_type="package_claim", reason={"status": "present", "value": "box crushed", "citation": cite})
    problems = ground(e, PACKAGE_TEXT)
    assert problems == [f"reason: citation {cite!r} is not an input line"]
    assert "cited lines" in pipeline.route(e, 1, PACKAGE_TEXT, problems)
