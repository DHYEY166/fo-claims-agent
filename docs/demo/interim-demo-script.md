# Interim demo script (2:00), Sat Oct 17, 5 PM PT / 8 PM ET

Version 3, email only, rewritten at 4:05 PM ET around the team's real runs. Shown on the dashboard in live mode (`./scripts/restart.sh http://localhost:8000`).
What's real: Claude classification, the approval gate, `Trust.authorize`, double-approve blocking, low-confidence and injection escalation, redaction at intake, and the hash-chained audit log.
What's mocked: the Fo send itself, because WAJO_API_KEY isn't set yet. The case header carries a SIMULATED badge, and the narrator says so out loud.
If the key lands and fo builder posts a real Fo turn on the test inbox, swap the line marked SWAP IF REAL.

Spoken length: about 280 words at a calm pace.

---

**0:00 to 0:15. The problem** [face cam]
"You got charged twice. Your package showed up crushed. Getting that money back means forms, receipts, and chasing someone for weeks. Most people give up. We built an agent that doesn't."

**0:15 to 0:30. What it is** [case list screen]
"It's a Fo agent that files card disputes and insurance or package claims for you and follows up until they're resolved. Every problem becomes a case with its evidence and a full history."

**0:30 to 1:00. Intake and classification** [New claim, paste a test duplicate-charge email, open the case]
"I paste a test email about a duplicate charge. Claude reads it, calls it a card dispute at 95 percent confidence, picks Chase as the counterparty, and pulls out the amount, $89.99, plus the merchant, date, and order number. Each field points to the line of the email it came from, and the code, not the model, works out the deadline to file. Card numbers are masked before anything is stored."

**1:00 to 1:25. The approval gate** [Approve before action card]
"Before anything goes out, the agent stops and shows me exactly what Fo will do: who it emails, what it says, and that it spends zero dollars. Nothing is sent until I press Approve." [press Approve]
"Fo takes it from here. Tonight the send is simulated because we're still connecting our Fo key, and that's what the badge up here means." SWAP IF REAL: "Fo just emailed our test bank inbox, and here's its reply."
[timeline runs to Resolved] "The reply comes back, the case closes as resolved, and every step is on the timeline."

**1:25 to 1:45. When it should not act** [escalated case, then Audit log]
"If a claim is too vague, the agent doesn't act. It hands the case to a human. If a forwarded email hides an extra recipient, the case goes to a human and that text never reaches Fo. And approving twice still sends exactly one email. Every step lands in an audit log where each entry is chained to the one before, so a changed record shows."

**1:45 to 2:00. Next by Monday** [face cam]
"Fo already chases lost packages. We're adding the case file, the evidence, and the guardrails. By Monday: real Fo emails to our test inbox, and follow-ups that keep going until the case is closed. Thanks."

---

## Rubric map
| Beat | Rubric line | Backed by |
|---|---|---|
| Problem | Real need (10) | The everyday pain of disputes and claims |
| Intake and classification | Agent craft (20) | Live Claude run: card dispute at 95%, Chase, $89.99, evidence fields (fo builder, classify.v2 on 76039ad); line citations on 7 of 8 fields and a code-computed filing deadline (fo builder, 76039ad, STREAMFLIX run) |
| Approval gate | Trust by design (20) | Approve card, `Trust.authorize`, $0 spend shown; double approve gets 409 (fo trust qa, 9 of 9 API tests) |
| Escalation and audit | Trust by design (20) | Vague claim at 0.10 escalated; injection flagged and escalated; `chain_ok: true` |
| Fo send | Gets real things done (25) | Simulated tonight; real once the key is in |
| Follow-ups until resolved | Pushes the frontier (25) | Planned for Monday; say "next", not "done" |

## Don't say tonight
- Anything about phone calls. The demo is email only, by Dhyey's decision.
- That Fo sent a real email (not until a real run is posted).
- More than the tests show: pasted text never reaches Fo, card numbers are masked before storage, double approvals are blocked (fo trust qa, 9 of 9 live API tests on 60ab500).
- The real test bank address. On screen and aloud it is only "test bank inbox".
- A valid signed webhook getting through (webhook secret isn't set yet).
- Any user numbers or recovery amounts.
