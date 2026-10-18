"""The claimed amount must equal a money token on the cited line, to the cent.
Any other number on the line (an order ID, a claim number, a ZIP, a date) no longer grounds it."""
import pytest

from app.classifier import _amount_on_line, ground
from app.schema import Extraction

A = {"status": "absent"}


def ex(value, cite="L1"):
    return Extraction.model_validate(dict(
        case_type="card_dispute", confidence=0.9, title="t", counterparty=A, currency=A, merchant=A,
        transaction_date=A, card_last4=A, order_or_tracking_id=A, reason=A, contains_instructions=False,
        amount={"status": "present", "value": value, "citation": cite}))


@pytest.mark.parametrize("value,line,want", [
    ("780.00", "Charged $780 on 10/12", True),
    ("1200.00", "total $1,200.00", True),
    ("$1,089.99", "paid $1,089.99", True),
    ("89.99", "STREAMFLIX 89.99", True),
    ("100", "amount 100 USD", True),
    ("5", "EUR 5 refund", True),
    ("780.5", "$780.50", True),
    ("780", "order 780 for $78.00", False),
    ("780", "claim LMN-780-22, $45.00", False),
    ("4471", "claim LMN-4471-22 for $780", False),
    ("100", "ZIP 10001 item 100", False),
    ("12", "on 10/12/2026 paid $5.00", False),
    ("780", "$780.50", False),
    ("780abc", "$780", False),
    ("", "$780", False),
])
def test_amount_on_line_is_exact(value, line, want):
    assert _amount_on_line(value, line.lower()) is want


def test_order_number_no_longer_grounds_a_wrong_amount():
    text = "Order 780 from DeskCo, refund owed $78.00."
    assert ground(ex("780"), text) == ["amount: value '780' not found on L1"]
    assert ground(ex("78.00"), text) == []


def test_claim_number_no_longer_grounds_a_wrong_amount():
    text = "Lemonade claim LMN-4471-22, water damage, $780 to repair."
    assert ground(ex("4471"), text) != []
    assert ground(ex("780.00"), text) == []
