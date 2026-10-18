"""Wires fo trust qa's `trust/` package (approval gate, hash-chained audit log, polling) into the API.
trust/ lives at the repo root next to api/. TRUST_PATH can point elsewhere before the branches merge."""
import os
import sqlite3
import sys
import threading
from pathlib import Path
from . import config, masking

_root = Path(__file__).resolve().parents[2]
for p in (str(_root), os.environ.get("TRUST_PATH", "")):
    if (Path(p) / "trust" / "gate.py").exists() and p not in sys.path:
        sys.path.insert(0, p)
        break

from trust.gate import Trust, ApprovalRequired, ApprovalConflict, TargetNotAllowed, SpendLimitExceeded  # noqa
from trust.gate import APPROVAL_TTL_S  # noqa
from trust.poll import poll_fo_reply  # noqa
from trust.redact import redact  # noqa

MOCK_TARGET = "mock:test-target@example.com"
BLOCKED = (ApprovalRequired, ApprovalConflict, TargetNotAllowed, SpendLimitExceeded)

_EMAIL_RE = __import__("re").compile(r"[^@\s:]+@[^@\s]+\.[A-Za-z]{2,}")


def is_email(v) -> bool:
    """Email-only demo: phone numbers, tel:, sms: and anything else are refused."""
    return bool(v) and bool(_EMAIL_RE.fullmatch(str(v).removeprefix("mock:")))


# The real test-bank address lives only in .env. Everything stored or shown uses this alias;
# resolve() swaps in the real address only when the message goes to Fo.
TEST_BANK_ALIAS = "test-bank-inbox@alias.invalid"
mask = masking.mask


def outbound_target() -> str:
    return TEST_BANK_ALIAS if masking.real_target() else MOCK_TARGET


def resolve(target: str):
    return masking.real_target() if target == TEST_BANK_ALIAS else None


def _allowed():
    """Single allowlist entry: the test bank (by alias). Mock target only when no real target is set."""
    if masking.real_target():
        return {TEST_BANK_ALIAS}
    return {MOCK_TARGET} if config.FO_MOCK else set()


_lock = threading.RLock()
_path = os.environ.get("AUDIT_DB_PATH", str(Path(config.DB_PATH).with_name("audit.db")))
_trust = Trust(db=_path, allowed_targets=_allowed(), max_spend_cents=0)
_trust.db.close()
_trust.db = sqlite3.connect(_path, check_same_thread=False)


def call(method, *a, **kw):
    with _lock:
        return getattr(_trust, method)(*a, **kw)


def audit_rows(case_id=None):
    with _lock:
        q = "SELECT id,ts,case_id,actor,event,detail,row_hash FROM audit_log"
        rows = _trust.db.execute(q + (" WHERE case_id=?" if case_id else "") + " ORDER BY id",
                                 (case_id,) if case_id else ()).fetchall()
        ok = _trust.chain_ok()
    keys = ["id", "ts", "case_id", "actor", "event", "detail", "row_hash"]
    return {"chain_ok": ok, "rows": [{k: mask(v) if isinstance(v, str) else v for k, v in zip(keys, r)}
                                     for r in rows]}
