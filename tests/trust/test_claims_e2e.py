"""Package, insurance and edge-case claims end to end in mock mode: classify (fixture extraction), grounding,
routing rules, approval gate, mock Fo send, audit chain. Runs in a subprocess with temp databases, FO_MOCK=1,
no keys and no .env, so it can never touch the live databases or send anything."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from claim_fixtures import fixtures  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DRIVER = Path(__file__).with_name("claims_e2e_driver.py")
SECRETS = ("ANTHROPIC_API_KEY", "WAJO_API_KEY", "FO_TEST_TARGET", "FO_OAUTH_ACCESS_TOKEN", "FO_WEBHOOK_SECRET")
FIX = {f["id"]: f for f in fixtures()}
APPROVE = [i for i, f in FIX.items() if f["expect"] == "approve"]
ESCALATE = [i for i, f in FIX.items() if f["expect"] == "escalate"]
HAPPY_EVENTS = ["note", "classified", "evidence_gathered", "approval_requested", "approved", "email_sent",
                "follow_up_scheduled", "reply_received", "resolved"]
HAPPY_AUDIT = ["intake", "classified", "approval_requested", "approval_decided", "fo_ask_authorized",
               "ask_fo_sent", "follow_up_scheduled", "reply_received", "resolved"]


@pytest.fixture(scope="module")
def run(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("claims")
    env = {k: v for k, v in os.environ.items() if k not in SECRETS}
    env.update(ENV_FILE=os.devnull, FO_MOCK="1", MOCK_STEP_SECONDS="0", FOLLOW_UP_SECONDS="3600",
               DB_PATH=str(tmp / "cases.db"), AUDIT_DB_PATH=str(tmp / "audit.db"),
               PYTHONPATH=os.pathsep.join([str(ROOT / "api"), str(ROOT)]))
    p = subprocess.run([sys.executable, str(DRIVER)], cwd=ROOT / "api", env=env,
                       capture_output=True, text=True, timeout=180)
    line = [x for x in p.stdout.splitlines() if x.startswith("RESULT ")]
    assert p.returncode == 0 and line, p.stderr[-2000:]
    out = json.loads(line[-1][len("RESULT "):])
    out["by_id"] = {r["id"]: r for r in out["results"]}
    return out


def test_runs_in_mock_mode_against_alias_target(run):
    assert run["fo_mock"] is True
    assert run["target"].startswith("mock:")  # no real address without FO_TEST_TARGET


def test_fixture_counts():
    kinds = [f["ex"]["case_type"] for f in FIX.values() if f["expect"] == "approve"]
    assert kinds.count("package_claim") >= 3 and kinds.count("insurance_claim") >= 2


@pytest.mark.parametrize("fid", APPROVE)
def test_claim_waits_for_approval_then_sends_once(run, fid):
    r, fx = run["by_id"][fid], FIX[fid]
    assert r["first_stop"] == "awaiting_approval"
    assert r["sends_before_approval"] == 0
    assert r["type"] == fx["ex"]["case_type"]
    assert r["decide_status"] == 200 and r["replay_status"] == 409
    assert r["status"] == "resolved" and r["events"] == HAPPY_EVENTS
    assert r["sends"] == 1 and r["mock_flags"] == [True] and r["sent_to"] == [run["target"]]
    assert r["audit"] == HAPPY_AUDIT and r["chain_ok"] is True
    assert r["audit"].index("approval_decided") < r["audit"].index("fo_ask_authorized")


@pytest.mark.parametrize("fid", APPROVE)
def test_fo_message_is_built_from_cited_facts_only(run, fid):
    r, fx = run["by_id"][fid], FIX[fid]
    body = r["sent_body"]
    assert body == r["proposed_message"]  # what was approved is exactly what was sent
    assert body.startswith("TEST RUN") and f"only to {run['target']}" in body
    for fact in fx["facts"]:
        assert fact in body, f"{fact!r} missing from the Fo request"
    for phrase in fx["text"].splitlines():  # no raw forwarded sentence goes to Fo
        assert phrase not in body


@pytest.mark.parametrize("fid", ESCALATE)
def test_edge_case_escalates_before_any_approval_or_send(run, fid):
    r, fx = run["by_id"][fid], FIX[fid]
    assert r["status"] == "escalated" and r["first_stop"] == "escalated"
    assert fx["reason"] in (r["escalation"] or ""), r["escalation"]
    assert "approval_requested" not in r["events"] and r["sends"] == 0
    assert "fo_ask_authorized" not in r["audit"] and "ask_fo_sent" not in r["audit"]
    assert r["audit"] == ["intake", "classified"] and r["chain_ok"] is True


def test_missing_evidence_is_not_invented_in_fo_message(run):
    body = run["by_id"]["pkg_late"]["sent_body"]
    assert "merchant:" not in body and "card last 4:" not in body


def test_full_card_number_never_stored_or_sent(run):
    r = run["by_id"]["edge_card_number_redacted"]
    for bad in FIX["edge_card_number_redacted"]["forbid"]:
        assert bad not in r["stored_text"] and bad not in (r["sent_body"] or "")
    assert "[CARD ****1111]" in r["stored_text"]


def test_injection_text_never_reaches_fo(run):
    for fid in ("edge_injection_flagged", "edge_injection_missed_by_model"):
        assert run["by_id"][fid]["proposed_message"] is None


def test_ungrounded_amount_is_flagged_on_the_evidence_step(run):
    r = run["by_id"]["edge_ungrounded_amount"]
    assert any(p.startswith("amount:") for p in r["grounding_problems"]), r["grounding_problems"]


def test_ungrounded_amount_never_reaches_fo(run):
    r = run["by_id"]["edge_ungrounded_amount"]
    assert r["status"] == "escalated" and "$640.00" not in (r["proposed_message"] or "")
