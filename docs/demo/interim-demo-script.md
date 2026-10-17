# Interim demo script (2:00) - Sat Oct 17, 5 PM PT / 8 PM ET

Spoken length: about 280 words, roughly 2:00 at a calm pace. Brackets are stage directions.
Lines marked FILL IN must be swapped for what the team actually ran by 5 PM PT. If a step hasn't run, cut it and say "next" instead.

---

**0:00 to 0:15. The problem** [face cam or title slide]
"You got charged twice. Your package never showed. Your insurer wants a form, a receipt, and three follow-up calls. Most people give up and eat the money. We're building the agent that doesn't give up."

**0:15 to 0:35. What it is** [one slide with the one-liner]
"It's a Fo agent that files card disputes and insurance or package claims for you and follows up until they're resolved. You describe what went wrong once. It turns that into a case with the evidence attached, files it by email or phone through Fo, and keeps chasing on a schedule until there's an answer."

**0:35 to 1:20. The live case flow** [screen share of the dashboard: submit, case list, timeline]
Test data only. Say "mock" out loud for any step still on mock data.
1. "Here's a test card-dispute email. I paste it in." [submit screen]
2. "Claude classifies it as a card dispute and pulls out the merchant, amount, and date." [timeline: classified, evidence ready. FILL IN the real fields shown]
3. "The case shows up in the list with its status, and the timeline shows every step." [case list, then timeline]

**1:20 to 1:40. The approval gate** [timeline: awaiting approval card]
"Before Fo contacts anyone, the agent stops and shows me exactly what it will send and to whom. Nothing goes out until I press Approve." [press Approve]
"Then Fo takes over." [timeline fills in: call transcript and email, reply, follow-up scheduled, resolved]
If these steps are still on mock data, say it plainly: "From here the dashboard is on mock data. Tonight we're wiring it to real Fo turns on a test inbox." Swap that line for the real run (FILL IN) once fo builder has one.
Trust controls beyond the gate stay FILL IN until fo trust qa confirms them.

**1:40 to 2:00. Next by Monday** [back to face cam]
"Fo already chases lost packages. We're adding one case file per problem, evidence that travels with it, and follow-ups that keep going until it's resolved. By Monday: [FILL IN from fo lead's plan, e.g. scheduled follow-ups and insurance and package claims]. Thanks!"

---

## Rubric map (what each beat earns)
| Beat | Rubric line | Claim it supports |
|---|---|---|
| Problem | Real need (10) | People drop disputes and claims because the follow-up is tedious |
| What runs today | Gets real things done (25) | A real Fo email or call on test data, shown end to end |
| Case record and webhook status | Agent craft (20) | Structured case, evidence, state that updates on Fo replies |
| Trust by design | Trust by design (20) | Approval before send, logged actions, test data only |
| Follow-ups until resolved | Pushes the frontier (25) | Multi-step work that runs over days, not one reply |

## Facts I relied on (from the Fo docs notes, not from our build)
- Fo's own tool description says it "can read and send their email, manage their calendar, place calls, make purchases".
- Fo webhooks send a `conversation.reply` event when a conversation gets a reply, and a `schedule.fired` event exists.
- Wajo posted on Sep 18 that Fo already recovers lost packages, so the demo leans on case tracking and multi-domain claims to stand out.

## What I need from the team before 5 PM PT
1. fo builder: did a real Fo email or call go out on test data? Which one, and can I get a screen recording or screenshot?
2. fo builder: is the webhook wired so a reply updates case status?
3. fo trust qa: the exact trust controls that are actually built (approval step, logging, data rules).
4. fo frontend: what screen we're showing (case view, input box).
