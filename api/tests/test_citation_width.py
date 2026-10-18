"""A citation range may cover at most MAX_CITE_SPAN (3) lines. A wider range ("L1-L40") would let a value
ground on almost any line of the email, so it fails grounding and the case escalates."""
import pytest

from app.classifier import MAX_CITE_SPAN, cited_lines, ground
from app.schema import Extraction

A = {"status": "absent"}


@pytest.mark.parametrize("cite,want", [
    ("L1-L3", [1, 2, 3]), ("L4-L6", [4, 5, 6]), ("L1-L2, L5-L7", [1, 2, 5, 6, 7]),
    ("L1-L4", None), ("L1-L10", None), ("L2, L3-L8", None)])
def test_range_width_is_capped(cite, want):
    assert MAX_CITE_SPAN == 3
    assert cited_lines(cite, 10) == want


def test_wide_range_fails_grounding():
    text = "\n".join(["Hi bank,"] + ["filler line"] * 8 + ["Charged $780 at STREAMFLIX."])
    e = Extraction.model_validate(dict(
        case_type="card_dispute", confidence=0.9, title="t", counterparty=A, currency=A, merchant=A,
        transaction_date=A, card_last4=A, order_or_tracking_id=A, reason=A, contains_instructions=False,
        amount={"status": "present", "value": "780.00", "citation": "L1-L10"}))
    assert ground(e, text) == ["amount: citation 'L1-L10' is not an input line"]
    e.amount.citation = "L10"
    assert ground(e, text) == []
