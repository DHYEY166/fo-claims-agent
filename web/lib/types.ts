export type CaseType = "card_dispute" | "insurance_claim" | "package_claim";
export type CaseStatus =
  | "new" | "classified" | "gathering_evidence" | "awaiting_approval" | "contacting"
  | "awaiting_reply" | "follow_up_scheduled" | "resolved" | "rejected" | "failed";

export interface Case {
  id: string;
  type: CaseType;
  title: string;
  counterparty: string;
  amount_cents: number;
  currency: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
  confidence?: number; // 0..1
  mock?: boolean;
}

export type EventKind =
  | "classified" | "evidence_gathered" | "approval_requested" | "approved" | "rejected"
  | "call_placed" | "email_sent" | "reply_received" | "follow_up_scheduled" | "resolved"
  | "escalated_to_human" | "note";

export interface TranscriptTurn { speaker: string; text: string; ts?: string }
export interface EmailBody { from: string; to: string; subject: string; body: string }

export interface CaseEvent {
  id: string;
  case_id: string;
  ts: string;
  kind: EventKind;
  title: string;
  detail?: string;
  actor: "agent" | "fo" | "human" | "counterparty";
  proposed_action?: string;
  pending?: boolean;
  transcript?: TranscriptTurn[];
  email?: EmailBody;
  fo_conversation_id?: string;
  mock?: boolean;
}

export type CaseWithEvents = Case & { events: CaseEvent[] };

export interface CreateCaseBody {
  source: "paste" | "upload" | "forward";
  text: string;
  filenames?: string[];
}
export interface ApprovalBody { event_id: string; decision: "approve" | "reject"; note?: string }
