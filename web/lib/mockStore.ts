// MOCK DATA LAYER — in-memory store + simulator. Email-only to test stand-in addresses; never places calls, sends real email or pays.
import { createHash } from "node:crypto";
import type { Trace, Case, CaseEvent, CaseWithEvents, CreateCaseBody, ApprovalBody, CaseType, AuditRow, AuditResponse, ProposedAction } from "./types";

type Listener = (msg: { event: "case_updated"; data: Case } | { event: "case_event"; data: CaseEvent }) => void;

interface Store {
  cases: Map<string, Case>;
  events: Map<string, CaseEvent[]>;
  listeners: Set<Listener>;
  timers: Set<ReturnType<typeof setTimeout>>;
  seq: number;
  audit: AuditRow[];
}

const g = globalThis as unknown as { __gsdStore?: Store };
const STEP_MS = 3000;

function iso(offsetMs = 0) { return new Date(Date.now() + offsetMs).toISOString(); }
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function store(): Store {
  if (!g.__gsdStore) {
    g.__gsdStore = { cases: new Map(), events: new Map(), listeners: new Set(), timers: new Set(), seq: 100, audit: [] };
    seed(g.__gsdStore);
  }
  return g.__gsdStore;
}

function nid(prefix: string) { const s = store(); s.seq += 1; return `${prefix}_${s.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function emit(msg: Parameters<Listener>[0]) { for (const l of store().listeners) { try { l(msg); } catch { /* ignore */ } } }

// ---------- hash-chained audit log (mirrors backend GET /api/audit) ----------
function rowHash(prev: string, r: Omit<AuditRow, "row_hash">) {
  return createHash("sha256").update(prev + JSON.stringify([r.id, r.ts, r.case_id, r.actor, r.event, r.detail])).digest("hex");
}
function audit(case_id: string, actor: string, event: string, detail: Record<string, unknown>, tsSec = Date.now() / 1000, s: Store = store()) {
  s.audit ??= [];
  const prev = s.audit.at(-1)?.row_hash ?? "0".repeat(64);
  const base = { id: s.audit.length + 1, ts: tsSec, case_id, actor, event, detail: JSON.stringify(detail) };
  s.audit.push({ ...base, row_hash: rowHash(prev, base) });
}
export function getAudit(): AuditResponse {
  const rows = store().audit ?? []; let prev = "0".repeat(64); let ok = true;
  for (const r of rows) { const { row_hash, ...base } = r; if (rowHash(prev, base) !== row_hash) ok = false; prev = row_hash; }
  return { chain_ok: ok, rows };
}

const INJECTION = /(ignore (all |any )?(previous|prior) instructions|system prompt|you are now|disregard .*instructions|send .* gift card|wire \$)/i;

export function subscribe(l: Listener) { const s = store(); s.listeners.add(l); return () => { s.listeners.delete(l); }; }

export function listCases(): Case[] {
  return [...store().cases.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getCase(id: string): CaseWithEvents | null {
  const s = store(); const c = s.cases.get(id); if (!c) return null;
  return { ...c, events: [...(s.events.get(id) ?? [])].sort((a, b) => a.ts.localeCompare(b.ts)) };
}

function patchCase(id: string, patch: Partial<Case>) {
  const s = store(); const c = s.cases.get(id); if (!c) return;
  const next = { ...c, ...patch, updated_at: iso() }; s.cases.set(id, next); emit({ event: "case_updated", data: next });
}

// ---------- per-step trace records (realistic shapes; values are simulated) ----------
const MODEL = "claude-sonnet-4-5";
function jitter(n: number) { return Math.round(n * (0.85 + Math.random() * 0.3)); }
export function traceFor(kind: string, input_source?: string): Trace | undefined {
  switch (kind) {
    case "classified": return { agent: "classifier", input_source: input_source ?? "user:paste", duration_ms: jitter(1180), tokens: { input: jitter(812), output: jitter(96) }, model: MODEL, prompt_id: "prompts/classify.v1", retries: 0 };
    case "evidence_gathered": return { agent: "extractor", input_source: "classifier", duration_ms: jitter(2340), tokens: { input: jitter(1460), output: jitter(310) }, model: MODEL, prompt_id: "prompts/extract_evidence.v2", retries: 0 };
    case "approval_requested": return { agent: "planner", input_source: "extractor", duration_ms: jitter(640), tokens: { input: jitter(520), output: jitter(140) }, model: MODEL, prompt_id: "prompts/plan_action.v1", retries: 0 };
    case "approved": case "rejected": return { agent: "approval_gate", input_source: "human", duration_ms: jitter(14) };
    case "email_sent": return { agent: "fo_adapter", input_source: "approval_gate", duration_ms: jitter(830), retries: 0 };
    case "reply_received": return { agent: "inbox_watcher", input_source: "fo", duration_ms: jitter(210) };
    case "follow_up_scheduled": return { agent: "scheduler", input_source: "inbox_watcher", duration_ms: jitter(18) };
    case "resolved": return { agent: "resolver", input_source: "inbox_watcher", duration_ms: jitter(920), tokens: { input: jitter(640), output: jitter(80) }, model: MODEL, prompt_id: "prompts/resolve_check.v1" };
    case "escalated_to_human": return { agent: "guardrail", input_source: input_source ?? "user:paste", duration_ms: jitter(410), tokens: { input: jitter(700), output: jitter(60) }, model: MODEL, prompt_id: "prompts/injection_screen.v1" };
    default: return undefined;
  }
}

function addEvent(case_id: string, e: Omit<CaseEvent, "id" | "case_id" | "ts" | "mock">): CaseEvent {
  const s = store();
  const ev: CaseEvent = { id: nid("evt"), case_id, ts: iso(), mock: true, trace: traceFor(e.kind), ...e };
  const list = s.events.get(case_id) ?? []; list.push(ev); s.events.set(case_id, list);
  emit({ event: "case_event", data: ev });
  return ev;
}

function updateEvent(case_id: string, event_id: string, patch: Partial<CaseEvent>) {
  const list = store().events.get(case_id) ?? []; const i = list.findIndex((e) => e.id === event_id); if (i < 0) return null;
  list[i] = { ...list[i], ...patch }; emit({ event: "case_event", data: list[i] }); return list[i];
}

function schedule(steps: (() => void)[], stepMs = STEP_MS) {
  const s = store();
  steps.forEach((fn, i) => { const t = setTimeout(() => { s.timers.delete(t); fn(); }, stepMs * (i + 1)); s.timers.add(t); });
}

// ---------- classification heuristics ----------
const KNOWN = ["Chase", "Amex", "American Express", "Citi", "Capital One", "Discover", "Wells Fargo", "UPS", "FedEx", "USPS", "DHL", "Amazon", "Lemonade", "State Farm", "Geico", "Allstate", "Progressive"];

function classify(text: string): { type: CaseType; counterparty: string; amount_cents: number; title: string; confidence: number } {
  const t = text.toLowerCase();
  let type: CaseType = "card_dispute"; let confidence = 0.74;
  if (/(ups|fedex|usps|dhl|package|parcel|delivery|delivered|tracking)/.test(t)) { type = "package_claim"; confidence = 0.9; }
  else if (/(insurance|lemonade|state farm|geico|allstate|policy|stolen|theft|damage)/.test(t)) { type = "insurance_claim"; confidence = 0.88; }
  else if (/(charge|charged|card|refund|dispute|merchant|statement)/.test(t)) { type = "card_dispute"; confidence = 0.93; }
  else { type = "other"; confidence = 0.58; }
  const cp = KNOWN.find((k) => t.includes(k.toLowerCase())) ?? (type === "package_claim" ? "Carrier" : type === "insurance_claim" ? "Insurer" : type === "other" ? "—" : "Card issuer");
  const m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  const amount_cents = m ? Math.round(parseFloat(m[1].replace(/,/g, "")) * 100) : 0;
  const amt = amount_cents ? ` $${(amount_cents / 100).toFixed(2)}` : "";
  const merchant = text.match(/\bat ([A-Z][\w'&]*(?: [A-Z][\w'&]*){0,3})/)?.[1];
  const title = type === "card_dispute" ? (merchant ? `Disputed charge at ${merchant}` : `Disputed charge${amt}`) : type === "package_claim" ? `Lost / damaged package${amt}` : type === "other" ? "Out-of-scope request" : `Insurance claim${amt}`;
  return { type, counterparty: cp, amount_cents, title, confidence };
}

// Demo contacts are EMAIL ONLY and always go to obvious test stand-in addresses, never a real business.
const FROM = "fo-standin@test.example";
const STANDIN: Record<CaseType, string> = {
  card_dispute: "bank-standin@test.example",
  package_claim: "carrier-standin@test.example",
  insurance_claim: "insurer-standin@test.example",
  other: "standin@test.example",
};

function money(cents: number | null) { return `$${((cents ?? 0) / 100).toFixed(2)}`; }

function proposedAction(c: Case): ProposedAction {
  const amt = money(c.amount_cents);
  const summary =
    c.type === "card_dispute" ? `Email ${c.counterparty} disputes, request provisional credit of ${amt}`
    : c.type === "package_claim" ? `Email ${c.counterparty} claims, file a lost-package claim for ${amt}`
    : `Email ${c.counterparty} claims team, open a claim for ${amt} with attached evidence`;
  return {
    channel: "email", to: STANDIN[c.type], acting_as: `${c.counterparty} (test stand-in)`, spend_cents: 0, summary,
    message: `Open a ${c.type.replace("_", " ")} for ${amt} regarding "${c.title}". Attach the evidence on file and ask for a reference number.`,
  };
}

// ---------- public mutations ----------
export function createCase(body: CreateCaseBody): Case {
  const s = store();
  const id = nid("case");
  const c: Case = {
    id, type: "card_dispute", title: (body.text || body.filenames?.join(", ") || "New claim").split("\n")[0].slice(0, 80),
    counterparty: "—", amount_cents: 0, currency: "USD", status: "new", created_at: iso(), updated_at: iso(), mock: true,
  };
  s.cases.set(id, c); s.events.set(id, []);
  emit({ event: "case_updated", data: c });
  const info = classify(`${body.text} ${(body.filenames ?? []).join(" ")}`);
  const label = { card_dispute: "Card dispute", insurance_claim: "Insurance claim", package_claim: "Package claim", other: "Out of scope" }[info.type];
  schedule([
    () => {
      patchCase(id, { ...info, status: "classified" });
      addEvent(id, { kind: "classified", actor: "agent", trace: traceFor("classified", `user:${body.source}`), title: `Classified as ${label}`, detail: `Counterparty: ${info.counterparty} · Amount: ${money(info.amount_cents)} · Source: ${body.source}` });
    },
    () => {
      if (info.type === "other") {
        patchCase(id, { status: "escalated" });
        addEvent(id, { kind: "escalated_to_human", actor: "agent", title: "Out of scope — handed to a human EA",
          detail: "The agent only handles card disputes, package claims and insurance claims. Nothing was sent." });
        return;
      }
      if (INJECTION.test(body.text)) {
        patchCase(id, { status: "escalated" });
        addEvent(id, { kind: "escalated_to_human", actor: "agent", title: "Escalated to a human EA — possible prompt injection",
          detail: "The submitted text contains instructions aimed at the agent (e.g. \"ignore previous instructions\"). Nothing was sent. A human EA will review this case." });
        return;
      }
      patchCase(id, { status: "gathering_evidence" });
      const files = body.filenames?.length ? body.filenames.join(", ") : "pasted text";
      addEvent(id, { kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: `Extracted key facts from ${files}.` });
    },
    () => {
      const cur = store().cases.get(id)!;
      if (cur.status === "escalated") return;
      patchCase(id, { status: "awaiting_approval" });
      const pa = proposedAction(cur);
      audit(id, "agent", "approval_requested", { action: "email", target: pa.to });
      addEvent(id, { kind: "approval_requested", actor: "agent", title: "Approval requested", pending: true, proposed_action: pa, detail: "Fo will act on your behalf only after you approve. Nothing is sent and no money is spent until then." });
    },
  ]);
  return c;
}

export function decide(case_id: string, body: ApprovalBody): CaseEvent | { error: string; status: number } {
  const s = store(); const c = s.cases.get(case_id); if (!c) return { error: "case not found", status: 404 };
  const ev = (s.events.get(case_id) ?? []).find((e) => e.id === body.event_id);
  if (!ev || ev.kind !== "approval_requested") return { error: "approval event not found", status: 404 };
  if (!ev.pending) return { error: "approval already decided", status: 409 };
  updateEvent(case_id, ev.id, { pending: false });
  audit(case_id, "user", "approval_decided", { decision: body.decision === "approve" ? "approved" : "rejected" });
  if (body.decision === "reject") {
    const r = addEvent(case_id, { kind: "rejected", actor: "human", title: "Rejected by you", detail: body.note || "Agent will not take this action." });
    patchCase(case_id, { status: "rejected" });
    return r;
  }
  const summary = typeof ev.proposed_action === "string" ? ev.proposed_action : ev.proposed_action?.summary;
  const a = addEvent(case_id, { kind: "approved", actor: "human", title: "Approved by you", detail: body.note || summary });
  patchCase(case_id, { status: "contacting" });
  audit(case_id, "system", "fo_ask_authorized", { target: STANDIN[c.type] });
  runResolution(store().cases.get(case_id)!);
  return a;
}

function runResolution(c: Case) {
  const id = c.id; const amt = money(c.amount_cents); const conv = `fo_conv_${Math.random().toString(36).slice(2, 10)}`;
  const to = STANDIN[c.type]; const ref = `TEST-${Math.floor(10000 + Math.random() * 89999)}`;
  schedule([
    () => { patchCase(id, { status: "awaiting_reply" }); audit(id, "fo", "ask_fo_sent", { mock: true, channel: "email", target: to }); addEvent(id, {
      kind: "email_sent", actor: "fo", title: `Fo emailed ${c.counterparty} (test stand-in)`, fo_conversation_id: conv,
      email: { from: FROM, to, subject: `${c.type === "card_dispute" ? "Dispute" : "Claim"}: ${c.title} (${amt})`,
        body: `Hello,\n\nOn behalf of Dhyey Desai, I'd like to open a ${c.type.replace("_", " ")} for ${amt} regarding "${c.title}". The receipt and supporting screenshots are attached.\n\nPlease confirm receipt and share a reference number.\n\nThanks,\nFo, on behalf of Dhyey Desai` },
    }); },
    () => addEvent(id, {
      kind: "reply_received", actor: "counterparty", title: `Reply from ${c.counterparty} (test stand-in)`, fo_conversation_id: conv,
      email: { from: to, to: FROM, subject: `RE: ${c.type === "card_dispute" ? "Dispute" : "Claim"}: ${c.title} (${amt})`,
        body: `Hi,\n\nThanks for the documentation. Reference ${ref}. We've approved ${c.type === "card_dispute" ? "a provisional credit" : "reimbursement"} of ${amt}; it should appear within 3–5 business days.\n\nRegards,\n${c.counterparty} (test stand-in)` },
    }),
    () => { patchCase(id, { status: "follow_up_scheduled" }); addEvent(id, { kind: "follow_up_scheduled", actor: "agent", title: "Follow-up scheduled", detail: `Will verify the ${amt} credit posted in 5 business days (ref ${ref}).` }); },
    () => { patchCase(id, { status: "resolved" }); addEvent(id, { kind: "resolved", actor: "agent", title: "Resolved", detail: `${amt} recovered.` }); },
  ]);
}

