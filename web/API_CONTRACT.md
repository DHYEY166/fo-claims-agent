# GSD Claims Agent — API contract (v1)

Base URL: `NEXT_PUBLIC_API_BASE` (real backend: `http://localhost:8000`).
When unset, the web app uses its built-in **mock** route handlers on the same origin (`/api/*`, see `lib/mockStore.ts`).
All bodies are JSON. Timestamps are ISO 8601 (UTC). Money is integer cents.

## Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/cases` | – | `Case[]` (newest `updated_at` first) |
| GET | `/api/cases/:id` | – | `Case & { events: Event[] }` (events oldest first) |
| POST | `/api/cases` | `{ source: 'paste'\|'upload'\|'forward', text: string, filenames?: string[] }` | `Case` |
| POST | `/api/cases/:id/approvals` | `{ event_id: string, decision: 'approve'\|'reject', note?: string }` | `Event` (the resulting `approved`/`rejected` event) |
| GET | `/api/stream` | – | Server-Sent Events (see below) |
| GET | `/api/audit` | – | `{ chain_ok: boolean, rows: AuditRow[] }` (hash-chained, append-only) |

Errors: non-2xx with `{ "error": string }` (mock) or `{ "detail": string }` (real backend, FastAPI style); the frontend reads either.
400 invalid body, 404 unknown case/event, **409 approval already decided** (UI shows "Already decided" and refreshes).

### SSE: `GET /api/stream`

```
event: case_updated
data: <Case JSON>

event: case_event
data: <Event JSON>
```

- `case_event` is also re-sent when an existing event changes (e.g. `pending` flips to `false`); clients upsert by `id`.
- The server sends `: ping` comment lines every 15s as keep-alive; clients ignore them (EventSource does natively).
- Frontend falls back to polling `GET /api/cases` / `GET /api/cases/:id` every 3s if SSE fails.
- If the backend is on another origin (e.g. `:8000` vs the web app on `:3100`), it must send CORS headers
  (`Access-Control-Allow-Origin: http://localhost:3100`) for both JSON endpoints and the stream.

## Types

```ts
type Case = {
  id: string;
  type: 'card_dispute' | 'insurance_claim' | 'package_claim' | 'other'; // other = out of scope (UI: "Out of scope")
  title: string;
  counterparty: string | null;    // real backend sends null until classified
  amount_cents: number | null;    // ditto
  currency: string;               // ISO 4217, e.g. "USD"
  status: 'new' | 'classified' | 'gathering_evidence' | 'awaiting_approval' | 'contacting'
        | 'awaiting_reply' | 'follow_up_scheduled' | 'resolved' | 'rejected' | 'failed'
        | 'escalated';            // escalated to a human EA, nothing sent (e.g. possible prompt injection)
                                  // unknown statuses render as a neutral pill
  created_at: string;             // ISO
  updated_at: string;             // ISO
  confidence?: number | null;     // 0..1 classification confidence. UI: "confidence 92%" chip; warning style below 0.7
  mock?: boolean;                 // true => simulated case. UI: "simulated" badge
  // real backend also sends (ignored by UI): fo_conversation_id?: string|null, follow_up_at?: string|null
};

type Event = {
  id: string;
  case_id: string;
  ts: string;                     // ISO
  kind: 'classified' | 'evidence_gathered' | 'approval_requested' | 'approved' | 'rejected'
      | 'call_placed' | 'email_sent' | 'reply_received' | 'follow_up_scheduled' | 'resolved'
      | 'escalated_to_human' | 'note';
  title: string;
  detail?: string | null;
  actor: 'agent' | 'fo' | 'human' | 'counterparty';
  reason?: string | string[];     // optional, escalated_to_human: why the agent stopped (UI also parses "Title: reason")
  proposed_action?: string | ProposedAction; // approval_requested. Mock: plain string, e.g. "Call Chase disputes line, request provisional
                                  // credit of $184.20". Real backend: structured object (below). UI renders both.
  evidence?: Record<string, EvidenceValue>; // evidence_gathered: plain values or per-field objects (below)
  trace?: Trace;                  // OPTIONAL per-step trace record; UI renders nothing if absent
  pending?: boolean;              // approval_requested awaiting a decision => UI shows "Approve before action" card
  transcript?: { speaker: string; text: string; ts?: string }[];   // call_placed
  email?: { from: string; to: string; cc?: string | string[]; subject: string; body: string }; // email_sent / reply_received
  fo_conversation_id?: string;    // Fo events. UI: muted monospace line
  mock?: boolean;
};
```

