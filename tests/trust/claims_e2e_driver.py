"""Runs every claim fixture through the real API, pipeline, trust gate, mock Fo send and audit chain.

Started in a subprocess by test_claims_e2e.py so DB_PATH / AUDIT_DB_PATH point at a temp dir before
app.config is imported. Only classify() is replaced, by the fixture's canned extraction (run through the
real code-side grounding check). FO_MOCK=1, no keys: nothing leaves this computer.
"""
import json
import os
import sys
import tempfile
import time

_TMP = os.path.realpath(tempfile.gettempdir())
for _var in ("DB_PATH", "AUDIT_DB_PATH"):
    if not os.path.realpath(os.environ.get(_var, "")).startswith(_TMP + os.sep):
        sys.exit(f"refusing to run: {_var} must point inside {_TMP}")
if os.environ.get("FO_MOCK") != "1":
    sys.exit("refusing to run: FO_MOCK must be 1")

from fastapi.testclient import TestClient  # noqa: E402

from app import config, db, pipeline  # noqa: E402
from app import trust_bridge as tb  # noqa: E402
from app.classifier import ground  # noqa: E402
from app.main import app  # noqa: E402
from app.schema import Extraction  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from claim_fixtures import fixtures  # noqa: E402

FIX = {f["text"]: f for f in fixtures()}


def canned_classify(text):
    fx = next(f for t, f in FIX.items() if tb.redact(t) == text)
    ex = Extraction.model_validate(fx["ex"])
    return ex, {"agent": "classifier", "model": "fixture", "prompt_id": "fixture", "mock": True,
                "tokens": {"input": 0, "output": 0}, "retries": 0, "errors": [],
                "grounding_problems": ground(ex, text)}


pipeline.classify = canned_classify


def wait(c, cid, states, timeout=20.0):
    end = time.time() + timeout
    case = c.get(f"/api/cases/{cid}").json()
    while case["status"] not in states and time.time() < end:
        time.sleep(0.05)
        case = c.get(f"/api/cases/{cid}").json()
    return case


def run_one(c, fx):
    out = {"id": fx["id"]}
    cid = c.post("/api/cases", json={"source": "paste", "text": fx["text"]}).json()["id"]
    case = wait(c, cid, {"awaiting_approval", "escalated", "failed"})
    out["first_stop"] = case["status"]
    out["escalation"] = next((e["title"] for e in case["events"] if e["kind"] == "escalated_to_human"), None)
    ev = next(
        (e for e in case["events"]
         if e["kind"] in ("evidence_gathered", "escalated_to_human") and e.get("grounding_problems")),
        None,
    )
    out["grounding_problems"] = (ev or {}).get("grounding_problems", [])
    pending = [e for e in case["events"] if e["kind"] == "approval_requested"]
    out["proposed_message"] = pending[-1]["proposed_action"]["message"] if pending else None
    out["sends_before_approval"] = sum(e["kind"] == "email_sent" for e in case["events"])
    if pending:
        body = {"event_id": pending[-1]["id"], "decision": "approve"}
        out["decide_status"] = c.post(f"/api/cases/{cid}/approvals", json=body).status_code
        case = wait(c, cid, {"resolved", "escalated", "failed"})
        out["replay_status"] = c.post(f"/api/cases/{cid}/approvals", json=body).status_code
    case = c.get(f"/api/cases/{cid}").json()
    sent = [e for e in case["events"] if e["kind"] == "email_sent"]
    out.update(status=case["status"], type=db.get_case(cid)["type"], events=[e["kind"] for e in case["events"]],
               sends=len(sent), sent_to=[e["email"]["to"] for e in sent],
               sent_body=sent[0]["email"]["body"] if sent else None, mock_flags=[e.get("mock") for e in sent])
    rows = tb.audit_rows(cid)
    out.update(audit=[r["event"] for r in rows["rows"]], chain_ok=rows["chain_ok"],
               stored_text=json.dumps(db.get_case_row(cid)["raw_text"]) + json.dumps(case) + json.dumps(rows))
    return out


def main():
    results = []
    with TestClient(app, base_url="http://localhost:8020", client=("127.0.0.1", 5000)) as c:
        for fx in fixtures():
            results.append(run_one(c, fx))
    print("RESULT " + json.dumps({"results": results, "target": tb.outbound_target(),
                                  "fo_mock": bool(config.FO_MOCK)}))


if __name__ == "__main__":
    main()
