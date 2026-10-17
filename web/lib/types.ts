export type CaseType = "card_dispute" | "insurance_claim" | "package_claim" | "other"; // other = out of scope
export type CaseStatus =
  | "new" | "classified" | "gathering_evidence" | "awaiting_approval" | "contacting"
  | "awaiting_reply" | "follow_up_scheduled" | "resolved" | "rejected" | "failed" | "escalated"
  | (string & {}); // unknown statuses from the backend render with a neutral pill

export interface Case {
  id: string;
  type: CaseType;
  title: string;
  counterparty: string | null; // backend may send null before classification
  amount_cents: number | null;
  currency: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
  confidence?: number | null; // 0..1
  mock?: boolean;
}

export type EventKind =
  | "classified" | "evidence_gathered" | "approval_requested" | "approved" | "rejected"
  | "call_placed" | "email_sent" | "reply_received" | "follow_up_scheduled" | "resolved"
  | "escalated_to_human" | "note" | (string & {});

export interface TranscriptTurn { speaker: string; text: string; ts?: string }
export interface EmailBody { from: string; to: string; cc?: string | string[] | null; subject: string; body: string }

export interface CaseEvent {
  id: string;
  case_id: string;
  ts: string;
  kind: EventKind;
  title: string;
  detail?: string | null;
  actor: "agent" | "fo" | "human" | "counterparty" | (string & {});
  proposed_action?: string | ProposedAction;
  evidence?: Record<string, EvidenceValue>;
  pending?: boolean;
  transcript?: TranscriptTurn[];
  email?: EmailBody;
  fo_conversation_id?: string;
  reason?: string | string[]; // escalated_to_human: why the agent stopped (optional; may also be in the title after ":")
  trace?: Trace;
  mock?: boolean;
}

/** Optional per-step trace record (one per event). UI renders nothing if absent. */
export interface Trace {
  agent: string;
  input_source: string;
  duration_ms: number;
  tokens?: { input: number; output: number };
  errors?: string[];
  retries?: number;
  model?: string;
  prompt_id?: string;
  grounding_problems?: string[]; // real backend: extraction values not grounded in the source
}

export type CaseWithEvents = Case & { events: CaseEvent[] };

export interface CreateCaseBody {
  source: "paste" | "upload" | "forward";
  text: string;
  filenames?: string[];
}
export interface ApprovalBody { event_id: string; decision: "approve" | "reject"; note?: string }

/** Structured proposed action as sent by the real backend. */
export interface ProposedAction {
  channel: "email" | "call" | "card" | (string & {});
  to?: string | null;
  acting_as?: string | null;
  message?: string | null;
  spend_cents?: number | null;
  approval_id?: string;
  summary?: string; // optional one-line human summary; UI uses it as the headline when present
}

/** Evidence fields arrive either as plain values or as {value, status, citation}. */
export type EvidenceStatus = "present" | "absent" | "ambiguous";
export interface EvidenceField { value: unknown; status: EvidenceStatus | (string & {}); citation?: string | null }
export type EvidenceValue = string | number | boolean | null | EvidenceField | Record<string, unknown>;

export interface AuditRow {
  id: number;
  ts: number | string; // epoch seconds (backend) or ISO
  case_id: string;
  actor: string;
  event: string; // approval_requested | approval_decided | fo_ask_authorized | ask_fo_sent | ...
  detail: string | null; // JSON-encoded object
  row_hash: string;
}
export interface AuditResponse { chain_ok: boolean; rows: AuditRow[] }