```ts
type ProposedAction = {
  channel: 'email' | 'call' | 'card' | string;
  to?: string | null;             // e.g. "mock:test-target@example.com"
  acting_as?: string | null;      // e.g. "Chase"
  message?: string | null;        // exact instruction Fo will receive
  spend_cents?: number | null;
  approval_id?: string;
  summary?: string;               // optional one-line headline, e.g. "Email Chase disputes, request provisional credit of $184.20"
};

type Trace = {                    // optional; one per event
  agent: string;                  // e.g. "classifier"
  input_source: string;           // where the step's input came from (user:paste, intake, classifier, human, fo, ...)
  duration_ms: number;
  tokens?: { input: number; output: number };
  errors?: string[];              // non-empty => trace row rendered red
  retries?: number;
  model?: string;
  prompt_id?: string;             // e.g. "prompts/classify.v1" or "classify.v2"
  grounding_problems?: string[];  // real backend extra; non-empty => amber
};

type EvidenceValue =
  | string | number | boolean | null                       // plain form
  | { value?: unknown; status: 'present' | 'absent' | 'ambiguous'; citation?: string }; // per-field form

type AuditRow = {
  id: number;                     // sequential
  ts: number;                     // epoch seconds (float)
  case_id: string;
  actor: 'agent' | 'user' | 'system' | 'fo' | 'human' | string;
  event: 'intake' | 'approval_requested' | 'approval_decided' | 'fo_ask_authorized' | 'ask_fo_sent' | string;
  detail: string | null;          // JSON-encoded object, e.g. "{\"decision\": \"approved\"}"
  row_hash: string;               // sha256 hex, chained over the previous row
};
```

## Display rules (frontend, demo safety)

- **Email only.** `NEXT_PUBLIC_DEMO_HIDE_CALLS` (default on) hides `call_placed` events and transcripts from the timeline.
- **Recipients are masked.** Every outbound address (`proposed_action.to`, `email.to`/`cc`, reply `from`, addresses inside
  bodies/details/audit rows) is displayed as "test bank inbox" (e.g. the backend alias `test-bank-inbox@alias.invalid`).
- **Simulated steps.** Events with `mock: true` or a `[MOCK] ` title prefix show an amber MOCK badge (prefix stripped).

## Approval flow (trust by design)

1. Agent emits `approval_requested` with `pending: true` and a concrete `proposed_action`; case status → `awaiting_approval`.
2. Nothing external (call, email, card) happens until `POST /api/cases/:id/approvals` with `decision: 'approve'`.
3. Server flips the request to `pending: false` (re-emitted as `case_event`) and emits `approved` or `rejected`.

## Fo hold / go-ahead (feature/fo-oauth 99d042b)

There is no separate endpoint. The go-ahead is an ordinary pending approval:

- `approval_requested` event, title "Give Fo the go-ahead to send it?", `proposed_action.kind == "fo_go"`
  (`{kind:"fo_go", channel:"email", to, conversation_id, message:"go", spend_cents:0, approval_id}`).
- Approved through the existing `POST /api/cases/{id}/approvals {event_id, decision:"approve"}`. A second decision returns 409.
- UI: approval card titled "Give Fo the go-ahead", button "Give Fo the go-ahead", note
  "Second approval, on Fo's side. Same email, no new send slot.", plus a confirm dialog. One click, disabled afterwards, never retried.

Send state of a live "Fo replied" step (never says "sent" without a reason):

1. Backend signals: a later "Fo is holding the email for your go-ahead" step, or a pending `fo_go` approval → HELD.
   "Follow-up scheduled" before the next Fo reply → sent.
2. Text fallback, only when there is no backend signal: `/^\s*sent\b/`, `/\bI('ve| have)? sent\b/`, `/message id/` → sent;
   otherwise "held for your go-ahead" / "say go and I'll send" / "waiting for your go-ahead" → HELD; otherwise neutral "Fo drafted email to test bank inbox".
   Exception for old backends (e8a5889) that scheduled a follow-up even after a hold: if Fo's text has those narrow held words
   and no sent words, the step shows HELD.
