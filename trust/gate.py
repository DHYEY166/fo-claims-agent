"""Approval gate + hash-chained audit log (spec: docs/TRUST_SPEC.md)."""
import hashlib
import json
import re
import sqlite3
import time
import uuid

from .redact import redact

APPROVAL_TTL_S = 900


class ApprovalRequired(Exception):
    pass


class ApprovalConflict(Exception):
    pass


class TargetNotAllowed(Exception):
    pass


# Demo decision (Dhyey, Oct 17): email only. Phone targets and call actions are refused even if allowlisted.
_EMAIL = re.compile(r"[^@\s:]+@[^@\s]+\.[A-Za-z]{2,}")
CALL_ACTIONS = {"call", "phone_call", "start_fo_call"}


class SpendLimitExceeded(Exception):
    pass


def action_hash(case_id, action_type, target, prompt_text, amount_cents=0) -> str:
    blob = json.dumps(dict(case_id=case_id, action_type=action_type, target=target,
                           prompt_text=prompt_text, amount_cents=amount_cents), sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


class Trust:
    def __init__(self, db=":memory:", allowed_targets=(), max_spend_cents=0, clock=time.time, email_only=True):
        self.email_only = email_only
        self.db = sqlite3.connect(db)
        self.allowed = set(allowed_targets)
        self.max_spend = max_spend_cents
        self.clock = clock
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, case_id TEXT, hash TEXT,
            status TEXT, created REAL, used INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL,
            case_id TEXT, actor TEXT, event TEXT, detail TEXT, prev_hash TEXT, row_hash TEXT);
        CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
            BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
            BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
        """)

    # ---- audit ----
    def log(self, case_id, actor, event, detail=None):
        d = redact(json.dumps(detail or {}, sort_keys=True))
        row = self.db.execute("SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
        prev = row[0] if row else "genesis"
        ts = self.clock()
        h = hashlib.sha256(f"{prev}|{ts}|{case_id}|{actor}|{event}|{d}".encode()).hexdigest()
        self.db.execute("INSERT INTO audit_log(ts,case_id,actor,event,detail,prev_hash,row_hash) VALUES(?,?,?,?,?,?,?)",
                        (ts, case_id, actor, event, d, prev, h))
        self.db.commit()

    def chain_ok(self) -> bool:
        prev = "genesis"
        for ts, case_id, actor, event, d, p, h in self.db.execute(
                "SELECT ts,case_id,actor,event,detail,prev_hash,row_hash FROM audit_log ORDER BY id"):
            if p != prev or h != hashlib.sha256(f"{prev}|{ts}|{case_id}|{actor}|{event}|{d}".encode()).hexdigest():
                return False
            prev = h
        return True

    # ---- approvals ----
    def request_approval(self, case_id, action_type, target, prompt_text, amount_cents=0) -> str:
        aid = uuid.uuid4().hex
        self.db.execute("INSERT INTO approvals(id,case_id,hash,status,created) VALUES(?,?,?,?,?)",
                        (aid, case_id, action_hash(case_id, action_type, target, prompt_text, amount_cents),
                         "pending", self.clock()))
        self.log(case_id, "agent", "approval_requested", dict(approval_id=aid, action=action_type, target=target))
        return aid

    def decide(self, approval_id, decision, by="user"):
        row = self.db.execute("SELECT case_id,status,created FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if not row or row[1] != "pending":
            raise ApprovalConflict("not_pending")
        if self.clock() - row[2] > APPROVAL_TTL_S:
            raise ApprovalConflict("expired")
        self.db.execute("UPDATE approvals SET status=? WHERE id=?", (decision, approval_id))
        self.log(row[0], by, "approval_decided", dict(approval_id=approval_id, decision=decision))

    def authorize(self, approval_id, case_id, action_type, target, prompt_text, amount_cents=0):
        """Call immediately before ask_fo. Raises unless a matching, unused, approved row exists."""
        if self.email_only and (action_type in CALL_ACTIONS or not _EMAIL.fullmatch(target.removeprefix("mock:"))):
            self.log(case_id, "system", "blocked", dict(reason="email_only", action_type=action_type, target=target))
            raise TargetNotAllowed(target)
        if target not in self.allowed:
            self.log(case_id, "system", "blocked", dict(reason="target_not_allowed", target=target))
            raise TargetNotAllowed(target)
        if amount_cents > self.max_spend:
            self.log(case_id, "system", "blocked", dict(reason="spend_limit", amount_cents=amount_cents))
            raise SpendLimitExceeded(amount_cents)
        if not approval_id:
            raise ApprovalRequired("no_approval")
        row = self.db.execute("SELECT case_id,hash,status,created,used FROM approvals WHERE id=?",
                              (approval_id,)).fetchone()
        if not row or row[0] != case_id or row[2] != "approved":
            raise ApprovalRequired("not_approved")
        if row[4]:
            raise ApprovalConflict("already_used")
        if self.clock() - row[3] > APPROVAL_TTL_S:
            raise ApprovalConflict("expired")
        if row[1] != action_hash(case_id, action_type, target, prompt_text, amount_cents):
            raise ApprovalConflict("action_changed_after_approval")
        self.db.execute("UPDATE approvals SET used=1 WHERE id=?", (approval_id,))
        self.log(case_id, "system", "fo_ask_authorized", dict(approval_id=approval_id, target=target))
