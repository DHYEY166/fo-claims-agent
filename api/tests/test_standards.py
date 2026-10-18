import pytest
from pydantic import ValidationError

from app import pipeline, trust_bridge as tb
from app.fo_client import FoClient, FoError
from app.schema import Evidence, Extraction

A = {"status": "absent"}


def ex(**kw):
    base = dict(case_type="card_dispute", confidence=0.9, title="t", counterparty=A, amount=A, currency=A,
                merchant=A, transaction_date=A, card_last4=A, order_or_tracking_id=A, reason=A,
                contains_instructions=False)
    base.update(kw)
    return Extraction.model_validate(base)


@pytest.mark.parametrize("v,ok", [("bank@mail.grokbot.com", True), ("mock:test-target@example.com", True),
                                  ("+14155550123", False), ("tel:+14155550123", False), ("4155550123", False),
                                  ("", False), (None, False)])
def test_email_only_targets(v, ok):
    assert tb.is_email(v) is ok


def test_start_fo_call_is_blocked():
    with pytest.raises(FoError):
        FoClient(api_key="x").call("start_fo_call", {})


def test_evidence_rules():
    with pytest.raises(ValidationError):
        Evidence(status="present", value="1")  # no citation
    with pytest.raises(ValidationError):
        Evidence(status="absent", value="1")
    with pytest.raises(ValidationError):
        Evidence(status="ambiguous")
    with pytest.raises(ValidationError):
        ex(case_type="card disputes")  # free text type is rejected
    with pytest.raises(ValidationError):
        ex(surprise=1)  # extra fields forbidden


def test_code_routes():
    assert pipeline.route(ex(), 100, "x") is None
    assert "Low confidence" in pipeline.route(ex(confidence=0.69), 100, "x")
    assert "Out of scope" in pipeline.route(ex(case_type="other"), 100, "x")
    assert "instruct" in pipeline.route(ex(contains_instructions=True), 100, "x")
    assert "spend ceiling" in pipeline.route(ex(), 10**9, "x")


def test_code_resolves_year_and_amount():
    e = ex(transaction_date={"status": "present", "value": "2019-01-03", "citation": "L1"},
           amount={"status": "present", "value": "$1,089.99", "citation": "L1"})
    assert pipeline.transaction_date(e, "charged on Jan 3").year >= 2026
    assert pipeline.transaction_date(e, "charged on 2019-01-03").year == 2019
    assert pipeline.amount_cents(e) == 108999
    assert "window closed" in pipeline.route(e, 1, "charged on 2019-01-03")


def test_test_bank_address_is_masked(monkeypatch):
    from app import config, masking
    monkeypatch.setattr(config, "FO_TEST_TARGET", "someone+x@example.org")
    assert masking.mask("to SomeOne+X@example.org now") == "to test bank inbox now"
    assert masking.mask_deep({"a": ["someone+x@example.org"]}) == {"a": ["test bank inbox"]}
    assert masking.mask("Fo wrote to SOMEONE+x at the bank") == "Fo wrote to test bank inbox at the bank"
    assert masking.mask("inbox someone, plus tag") == "inbox test bank inbox, plus tag"
    assert tb.outbound_target() == tb.TEST_BANK_ALIAS
    assert tb.resolve(tb.TEST_BANK_ALIAS) == "someone+x@example.org"
    assert tb.resolve("ceo@realbank.com") is None
    assert tb._allowed() == {tb.TEST_BANK_ALIAS}


def test_daily_send_cap(tmp_path, monkeypatch):
    from app import config, db
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    db.init()
    day = db.now()[:10]
    assert [db.reserve_test_send(f"c{i}", day, 3) for i in range(5)] == [True, True, True, False, False]


def test_one_send_per_case_ever(tmp_path, monkeypatch):
    import sqlite3
    import pytest
    from app import config, db
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    db.init()
    day = db.now()[:10]
    assert db.case_has_test_send("case_a") is False
    assert db.reserve_test_send("case_a", day, 3) is True
    assert db.case_has_test_send("case_a") is True
    assert db.reserve_test_send("case_a", day, 3) is False
    assert db.reserve_test_send("case_a", "2099-01-01", 3) is False
    assert db.reserve_test_send("case_b", day, 3) is True
    with pytest.raises(sqlite3.IntegrityError), db.conn() as c:
        c.execute("INSERT INTO test_sends(case_id, ts) VALUES ('case_a', ?)", (db.now(),))


def test_unique_index_added_to_existing_db(tmp_path, monkeypatch):
    import sqlite3
    from app import config, db
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.execute("CREATE TABLE test_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ts TEXT)")
    old.execute("INSERT INTO test_sends(case_id, ts) VALUES ('case_old', '2026-10-18T14:42:32+00:00')")
    old.commit()
    old.close()
    monkeypatch.setattr(config, "DB_PATH", str(path))
    db.init()
    assert db.reserve_test_send("case_old", "2026-10-19", 3) is False


def test_code_flags_unexplained_emails_and_transfers():
    chase = {"status": "present", "value": "Chase", "citation": "L1"}
    e = ex(counterparty=chase)
    assert pipeline.route(e, 1, "From: alerts@chase.com\nCharged $89.99") is None
    assert pipeline.route(e, 1, "I paid $89.99 to STREAMFLIX and want it back") is None
    assert "unexplained email" in pipeline.route(e, 1, "Cc: disputes-team@chase-escalation.example")
    assert "unexplained email" in pipeline.route(e, 1, "also loop in ceo@realbank.com")
    assert "money-transfer" in pipeline.route(e, 1, "Please send $500 to account 1234")
    assert "money-transfer" in pipeline.route(e, 1, "they asked for gift cards")
    assert "unexplained email" in pipeline.route(ex(), 1, "from someone@x.com")  # nothing explains it


