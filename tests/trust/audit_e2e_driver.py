"""Runs one case through the real API + pipeline + trust_bridge audit chain and prints a JSON summary.

Started in a subprocess by test_audit_chain_e2e.py so DB_PATH / AUDIT_DB_PATH point at a temp dir before
app.config is imported. Fo stays mocked; nothing leaves this computer.
"""
import json
import os
import sqlite3
import sys
import time

import tempfile

# Refuse to run against real data: this script writes cases and drops an audit trigger.
_TMP = os.path.realpath(tempfile.gettempdir())
for _var in ("DB_PATH", "AUDIT_DB_PATH"):
    if not os.path.realpath(os.environ.get(_var, "")).startswith(_TMP + os.sep):
        sys.exit(f"refusing to run: {_var} must point inside {_TMP}")

from fastapi.testclient import TestClient  # noqa: E402

from app import db, pipeline  # noqa: E402
from app import trust_bridge as tb  # noqa: E402
from app.main import app  # noqa: E402

TEXT = ("Chase card ending 4417. Charge of $89.99 from STREAMFLIX on 2026-10-12. I cancelled in August "
        "and never authorized this. Please dispute it.")
FINAL = {"approve": {"resolved", "escalated", "failed"}, "reject": {"rejected"}}


def wait(c, cid, states, timeout=30.0):
    end = time.time() + timeout
    case = c.get(f"/api/cases/{cid}").json()
    while case["status"] not in states and time.time() < end:
        time.sleep(0.05)
        case = c.get(f"/api/cases/{cid}").json()
    return case


def main(mode):
    out = {}
    with TestClient(app, base_url="http://localhost:8020", client=("127.0.0.1", 5000)) as c:
        cid = c.post("/api/cases", json={"source": "paste", "text": TEXT}).json()["id"]
        case = wait(c, cid, {"awaiting_approval", "escalated", "failed"})
        if mode == "follow_up_due":
            # Put the case where a sent-but-unanswered case sits, with the follow-up already due.
            db.update_case(cid, status="follow_up_scheduled", follow_up_at="2000-01-01T00:00:00+00:00")
            pipeline.run_follow_ups()  # first expiry: drafts the one follow-up for approval, sends nothing
            # Then the bank stays quiet after that follow-up: the next expiry hands the case back.
            db.update_case(cid, status="follow_up_scheduled", follow_up_at="2000-01-01T00:00:00+00:00")
            pipeline.run_follow_ups()
        else:
            ev = [e for e in case["events"] if e["kind"] == "approval_requested"][-1]
            body = {"event_id": ev["id"], "decision": mode}
            out["decide_status"] = c.post(f"/api/cases/{cid}/approvals", json=body).status_code
            case = wait(c, cid, FINAL[mode])
            out["replay_status"] = c.post(f"/api/cases/{cid}/approvals", json=body).status_code
        case = c.get(f"/api/cases/{cid}").json()
        rows = tb.audit_rows(cid)
        api_audit = c.get("/api/audit").json()
    out.update(status=case["status"], events=[e["kind"] for e in case["events"]],
               audit=[r["event"] for r in rows["rows"]], chain_ok=rows["chain_ok"],
               audit_text=json.dumps(rows["rows"]) + json.dumps(api_audit))
    # The log refuses edits; then simulate someone with file access dropping that guard and editing a row.
    tamper = "UPDATE audit_log SET detail='{}' WHERE id=(SELECT MIN(id) FROM audit_log WHERE case_id=?)"
    assert os.path.realpath(tb._path) == os.path.realpath(os.environ["AUDIT_DB_PATH"])
    con = sqlite3.connect(tb._path)
    try:
        con.execute(tamper, (cid,))
        out["update_refused"] = False
    except sqlite3.IntegrityError:
        out["update_refused"] = True
    con.execute("DROP TRIGGER audit_no_update")
    con.execute(tamper, (cid,))
    con.commit()
    con.close()
    out["chain_ok_after_tamper"] = tb.audit_rows(cid)["chain_ok"]
    print("RESULT " + json.dumps(out))


if __name__ == "__main__":
    main(sys.argv[1])