// ---------- seed ----------
function seed(s: Store) {
  const put = (c: Case, evs: Omit<CaseEvent, "case_id" | "mock">[]) => {
    s.cases.set(c.id, c); s.events.set(c.id, evs.map((e) => ({ trace: traceFor(e.kind), ...e, case_id: c.id, mock: true })));
  };
  const now = Date.now(); const at = (ms: number) => new Date(now - ms).toISOString();
  const sec = (ms: number) => (now - ms) / 1000;
  const A = (cid: string, actor: string, ev: string, d: Record<string, unknown>, ms: number) => audit(cid, actor, ev, d, sec(ms), s);
  A("case_lemonade", "agent", "approval_requested", { action: "email", target: STANDIN.insurance_claim }, 6 * DAY - 2 * HOUR);
  A("case_lemonade", "user", "approval_decided", { decision: "approved" }, 5 * DAY + 20 * HOUR);
  A("case_lemonade", "system", "fo_ask_authorized", { target: STANDIN.insurance_claim }, 5 * DAY + 20 * HOUR - 1000);
  A("case_lemonade", "fo", "ask_fo_sent", { mock: true, channel: "email", target: STANDIN.insurance_claim }, 5 * DAY + 19 * HOUR);
  A("case_ups", "agent", "approval_requested", { action: "email", target: STANDIN.package_claim }, 2 * DAY - 30 * MIN);
  A("case_ups", "user", "approval_decided", { decision: "approved" }, DAY + 20 * HOUR);
  A("case_ups", "system", "fo_ask_authorized", { target: STANDIN.package_claim }, DAY + 20 * HOUR - 1000);
  A("case_ups", "fo", "ask_fo_sent", { mock: true, channel: "email", target: STANDIN.package_claim }, DAY + 19 * HOUR);
  A("case_chase", "agent", "approval_requested", { action: "email", target: STANDIN.card_dispute }, 2 * MIN);

  put({ id: "case_chase", type: "card_dispute", title: "Double charge at Blue Bottle Coffee", counterparty: "Chase", amount_cents: 18420, currency: "USD",
    status: "awaiting_approval", created_at: at(14 * MIN), updated_at: at(2 * MIN), confidence: 0.92, mock: true }, [
    { id: "evt_c1", ts: at(14 * MIN), kind: "classified", actor: "agent", title: "Classified as Card dispute", detail: "Counterparty: Chase · Amount: $184.20 · Source: forward" },
    { id: "evt_c2", ts: at(9 * MIN), kind: "evidence_gathered", actor: "agent", title: "Extracted 6 evidence fields",
      evidence: {
        card_issuer: { value: "Chase", status: "present", citation: "Chase Sapphire Preferred ••4417 — Transaction alert" },
        merchant: { value: "Blue Bottle Coffee", status: "present", citation: "BLUE BOTTLE COFFEE #0412  $184.20" },
        transaction_date: { value: "2026-10-09", status: "present", citation: "Oct 9, 2026 at 8:14 AM" },
        charge_count: { value: "2", status: "present", citation: "2 transactions of $184.20 on Oct 9" },
        order_id: { value: "BB-20931", status: "present", citation: "Order #BB-20931 (1 item)" },
        merchant_contacted: { value: null, status: "absent" },
      } },
    { id: "evt_c3", ts: at(2 * MIN), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: true,
      proposed_action: {
        channel: "email", to: STANDIN.card_dispute, acting_as: "Chase disputes (test stand-in)", spend_cents: 0,
        summary: "Email Chase disputes, request provisional credit of $184.20",
        message: "Dispute the duplicate $184.20 charge from Blue Bottle Coffee on Oct 9 (card ••4417). Receipt #BB-20931 shows a single order. Request a provisional credit and a reference number.",
      },
      detail: "Fo will email the test stand-in for Chase disputes with the receipt attached. Nothing is sent and no money is spent until you approve." },
  ]);

  put({ id: "case_ups", type: "package_claim", title: "Lost package — Anker power bank", counterparty: "UPS", amount_cents: 8999, currency: "USD",
    status: "awaiting_reply", created_at: at(2 * DAY), updated_at: at(3 * HOUR), confidence: 0.67, mock: true }, [
    { id: "evt_u1", ts: at(2 * DAY), kind: "classified", actor: "agent", title: "Classified as Package claim", detail: "Counterparty: UPS · Amount: $89.99 · Source: paste" },
    { id: "evt_u2", ts: at(2 * DAY - 20 * MIN), kind: "evidence_gathered", actor: "agent", title: "Extracted 5 evidence fields",
      trace: { agent: "extractor", input_source: "classifier", duration_ms: 9420, tokens: { input: 1712, output: 344 }, model: MODEL, prompt_id: "prompts/extract_evidence.v2", retries: 1,
        errors: ["tracking_lookup: carrier status page timed out after 8000ms (retried once, then used pasted tracking text)"] },
      evidence: {
        carrier: { value: "UPS", status: "present", citation: "Shipped with UPS — tracking 1Z999AA10123456784" },
        tracking_number: { value: "1Z999AA10123456784", status: "present", citation: "Tracking: 1Z999AA10123456784" },
        delivery_status: { value: "Delivered Oct 12 (front door)", status: "ambiguous", citation: "\"Delivered, left at front door\" — no photo, recipient says not received" },
        declared_value: { value: "$89.99", status: "present", citation: "Order total: $89.99" },
        delivery_photo: { value: null, status: "absent" },
      } },
    { id: "evt_u3", ts: at(2 * DAY - 30 * MIN), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: false,
      proposed_action: { channel: "email", to: STANDIN.package_claim, acting_as: "UPS claims (test stand-in)", spend_cents: 0, summary: "Email UPS claims, file a lost-package claim for $89.99" } },
    { id: "evt_u4", ts: at(1 * DAY + 20 * HOUR), kind: "approved", actor: "human", title: "Approved by you", detail: "Email UPS claims, file a lost-package claim for $89.99" },
    { id: "evt_u5", ts: at(1 * DAY + 19 * HOUR), kind: "email_sent", actor: "fo", title: "Fo emailed UPS claims (test stand-in)", fo_conversation_id: "fo_conv_8f3k2q1z",
      email: { from: FROM, to: STANDIN.package_claim, subject: "Lost package claim — 1Z999AA10123456784 ($89.99)",
        body: "Hello,\n\nOn behalf of Dhyey Desai, I'd like to file a lost-package claim. Tracking 1Z999AA10123456784 shows delivered on Oct 12, but the package never arrived and there is no delivery photo.\n\nAttached: the order receipt ($89.99) and a screenshot of the tracking history.\n\nPlease confirm receipt and share a claim number.\n\nThanks,\nFo, on behalf of Dhyey Desai" } },
    { id: "evt_u6", ts: at(1 * DAY + 2 * HOUR), kind: "reply_received", actor: "counterparty", title: "Reply from UPS claims (test stand-in)", fo_conversation_id: "fo_conv_8f3k2q1z",
      email: { from: STANDIN.package_claim, to: FROM, subject: "RE: Lost package claim — 1Z999AA10123456784",
        body: "Hello,\n\nWe've opened claim TEST-2291 and started a trace with the delivering driver. We'll follow up within 2 business days.\n\n— UPS Claims (test stand-in)" } },
    { id: "evt_u7", ts: at(3 * HOUR), kind: "note", actor: "agent", title: "Waiting on UPS", detail: "No update on claim TEST-2291 yet. Will email a follow-up tomorrow at 10:00 AM ET if nothing arrives." },
  ]);

  put({ id: "case_lemonade", type: "insurance_claim", title: "Stolen bike — Trek FX 2", counterparty: "Lemonade", amount_cents: 65000, currency: "USD",
    status: "resolved", created_at: at(6 * DAY), updated_at: at(1 * DAY), confidence: 0.96, mock: true }, [
    { id: "evt_l1", ts: at(6 * DAY), kind: "classified", actor: "agent", title: "Classified as Insurance claim", detail: "Counterparty: Lemonade · Amount: $650.00 · Source: upload" },
    { id: "evt_l2", ts: at(6 * DAY - HOUR), kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: "Police report #NYPD-26-118402, purchase receipt, and 2 photos of the cut lock." },
    { id: "evt_l3", ts: at(6 * DAY - 2 * HOUR), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: false,
      proposed_action: { channel: "email", to: STANDIN.insurance_claim, acting_as: "Lemonade claims (test stand-in)", spend_cents: 0, summary: "Email Lemonade claims team, open a claim for $650.00 with attached evidence" } },
    { id: "evt_l4", ts: at(5 * DAY + 20 * HOUR), kind: "approved", actor: "human", title: "Approved by you" },
    { id: "evt_l5", ts: at(5 * DAY + 19 * HOUR), kind: "email_sent", actor: "fo", title: "Fo emailed Lemonade (test stand-in)", fo_conversation_id: "fo_conv_l2m9x7aa",
      email: { from: FROM, to: STANDIN.insurance_claim, subject: "Renters claim — stolen bicycle (policy LM-88213)",
        body: "Hi Lemonade team,\n\nI'd like to open a claim under policy LM-88213 for a stolen Trek FX 2 ($650.00). Police report NYPD-26-118402, receipt and photos attached.\n\nThank you,\nFo, on behalf of Dhyey Desai" } },
    { id: "evt_l6", ts: at(3 * DAY), kind: "reply_received", actor: "counterparty", title: "Reply from Lemonade (test stand-in)",
      email: { from: STANDIN.insurance_claim, to: FROM, subject: "RE: Renters claim — stolen bicycle",
        body: "Hi Dhyey,\n\nGood news — your claim has been approved. $650.00 minus your $0 deductible will be deposited to your account on file within 2 business days.\n\n— Lemonade Claims (test stand-in)" } },
    { id: "evt_l7", ts: at(2 * DAY), kind: "follow_up_scheduled", actor: "agent", title: "Follow-up scheduled", detail: "Verify deposit posted by Oct 16." },
    { id: "evt_l8", ts: at(1 * DAY), kind: "resolved", actor: "agent", title: "Resolved", detail: "$650.00 deposit confirmed." },
  ]);
}