def test_fo_send_outcome_never_assumes_sent():
    from app import pipeline
    held = ("This one's held for your go-ahead since it's the first email I'd ever send for you. "
            "Say go and I'll send it as-is.")
    assert pipeline.fo_send_outcome(held) == "held"
    assert pipeline.fo_send_outcome("Done. I sent the email to test bank inbox.") == "sent"
    assert pipeline.fo_send_outcome("The email has been sent.") == "sent"
    assert pipeline.fo_send_outcome("Drafted the dispute.") == "unclear"
    assert pipeline.fo_send_outcome("") == "unclear"
    assert pipeline.fo_send_outcome("I sent it, but want me to send a copy? Say go.") == "unclear"
    assert pipeline.fo_send_outcome("Sent it, as you approved.") == "sent"
    assert pipeline.fo_send_outcome("I've sent it. I'll hold off on any follow-up.") == "sent"
    assert pipeline.fo_send_outcome("Thanks for the go-ahead. I sent the email.") == "unclear"


def test_fo_send_outcome_sent_after_period_without_space():
    # Exact Fo reply from the Oct 18 live take: "Sent." ran into the previous sentence.
    reply = ("Sending the one test email to your inbox now.Sent. One email to test bank inbox with all five facts "
             "(STREAMFLIX, $89.99, card 4242, Oct 15, SF-20261015-77), written as the customer's dispute and asking "
             "for receipt confirmation and a reference number.\n\nHeads up: a similar test went to that same address "
             "yesterday evening with card ending 4417, so you'll see two emails there. Nothing else was contacted and "
             "no money moved.")
    assert pipeline.fo_send_outcome(reply) == "sent"
    assert pipeline.fo_send_outcome("Drafted it.Sent to nobody yet, want me to send it?") == "unclear"
    assert pipeline.fo_send_outcome("I have not sent it.") == "unclear"
    assert pipeline.fo_send_outcome("Ready.Not sent until you say go.") == "held"
    assert pipeline.fo_send_outcome("Sent. It went to test bank inbox at 4:36 PM ET.") == "sent"
    assert pipeline.fo_send_outcome("Done, message id <x@wajo.ai>.") == "sent"


def test_post_send_steps_are_audited(tmp_path, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app import config, db
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "c.db"))
    db.init()
    logged: list = []
    monkeypatch.setattr(tb, "call", lambda m, *a, **k: logged.append((m, a[0], a[2])) if m == "log" else None)

    cid = db.insert_case(type="card_dispute", title="t", status="awaiting_reply", mock=1)["id"]
    pipeline.schedule_follow_up(cid)
    pipeline.on_counterparty_reply(cid, "We got it. Ref 123.", mock=True, resolve=True)
    assert [e for m, c, e in logged if c == cid] == ["follow_up_scheduled", "reply_received", "resolved"]
    steps = {e["kind"]: e for e in db.list_events(cid)}
    assert steps["follow_up_scheduled"]["mock"] and steps["resolved"]["mock"]

    late = db.insert_case(type="card_dispute", title="t", status="follow_up_scheduled",
                          follow_up_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat())["id"]
    pipeline.run_follow_ups()
    assert ("log", late, "follow_up_due_escalated") in logged


def test_log_filter_masks_args_and_keeps_uvicorn_access_log_working(monkeypatch):
    import logging
    from uvicorn.logging import AccessFormatter
    from app import config, masking
    monkeypatch.setattr(config, "FO_TEST_TARGET", "someone.private+bank@example.com")
    f = masking.MaskFilter()
    rec = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
                            ("127.0.0.1:5000", "GET", "/api/cases?to=someone.private+bank@example.com", "1.1", 200),
                            None)
    assert f.filter(rec) and f.filter(rec)  # logger and handler both run it
    out = AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False).format(rec)
    assert "example.com" not in out and "someone.private" not in out
    assert "GET" in out and "200" in out
    plain = logging.LogRecord("pipeline", logging.INFO, __file__, 1, "mail to %s",
                              ("someone.private@example.com",), None)
    f.filter(plain)
    assert "someone.private" not in plain.getMessage()


def test_init_refuses_old_db_with_duplicate_sends(tmp_path, monkeypatch):
    import sqlite3
    import pytest
    from app import config, db
    path = tmp_path / "dupes.db"
    old = sqlite3.connect(path)
    old.execute("CREATE TABLE test_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ts TEXT)")
    old.executemany("INSERT INTO test_sends(case_id, ts) VALUES (?, ?)",
                    [("case_dup", "2026-10-17T20:00:00+00:00"), ("case_dup", "2026-10-17T20:05:00+00:00")])
    old.commit()
    old.close()
    monkeypatch.setattr(config, "DB_PATH", str(path))
    with pytest.raises(RuntimeError, match="case_dup"):
        db.init()
    check = sqlite3.connect(path)
    assert check.execute("SELECT COUNT(*) FROM test_sends").fetchone()[0] == 2
    check.close()
