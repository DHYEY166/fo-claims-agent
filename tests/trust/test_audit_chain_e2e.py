"""End to end: every pipeline step a judge sees on the timeline has a row in the real hash-chained audit log.

Runs the real FastAPI app, pipeline and trust_bridge (no stubs) in a subprocess with its own temp databases,
FO_MOCK=1, no API keys and no .env, so it can never touch the live databases or send anything.
evidence_gathered is the one timeline step with no audit row: it is internal and sends nothing.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DRIVER = Path(__file__).with_name("audit_e2e_driver.py")
SECRETS = ("ANTHROPIC_API_KEY", "WAJO_API_KEY", "FO_TEST_TARGET", "FO_OAUTH_ACCESS_TOKEN", "FO_WEBHOOK_SECRET")

# timeline event kind -> the audit event(s) that must exist for it
STEP_TO_AUDIT = {
    "note": ["intake"],
    "classified": ["classified"],
    "approval_requested": ["approval_requested"],
    "approved": ["approval_decided"],
    "rejected": ["approval_decided"],
    "email_sent": ["fo_ask_authorized", "ask_fo_sent"],
    "follow_up_scheduled": ["follow_up_scheduled"],
    "reply_received": ["reply_received"],
    "resolved": ["resolved"],
}
NOT_AUDITED = {"evidence_gathered"}


def run(mode, tmp_path):
    env = {k: v for k, v in os.environ.items() if k not in SECRETS}
    env.update(ENV_FILE=os.devnull, FO_MOCK="1", MOCK_STEP_SECONDS="0", FOLLOW_UP_SECONDS="3600",
               DB_PATH=str(tmp_path / "cases.db"), AUDIT_DB_PATH=str(tmp_path / "audit.db"),
               PYTHONPATH=os.pathsep.join([str(ROOT / "api"), str(ROOT)]))
    p = subprocess.run([sys.executable, str(DRIVER), mode], cwd=ROOT / "api", env=env,
                       capture_output=True, text=True, timeout=120)
    line = [x for x in p.stdout.splitlines() if x.startswith("RESULT ")]
    assert p.returncode == 0 and line, p.stderr[-2000:]
    return json.loads(line[-1][len("RESULT "):])


def check_every_step_audited(r):
    for kind in r["events"]:
        if kind in NOT_AUDITED:
            continue
        assert kind in STEP_TO_AUDIT, f"new timeline step {kind!r} has no audit mapping; add one"
        for want in STEP_TO_AUDIT[kind]:
            assert want in r["audit"], f"timeline step {kind!r} has no {want!r} audit row: {r['audit']}"


@pytest.fixture(scope="module")
def happy(tmp_path_factory):
    return run("approve", tmp_path_factory.mktemp("approve"))


def test_happy_path_resolves_through_one_approval(happy):
    assert happy["decide_status"] == 200
    assert happy["replay_status"] == 409  # the same approval cannot be used twice
    assert happy["status"] == "resolved"
    assert happy["events"] == ["note", "classified", "evidence_gathered", "approval_requested", "approved",
                               "email_sent", "follow_up_scheduled", "reply_received", "resolved"]


def test_happy_path_every_step_in_audit_chain_in_order(happy):
    assert happy["audit"] == ["intake", "classified", "approval_requested", "approval_decided",
                              "fo_ask_authorized", "ask_fo_sent", "follow_up_scheduled", "reply_received",
                              "resolved"]
    check_every_step_audited(happy)
    assert happy["chain_ok"] is True


def test_send_is_authorized_after_human_decision(happy):
    a = happy["audit"]
    assert a.index("approval_decided") < a.index("fo_ask_authorized") < a.index("ask_fo_sent")


def test_audit_log_refuses_edits_and_chain_catches_tampering(happy):
    assert happy["update_refused"] is True
    assert happy["chain_ok_after_tamper"] is False


def test_audit_has_no_raw_claim_text(happy):
    text = happy["audit_text"]
    # Hashes, ids and timestamps are hex or digits, so "4417" can show up inside them by chance.
    # Only a standalone 4417 counts as the card digits leaking.
    assert not re.search(r"(?<![0-9A-Fa-f])4417(?![0-9A-Fa-f])", text)
    for leaked in ("STREAMFLIX", "never authorized"):
        assert leaked not in text


def test_leak_check_ignores_digits_inside_hashes():
    assert not re.search(r"(?<![0-9A-Fa-f])4417(?![0-9A-Fa-f])", '{"row_hash": "ab4417cd", "ts": 1760804417.5}')
    assert re.search(r"(?<![0-9A-Fa-f])4417(?![0-9A-Fa-f])", '{"detail": "card ending 4417"}')


def test_rejected_case_never_reaches_fo(tmp_path):
    r = run("reject", tmp_path)
    assert r["status"] == "rejected"
    assert r["audit"] == ["intake", "classified", "approval_requested", "approval_decided"]
    check_every_step_audited(r)
    assert r["chain_ok"] is True


def test_due_follow_up_escalates_and_is_audited(tmp_path):
    r = run("follow_up_due", tmp_path)
    assert r["status"] == "escalated"
    assert "follow_up_due_escalated" in r["audit"]
    assert "ask_fo_sent" not in r["audit"]  # a follow-up never sends on its own
    assert r["chain_ok"] is True
