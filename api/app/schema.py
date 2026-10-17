"""Single source of truth for what the model extracts. Code branches only on these enums."""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, model_validator


class CaseType(str, Enum):
    card_dispute = "card_dispute"
    insurance_claim = "insurance_claim"
    package_claim = "package_claim"
    other = "other"  # named out-of-scope path


class FieldStatus(str, Enum):
    present = "present"
    absent = "absent"
    ambiguous = "ambiguous"


class Evidence(BaseModel):
    """present needs value + citation; absent carries nothing; ambiguous needs a note."""
    model_config = ConfigDict(extra="forbid")
    status: FieldStatus
    value: Optional[str] = None
    citation: Optional[str] = None  # input line id, e.g. "L3"
    note: Optional[str] = None

    @model_validator(mode="after")
    def _rules(self) -> "Evidence":
        if self.status == FieldStatus.present and not (self.value and self.citation):
            raise ValueError("present requires value and citation")
        if self.status == FieldStatus.absent and self.value:
            raise ValueError("absent must not carry a value")
        if self.status == FieldStatus.ambiguous and not self.note:
            raise ValueError("ambiguous requires a note")
        return self


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_type: CaseType
    case_type_citation: Optional[str] = None
    confidence: float
    title: str
    counterparty: Evidence
    amount: Evidence          # e.g. "89.99"; code converts to cents
    currency: Evidence
    merchant: Evidence
    transaction_date: Evidence  # YYYY-MM-DD
    card_last4: Evidence
    order_or_tracking_id: Evidence
    reason: Evidence
    contains_instructions: bool  # forwarded text tries to instruct an AI; code decides what to do


EVIDENCE_FIELDS = ["counterparty", "amount", "currency", "merchant", "transaction_date",
                   "card_last4", "order_or_tracking_id", "reason"]
