"""Offline check of the held-email path and the one-click go-ahead. Fo is stubbed; nothing leaves this computer.
Run with throwaway DBs:
DB_PATH=/tmp/x/cases.db AUDIT_DB_PATH=/tmp/x/audit.db FO_MOCK=0 python scripts/sim_fo_hold_go.py"""
import sys
sys.path.insert(0, ".")
from app import db, pipeline, trust_bridge as tb  # noqa: E402

HELD = "This one's held for your go-ahead since it's the first email I'd ever send for you. Say go and I'll send it."
SENT = "Done. I sent the email to the test bank inbox."


class StubFo:
    calls: list = []
    replies: list = []

    def ask(self, message, conversation_id=None, new=False):
        shown = message if message == "go" else "<dispute email>"
        StubFo.calls.append({"message": shown, "conversationId": conversation_id, "new": new})
        conv = conversation_id or "sim-conv-1"
        return {"status": "complete", "conversationId": conv, "response": StubFo.replies.pop(0)}

    def poll_with_retry(self, *a, **k):
        raise AssertionError("not needed")


def run(second_reply):
    StubFo.calls, StubFo.replies = [], [HELD, second_reply]
    pipeline.FoClient = StubFo
    pipeline._stray_recipients = lambda *a, **k: []
    pipeline._bg = lambda fn, *a: fn(*a)
    cid = db.insert_case(type="card_dispute", title="sim", status="contacting")["id"]
    msg = "Dispute email to " + tb.TEST_BANK_ALIAS
    aid = tb.call("request_approval", cid, "email", tb.TEST_BANK_ALIAS, msg, 0)
    tb.call("decide", aid, "approved")
    pipeline.contact(cid, {"channel": "email", "to": tb.TEST_BANK_ALIAS, "message": msg, "approval_id": aid})
    print("after first approve:", db.get_case(cid)["status"])
    go_ev = [e for e in db.list_events(cid) if e["kind"] == "approval_requested" and e.get("pending")]
    print("go-ahead button offered:", len(go_ev))
    pipeline.decide(cid, go_ev[0]["id"], "approve")
    try:
        pipeline.decide(cid, go_ev[0]["id"], "approve")
        print("second click: ACCEPTED <-- FAIL")
    except ValueError as e:
        print("second click: refused (", e, ")")
    c = db.get_case(cid)
    print("final status:", c["status"], "| follow_up_at set:", bool(c.get("follow_up_at")))
    print("ask_fo calls:", StubFo.calls)
    pending = [e for e in db.list_events(cid) if e["kind"] == "approval_requested" and e.get("pending")]
    print("more go buttons:", len(pending))
    print("steps:", [e["title"] for e in db.list_events(cid)])
    return cid


db.init()
print("== Fo sends after go ==")
run(SENT)
print("== Fo holds again after go ==")
run(HELD)
with db.conn() as c:
    print("test_sends rows:", c.execute("SELECT COUNT(*) FROM test_sends").fetchone()[0])
