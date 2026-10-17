# Interim demo script (2:00), Sat Oct 17, 5 PM PT / 8 PM ET

Version 4, one live email. Dhyey approved one real email to the test bank inbox, sent live on stage.

Setup (open before 8 PM ET / 5 PM PT, restart nothing):
- Tab 1, main: the dashboard on `:3101`, pointed at `:8020` (real Fo through OAuth, `FO_MOCK=0`). The email step carries a LIVE badge.
- Tab 2, fallback: the dashboard on `:3100`, pointed at `:8000` (`FO_MOCK=1`). The email step carries an amber MOCK badge.
- Never open the test bank's mail app on screen, because it shows the real address. Show Fo's side on the case timeline only. On screen and aloud it is only "test bank inbox".

What's real: Claude classification, the approval gate, `Trust.authorize`, double-approve blocking, escalation, redaction at intake, the hash-chained audit log, and on Tab 1 the Fo email to the test bank inbox.
Sends left tonight: exactly 2 under the 3-a-day cap. One is the 7:30 PM ET / 4:30 PM PT rehearsal and one is on stage. Approve once only.
On Tab 1, start a fresh case. Don't open the leftover test cases (`case_d26856e7c2` and the old `follow_up_scheduled` one), because they were never live sends.

Spoken length: about 290 words at a calm pace.

---

**0:00 to 0:15. The problem** [face cam]
"You got charged twice. Your package showed up crushed. Getting that money back means forms, receipts, and chasing someone for weeks. Most people give up. We built an agent that doesn't."

**0:15 to 0:30. What it is** [Tab 1, case list]
"It's a Fo agent that files card disputes and insurance or package claims for you and follows up until they're resolved. Every problem becomes a case with its evidence and a full history."

**0:30 to 0:55. Intake and classification** [Tab 1, New claim, paste the test duplicate-charge email, open the case]
"I paste a test email about a duplicate charge. Claude reads it, calls it a card dispute at 95 percent confidence, picks Chase as the counterparty, and pulls out the amount, $89.99, plus the merchant, date, and order number. Each field points to the line of the email it came from, and the code, not the model, works out the deadline to file. Card numbers are masked before anything is stored."

**0:55 to 1:25. Approve, Fo sends, reply** [Tab 1, Approve before action card]
"Before anything goes out, the agent stops and shows me exactly what Fo will do: who it emails, what it says, and that it spends zero dollars. Nothing is sent until I press Approve, and real sends to the test inbox are capped at 3 a day in code." [press Approve once]
"This is live. We're connected to real Fo through OAuth, and Fo is writing the email to our test bank inbox now." [wait for Fo's step on the timeline, up to about 90 seconds; rehearsal took 62. The small green "Live" dot at top right only means the dashboard is connected; it is not the send]
Read the Fo step, then follow the branch it shows.

Main flow (expected: after the 4:36 PM ET / 1:36 PM PT rehearsal, Fo said it won't hold emails we explicitly request, so our single Approve is the gate):
- When the step shows sent (LIVE badge, "sent to test bank inbox", confirmed by the backend): "Fo sent it to our test bank inbox. The bank's reply lands in the test inbox, and the agent keeps the case open until it's resolved."

Fallback 1, Fo holds anyway (amber "HELD BY FO: waiting for go-ahead", "Nothing has been sent yet"):
- If a "Give Fo the go-ahead" approval is offered (only if `99d042b` passed trust qa's review and is live on `:8020`): "Fo drafted it and is holding it until I say go. That's a second approval, on Fo's side." [press it once] Say "Fo sent it to our test bank inbox" only when the step shows a confirmed send.
- If no go-ahead approval is offered, or no confirmed send about 90 seconds after it: stop at the held step and say "Fo drafted it and is holding it until I say go. That's a second approval, on Fo's side." [point at the "Fo reported" block] Press nothing else, don't say go to Fo on stage, and don't mention follow-ups for this case.

Last fallback: the MOCK tab (see below).
Never say "emailing right now" or "sent" until the timeline shows a confirmed send.
Don't say the reply shows on the timeline. With no webhook tunnel tonight, it won't.

**1:25 to 1:45. When it should not act** [Tab 2 for the escalated case, then Tab 1 Audit log]
"If a claim is too vague, the agent doesn't act. It hands the case to a human. The same happens if a forwarded email hides an extra recipient, so that address never reaches Fo. And approving twice still sends exactly one email. Every step, including what Fo just did, lands in an audit log where each entry is chained to the one before, so a changed record shows."

**1:45 to 2:00. Next by Monday** [face cam]
"Fo already chases lost packages. We're adding the case file, the evidence, and the guardrails. By Monday: follow-ups that keep going until the case is closed. Thanks."

**If the live step fails on stage** (no Fo step on the timeline after about 90 seconds, or an error; a held draft is not a failure, use the Fo held line). A later "No webhook or reply arrived" escalation is not a failure, it's the honest state with no tunnel: don't press Approve again, because that spends a send. Switch to Tab 2 and open a case that's already resolved there. Say: "The live send didn't come through just now, so here's the same flow on our mock run, which is labeled MOCK. We did send one live email at rehearsal." Only say that last sentence if fo trust qa confirms with get_fo_conversation that the rehearsal email (case_cbd0d1cf1a, after Dhyey said go) was sent.

---

## Rubric map
| Beat | Rubric line | Backed by |
|---|---|---|
| Problem | Real need (10) | The everyday pain of disputes and claims |
| Intake and classification | Agent craft (20) | Live Claude run: card dispute at 95%, Chase, $89.99, evidence fields (fo builder, classify.v2 on 76039ad); line citations on 7 of 8 fields and a code-computed filing deadline (fo builder, 76039ad, STREAMFLIX run) |
| Approval gate | Trust by design (20) | Approve card, `Trust.authorize`, $0 spend shown; double approve gets 409 (fo trust qa, 9 of 9 API tests); 3-a-day send cap (fo trust qa, cb675b4, 3 passed, tests the cap function directly) |
| Escalation and audit | Trust by design (20) | Vague claim at 0.10 escalated; injection flagged and escalated; `chain_ok: true` |
| Fo send | Gets real things done (25) | Real Fo through OAuth; PONG round trip passed in 12.9 s (fo builder, `:8020`); one live email to the test bank inbox, approved by Dhyey (fill in from fo trust qa's 7:30 PM ET rehearsal check) |
| Follow-ups until resolved | Pushes the frontier (25) | Planned for Monday; say "next", not "done" |

## Don't say tonight
- Anything about phone calls. The demo is email only, by Dhyey's decision.
- That the reply shows on the dashboard, or that the live case resolved. The reply only lands in the test inbox tonight.
- Anything about the live send before it has actually happened on screen.
- More than the tests show: a hidden extra recipient never reaches Fo, card numbers are masked before storage, double approvals are blocked (fo trust qa, 9 of 9 live API tests on 60ab500).
- The real test bank address. On screen and aloud it is only "test bank inbox".
- A valid signed webhook getting through (webhook secret isn't set yet).
- Any user numbers or recovery amounts.
