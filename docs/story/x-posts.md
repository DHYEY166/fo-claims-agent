# X: quote-repost and thread (drafts for Dhyey to post)

When: quote-repost Shivani's (@shivanipod) 10:00 AM PT post on Mon Oct 19, between 1:00 and 1:15 PM ET (10:00 to 10:15 AM PT). Attach the final video to the quote-repost itself. Post the thread as replies to your own quote-repost right after.

**Verify before posting:** none of us has confirmed the handles @shivanipod, @wajo_ai, @hey__fo and @claudeai (and @AnthropicAI if added). Check each one on X on Monday before posting.

Replace `[REPO]` with https://github.com/DHYEY166/fo-claims-agent before posting. Character counts are for the text as written, with an X link counted as 23.

## Quote-repost (with the video attached)

```
Charged twice? Our Fo agent files the dispute for you.

Paste the email. Claude builds the case with cited evidence. You approve. Fo sends it. If the bank goes quiet, it flags you and asks before any follow-up.

Built for the @wajo_ai GSD hackathon with @hey__fo @claudeai 🧵
```

## Thread (replies under the quote-repost)

**2/**
```
Fo already chases lost packages. We added what a claim needs on top: a case file, evidence for every field, and a person approving every message.

Card disputes, insurance claims and package claims all go through the same flow.
```

**3/**
```
Claude reads your claim and fills in the case: who to contact, amount, merchant, date, order number.

Each field cites the line it came from. The filing deadline is computed in code, not guessed. Card numbers are masked before anything is stored.
```

**4/**
```
Nothing goes out until you click Approve. The card shows who Fo will email, what it says, and what it costs.

A vague claim, an email address nothing explains, or a request to move money sends the case to a person. Approving twice still sends one email.
```

**5/**
```
It only marks an email sent when Fo confirms it. If Fo holds it for a second yes, the card shows that. If Fo's reply is unclear, it escalates instead of guessing.

Every outbound action, plus the follow-up, reply and resolution, goes in a hash-chained audit log.
```

**6/**
```
The video shows one real email sent through Fo over OAuth to our test bank inbox, using test data. Real sends are capped at 3 a day in code, and 78 automated tests pass in CI.

Code: [REPO]

A like on the quote post helps us in community voting.
```

## Rubric map

| Post | Claim | Rubric | Source |
|---|---|---|---|
| Quote | Files the dispute, Fo sends it | Gets real things done (25) | Live take on `:8020` (video) |
| Quote, 2 | Fo agent with case file and approvals | Pushes the frontier (25) | README, pitch |
| 3 | Line citations, code deadline, masking | Agent craft (20) | `classify.v2`, interim rubric map |
| 4 | Approval card, escalations, double approve sends one | Trust by design (20) | `pipeline.route`, interim rubric map |
| 5 | Sent only when Fo confirms, held and unclear states, audit chain | Trust by design (20) | `fo_send_outcome` tests, `trust/gate.py` |
| 6 | One real email, 3 a day cap, 78 tests | Gets real things done (25) | `MAX_TEST_SENDS_PER_DAY = 3`, CI on f68d015 |
| Quote | Charged twice | Real need (10) | |

Update the test count in post 6 if feature/trust-tests merges before posting. If the live take ends in HELD or UNCONFIRMED instead of sent, rewrite post 6 to match what the video shows.
