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

Errors: non-2xx with `{ "error": string }` (400 invalid body, 404 unknown case/event, 409 approval already decided).

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
  type: 'card_dispute' | 'insurance_claim' | 'package_claim';
  title: string;
  counterparty: string;
  amount_cents: number;
  currency: string;               // ISO 4217, e.g. "USD"
  status: 'new' | 'classified' | 'gathering_evidence' | 'awaiting_approval' | 'contacting'
        | 'awaiting_reply' | 'follow_up_scheduled' | 'resolved' | 'rejected' | 'failed';
  created_at: string;             // ISO
  updated_at: string;             // ISO
  confidence?: number;            // 0..1 classification confidence. UI: "confidence 92%" chip; warning style below 0.7
  mock?: boolean;                 // true => simulated case. UI: "simulated" badge
};

type Event = {
  id: string;
  case_id: string;
  ts: string;                     // ISO
  kind: 'classified' | 'evidence_gathered' | 'approval_requested' | 'approved' | 'rejected'
      | 'call_placed' | 'email_sent' | 'reply_received' | 'follow_up_scheduled' | 'resolved'
      | 'escalated_to_human' | 'note';
  title: string;
  detail?: string;
  actor: 'agent' | 'fo' | 'human' | 'counterparty';
  proposed_action?: string;       // for approval_requested, e.g. "Call Chase disputes line, request provisional credit of $184.20"
  pending?: boolean;              // approval_requested awaiting a decision => UI shows "Approve before action" card
  transcript?: { speaker: string; text: string; ts?: string }[];   // call_placed
  email?: { from: string; to: string; subject: string; body: string }; // email_sent / reply_received
  fo_conversation_id?: string;    // Fo events. UI: muted monospace line
  mock?: boolean;
};
```

## Approval flow (trust by design)

1. Agent emits `approval_requested` with `pending: true` and a concrete `proposed_action`; case status → `awaiting_approval`.
2. Nothing external (call, email, card) happens until `POST /api/cases/:id/approvals` with `decision: 'approve'`.
3. Server flips the request to `pending: false` (re-emitted as `case_event`) and emits `approved` or `rejected`.
