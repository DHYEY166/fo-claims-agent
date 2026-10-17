# Presenter cheat sheet, interim demo (2:00)
Sat Oct 17, 8 PM ET / 5 PM PT. Tonight's demo is optional (it's for hardware teams). Dhyey decides whether we present. The full script is `interim-demo-script.md`.

## Before you start
- **Tab 1 (main):** `localhost:3101`, live Fo. The email step has a LIVE badge.
- **Tab 2 (fallback):** `localhost:3100`, mock. The email step has an amber MOCK badge.
- **Restart nothing.** Keep only these two tabs open.
- **Never open these on screen:** the mail app, the Fo conversation in Claude, or `.env`.

## Cases to skip
- **On Tab 1:** don't open `case_cbd0d1cf1a` (rehearsal) or `case_d26856e7c2` (old mock). Always start a fresh case.
- **On Tab 2:** the list has 35 old SIMULATED test cases, 11 of them waiting on approval. Don't browse the list or press Approve on any of them. If you need a mock case, start a fresh claim from New claim and work from that case's own page. Open the escalated case and the resolved case only when the script calls for them.

## Button order
1. On Tab 1, click **New claim**. Paste the test duplicate-charge email, submit, and open the new case.
2. Walk through the classification: card dispute, 95%, Chase, $89.99, with citations.
3. Press **Approve** on the "Approve before action" card. **Press it once only.**
4. Wait up to about 90 seconds for Fo's step. The green "Live" dot only means the dashboard is connected. It isn't the send.
5. Read the Fo step and pick the matching row in the table below.
6. Open the escalated case on Tab 2, then open the **Audit log** on Tab 1.
7. Close on face cam.

## What the Fo step shows, and what to do
| On screen | Say | Press |
|---|---|---|
| "Fo drafted email to test bank inbox" | Nothing new. Keep waiting. | Nothing |
| LIVE, "Sent to test bank inbox" | "Fo sent it to our test bank inbox. The bank's reply lands in the test inbox, and the agent keeps the case open until it's resolved." | Nothing |
| HELD BY FO, and a "Give Fo the go-ahead" card is offered | "Fo drafted it and is holding it until I say go. That's a second approval, on Fo's side." | The go-ahead, **once**. Say sent only after "Sent to test bank inbox" shows. |
| HELD BY FO, and no go-ahead card, or no send 90 seconds after the go-ahead | The same held line. | Nothing more. Don't mention follow-ups. |
| UNCONFIRMED, "Couldn't confirm Fo sent the email" | "Fo answered, but it didn't clearly say it sent the email. So the agent won't guess. It escalates the case to me instead of marking it sent." | Nothing |
| Still no Fo step after about 90 seconds, or an error | Switch to Tab 2 and open a resolved case: "The live send didn't come through just now, so here's the same flow on our mock run, which is labeled MOCK. We sent one live email at rehearsal, and it arrived in the test inbox." | **Never Approve again.** |

A later "No webhook or reply arrived" escalation is expected, because there's no tunnel tonight. It isn't a failure.

## Never say
- "Sent" or "emailing right now" before the timeline shows a confirmed send.
- That the reply shows on the dashboard, or that the live case resolved.
- Anything about phone calls, user numbers, or recovery amounts.
- That a signed webhook works.
- The real test bank address. It's only ever the "test bank inbox".
- That follow-ups are done. They're "next, by Monday".
