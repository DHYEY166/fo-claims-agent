# Fo Claims Agent

[![CI](https://github.com/DHYEY166/fo-claims-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/DHYEY166/fo-claims-agent/actions/workflows/ci.yml)

A Fo agent that files card disputes and insurance or package claims for you, and hands the case back to you if the bank stays quiet. Nothing is sent until you approve it.

Built for the Wajo GSD hackathon on [Fo](https://wajo.ai), Wajo's action agent, with Claude.

[![Watch the 89-second demo](docs/video/demo-thumbnail.png)](docs/video/demo.mp4)

**[Watch the 89-second demo](docs/video/demo.mp4)** (narrated with an AI voiceover). <!-- DEMO_LINK -->

**[Live demo (demo data only)](https://fo-claims-agent.vercel.app/)**: the dashboard on Vercel with sample cases. Nothing is sent from it.

## What is this?

Getting money back is tedious. You have to find the receipt, work out who to contact, write the email, keep track of the deadline and chase the reply. Plenty of people never bother, even when they're owed the money. Fo can already make calls and send emails for you. This project adds what a claim needs on top of that: a case file, evidence for every field, and a person approving every message before Fo sends it.

### What it does

1. **Takes the claim.** You paste the email or describe what happened in the web dashboard.
2. **Builds a case.** Claude reads it and fills in a case: the kind of claim (card dispute, insurance or package), who to contact, the amount, the merchant, the date and the order number. Each field cites the line it came from, the filing deadline is computed in code instead of guessed, and valid card numbers are masked before anything is stored.
3. **Stops when it should.** A claim that's too vague, an email address nothing in the claim explains, or a request to move money sends the case to a person instead of moving ahead.
4. **Asks before acting.** Every outbound email shows up as an approval card: who Fo will contact, what it will say, and what it costs. Nothing goes out until you click Approve.
5. **Sends through Fo.** The approved email goes out through Fo's MCP server, which this app connects to over OAuth. The agent reads Fo's reply and marks the email sent only when Fo confirms it. If Fo holds the email for a second go-ahead, the card says so. If Fo's reply is unclear, the case goes to a person and is never marked sent.
6. **Asks before one follow-up.** After sending, it starts a follow-up timer. If no reply has come in when the timer runs out, the agent drafts one follow-up email to the same inbox and shows it as a new approval card. Nothing is sent until you approve it. If you reject it, or the bank stays quiet after it, the case comes back to you. Each case gets at most one follow-up.

Every outbound action, plus the follow-up timer, the follow-up draft and your decision on it, the reply and the resolution, goes into an audit log where each entry is chained to the one before it.

### How it works

```mermaid
flowchart LR
  A[Claim text] --> B[Claude classifier<br/>fields + line citations]
  B --> C{Route checks}
  C -- vague, unexplained address,<br/>money transfer --> H[Handed to a person]
  C -- ok --> D[Approval card]
  D -- Approve --> E[Fo via MCP + OAuth]
  E --> F{Fo's reply}
  F -- sent --> G[Follow-up timer]
  F -- held --> D
  F -- unclear --> H
  G -- no reply when due --> I[One follow-up draft]
  I -- Approve --> E
  I -- rejected, or still no reply --> H
```

- `api/`: FastAPI backend with SQLite. It holds the classifier (prompt `api/prompts/classify.v2.md`), the pipeline and its route checks, the Fo client and OAuth flow, and webhook signature checks.
- `trust/`: the approval gate, redaction, and the hash-chained audit log.
- `web/`: Next.js dashboard (case list, new claim, case timeline with approval cards, audit log). It runs against the real backend or an in-memory mock that shows a MOCK DATA badge.
- `tests/`: trust and safety tests. `docs/`: the trust spec and the demo video.

### Trust by design

The agent drafts and reasons, but code decides what is allowed to leave the computer. Every rule below lives in `trust/` and `api/app/pipeline.py`, not in a prompt, and each one has a test.

**You approve every outbound action.** Nothing goes to Fo until you click Approve on the exact email the agent drafted. The approval is tied to a hash of the case, the action, the recipient and the message text. If any of those change after you approve, the send is refused (`action_changed_after_approval`). An approval works once (a second use gets 409) and expires after 15 minutes. A card nobody approves in time closes, nothing is sent from it, and the case comes back to you. A late click gets 409. Reject stops the case before Fo is ever contacted.

**Email only, to one allowed inbox.** For the demo the agent can email exactly one address: our own private test bank inbox. Phone calls and every other recipient are blocked by the trust gate, and the block is written to the audit log. The real address is kept only in `.env`. The dashboard, the database, the audit log and the API all show an alias instead. The address is swapped in only in the one outbound message to Fo.

**No money moves.** The spend limit is \$0, so any action that tries to spend is blocked. The agent never asks Fo for a single-use card. A separate hard cap allows at most 3 real emails to the test bank inbox per UTC day, and each approved case gets one send, plus at most one follow-up that you approve separately, and there are no automatic retries.

**An audit log where each entry is chained to the one before it.** Each of these is logged as a row in an append-only SQLite log: intake, classification, approval requested, your decision, the send authorization, the Fo request, follow-up scheduled, follow-up drafted, approved or rejected, reply received and resolution. Blocks and escalations get rows too. Each row is hash-chained to the one before it. The database refuses edits and deletes, and if someone gets around that and changes a row, the chain check fails. An end-to-end test (`tests/trust/test_audit_chain_e2e.py`) runs a real case through the API and confirms all of this. The one step without a row is evidence gathering, which is internal and sends nothing.

**Forwarded emails are treated as data, not instructions.** Pasted or forwarded text reaches the model wrapped as untrusted input. If the model reports that the text tries to instruct the agent, the case goes to a human. Code also checks the raw text, without relying on the model, for email addresses or money-transfer instructions (wire, Zelle, gift cards, crypto and similar) that the claim doesn't explain, and escalates if it finds any. After Fo's turn, the agent checks Fo's conversation for any recipient besides the allowed inbox. If it finds one, the case is marked failed.

**PII stays out of storage.** Valid card numbers (ones that pass the standard checksum), SSNs and API keys are redacted before the claim text is saved. Email addresses are masked in the database, the API and server logs. Only the last 4 digits of a card are kept.

**Locked to this computer.** Fo sign-in and the approve and reject routes only answer a browser on this machine. Requests through a proxy or tunnel (forwarded headers, or a Host other than localhost) get 403.

**Signed webhooks.** Fo webhooks are verified with Standard Webhooks HMAC signatures, which allow 5 minutes of clock skew. Duplicate webhook ids are ignored, and an unsigned or badly signed request gets 401.

**When unsure, it hands off to a person.** The case goes to a human, not to the bank, in any of these situations:
- Classifier confidence is below 0.7.
- The claim type is out of scope.
- The filing window has closed.
- The case passed its model token budget.
- Fo asks a question.
- Fo says it is holding the email for a go-ahead.
- The daily cap is reached.
- An approval card expires before anyone clicks it.
- An extracted value doesn't match the line it cites, or a citation covers more than 3 lines in total. An amount must equal a money amount on the cited line to the cent, so "$780" matches 780.00 but "order 780" does not.
- You reject the follow-up, or the bank stays quiet after it.

The follow-up timer never sends anything on its own. It only drafts the one follow-up, which needs your approval like any other send and counts toward the daily cap of 3.

**Honest failure states.** The dashboard says what actually happened:
- If Fo's reply doesn't clearly say the email went out, the case says "Couldn't confirm Fo sent the email" and no follow-up timer is started.
- If Fo is still working after 10 minutes, the case escalates.
- If Fo's turn fails, the case is marked failed.
- If a case sits in contacting for 15 minutes with no result, it escalates.

Mock mode is always labeled MOCK.

## How do I run it?

You need Python 3 and Node.js. Everything runs locally.

```bash
git clone https://github.com/DHYEY166/fo-claims-agent.git
cd fo-claims-agent
cp api/.env.example .env      # the backend reads .env from the repo root; never commit it
```

Leave `FO_MOCK=1` to try it without any keys. Fo is simulated, and every simulated event is marked mock.

```bash
# backend on :8000
cd api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000

# dashboard on :3100, in a second terminal
cd web
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
```

Run `npm run dev` without `NEXT_PUBLIC_API_BASE` to get the dashboard's built-in mock data and skip the backend entirely.

**Using real Fo.** Set `ANTHROPIC_API_KEY`, set `FO_TEST_TARGET` to a test inbox you own (it's the only address Fo will ever be asked to contact), set `FO_MOCK=0`, then open `http://localhost:8000/oauth/start` to connect your Fo account. Tokens are written only to the gitignored `.env`. Real sends are capped at 3 a day in code (`MAX_TEST_SENDS_PER_DAY`).

## How do I run the tests?

226 automated tests pass in CI (mock mode), including end-to-end mock runs of package claims (damaged, lost and late), insurance claims (renters and travel) and edge cases such as injection text and stray money-transfer requests. These are the same commands the pipeline runs, from the repo root:

```bash
pip install -r api/requirements.txt -r tests/trust/requirements.txt pytest flake8 mypy
FO_MOCK=1 python -m pytest -q --ignore=tests/trust/test_api_live.py
python -m flake8 .
python -m mypy
```

CI also scans the full history for secrets with gitleaks and builds the dashboard (`cd web && npm ci && npm run build`).

## What configuration does it need?

The backend reads `.env` from the repo root (set `ENV_FILE` to point somewhere else). Start from `api/.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `FO_MOCK` | `1` | `1` simulates Fo. Real Fo needs `FO_MOCK=0` plus Fo auth (a `WAJO_API_KEY` or the OAuth token from `/oauth/start`); without auth it stays mock. |
| `FO_TEST_TARGET` | empty | The one test inbox Fo may email. Required before `FO_MOCK=0`. |
| `ANTHROPIC_API_KEY` | empty | Claude key for the classifier. |
| `WAJO_API_KEY` | empty | Optional Fo API key (`wak_...`), as an alternative to OAuth. |
| `FO_MCP_URL` | `https://mcp.api.wajo.ai/fo` | Fo's MCP endpoint. |
| `FO_WEBHOOK_SECRET` | empty | Secret for verifying Fo webhook signatures. |
| `CORS_ORIGINS` | `http://localhost:3100` | Allowed dashboard origins, comma separated. |
| `DB_PATH` | `api/cases.db` | SQLite file for cases. |
| `AUDIT_DB_PATH` | `audit.db` next to `DB_PATH` | Audit log file. |
| `CONFIDENCE_THRESHOLD` | `0.7` | Below this, the case goes to a person. |
| `FOLLOW_UP_SECONDS` | `20` | How long the follow-up timer waits before drafting the follow-up, and again after it before handing the case back. |
| `CONTACT_STALE_SECONDS` | `900` | A case stuck in contacting this long escalates. |
| `MAX_CASE_TOKENS` | `30000` | Per-case model token budget. Over it, the case escalates. |
| `MOCK_STEP_SECONDS` | `2` | Delay between simulated Fo steps in mock mode. |
| `MOCK_BANK_SILENT` | `0` | Mock only. `1` makes the mock bank never reply, to show the follow-up draft and the hand-back. |

Fixed in code on purpose: the Claude model is pinned in `api/app/config.py` (the `CLAUDE_MODEL` line in `.env.example` is not read), the daily cap of 3 real sends (`MAX_TEST_SENDS_PER_DAY`), and the filing windows (60 days for card disputes and package claims, 30 for insurance). The filing windows are defaults, not legal advice.

## What are the known limitations?

- **Email only.** Phone calls are blocked by the trust gate, even though Fo can make them.
- **One allowed recipient.** The agent only ever emails our own test bank inbox. It has never contacted a real bank, carrier or insurer.
- **One follow-up, only with approval.** The agent never sends a follow-up by itself and drafts at most one per case.
- **Resolution in the demo is simulated.** The live Fo send in the video is real, sent to the test inbox. The bank's reply and the resolution are simulated.
- **Live case types.** The live Fo run in the video was a card dispute. Package and insurance claims pass the same path end to end in mock mode, but the video doesn't show them against live Fo.
- **Reading Fo's reply.** The agent decides whether Fo sent the email by reading Fo's reply text. When the wording is unclear, it treats the email as unconfirmed and hands the case to a person instead of guessing.
- **Runs locally.** There is no Docker image, and the real agent's approve and reject routes only answer a browser on the same machine.
- **The Vercel demo resets.** `web/vercel.json` lets the dashboard alone deploy to Vercel with demo data and a DEMO DATA label. It builds without a backend or secrets, and its Approve and Reject buttons only change simulated cases. The demo data lives in server memory, so a claim you add can disappear when Vercel starts a fresh server. The three sample cases always come back.
- **Evidence gathering isn't in the audit log.** It's internal and sends nothing, but it has no row.

## License

MIT. See [LICENSE](LICENSE).
