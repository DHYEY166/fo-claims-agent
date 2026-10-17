"""Wires fo trust qa's `trust/` package (approval gate, hash-chained audit log, polling) into the API.
trust/ lives at the repo root next to api/. TRUST_PATH can point elsewhere before the branches merge."""
import os, sqlite3, sys, threading
from pathlib import Path
from . import config

_root = Path(__file__).resolve().parents[2]
for p in (str(_root), os.environ.get("TRUST_PATH", "")):
    if (Path(p) / "trust" / "gate.py").exists() and p not in sys.path:
        sys.path.insert(0, p); break

from trust.gate import Trust, ApprovalRequired, ApprovalConflict, TargetNotAllowed, SpendLimitExceeded  # noqa
from trust.poll import poll_fo_reply  # noqa
from trust.redact import redact  # noqa

MOCK_TARGET = "mock:test-target@example.com"
BLOCKED = (ApprovalRequired, ApprovalConflict, TargetNotAllowed, SpendLimitExceeded)

def outbound_target() -> str:
    return config.FO_TEST_TARGET or MOCK_TARGET

def _allowed():
    s = set()
    if config.FO_TEST_TARGET: s.add(config.FO_TEST_TARGET)
    if config.FO_MOCK: s.add(MOCK_TARGET)
    return s

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
    return {"chain_ok": ok, "rows": [dict(zip(keys, r)) for r in rows]}
