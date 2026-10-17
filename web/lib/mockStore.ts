// MOCK DATA LAYER — in-memory store + simulator. Never places real calls, emails or payments.
import { createHash } from "node:crypto";
import type { Case, CaseEvent, CaseWithEvents, CreateCaseBody, ApprovalBody, CaseType, AuditRow, AuditResponse } from "./types";

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

function addEvent(case_id: string, e: Omit<CaseEvent, "id" | "case_id" | "ts" | "mock">): CaseEvent {
  const s = store();
  const ev: CaseEvent = { id: nid("evt"), case_id, ts: iso(), mock: true, ...e };
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
  const cp = KNOWN.find((k) => t.includes(k.toLowerCase())) ?? (type === "package_claim" ? "Carrier" : type === "insurance_claim" ? "Insurer" : "Card issuer");
  const m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  const amount_cents = m ? Math.round(parseFloat(m[1].replace(/,/g, "")) * 100) : 0;
  const amt = amount_cents ? ` $${(amount_cents / 100).toFixed(2)}` : "";
  const merchant = text.match(/\bat ([A-Z][\w'&]*(?: [A-Z][\w'&]*){0,3})/)?.[1];
  const title = type === "card_dispute" ? (merchant ? `Disputed charge at ${merchant}` : `Disputed charge${amt}`) : type === "package_claim" ? `Lost / damaged package${amt}` : `Insurance claim${amt}`;
  return { type, counterparty: cp, amount_cents, title, confidence };
}

function proposedAction(c: Case) {
  const amt = `$${((c.amount_cents ?? 0) / 100).toFixed(2)}`;
  if (c.type === "card_dispute") return `Call ${c.counterparty} disputes line, request provisional credit of ${amt}`;
  if (c.type === "package_claim") return `Call ${c.counterparty} claims line, file a lost-package claim for ${amt}`;
  return `Email ${c.counterparty} claims team, open a claim for ${amt} with attached evidence`;
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
  const label = { card_dispute: "Card dispute", insurance_claim: "Insurance claim", package_claim: "Package claim" }[info.type];
  schedule([
    () => {
      patchCase(id, { ...info, status: "classified" });
      addEvent(id, { kind: "classified", actor: "agent", title: `Classified as ${label}`, detail: `Counterparty: ${info.counterparty} · Amount: $${(info.amount_cents / 100).toFixed(2)} · Source: ${body.source}` });
    },
    () => {
      if (INJECTION.test(body.text)) {
        patchCase(id, { status: "escalated" });
        addEvent(id, { kind: "escalated_to_human", actor: "agent", title: "Escalated to a human EA — possible prompt injection",
          detail: "The submitted text contains instructions aimed at the agent (e.g. \"ignore previous instructions\"). Nothing was sent. A human EA will review this case." });
        return;
      }
      patchCase(id, { status: "gathering_evidence" });
      const files = body.filenames?.length ? body.filenames.join(", ") : "pasted text";
      addEvent(id, { kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: `Extracted key facts from ${files}. Matched against statement and order history.` });
    },
    () => {
      const cur = store().cases.get(id)!;
      if (cur.status === "escalated") return;
      patchCase(id, { status: "awaiting_approval" });
      audit(id, "agent", "approval_requested", { action: cur.type === "insurance_claim" ? "email" : "call", target: cur.counterparty });
      addEvent(id, { kind: "approval_requested", actor: "agent", title: "Approval requested", pending: true, proposed_action: proposedAction(cur), detail: "Fo will act on your behalf only after you approve. No payment will be made." });
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
  const a = addEvent(case_id, { kind: "approved", actor: "human", title: "Approved by you", detail: body.note || (typeof ev.proposed_action === "string" ? ev.proposed_action : undefined) });
  patchCase(case_id, { status: "contacting" });
  audit(case_id, "system", "fo_ask_authorized", { target: c.counterparty });
  runResolution(store().cases.get(case_id)!);
  return a;
}

function runResolution(c: Case) {
  const id = c.id; const amt = `$${((c.amount_cents ?? 0) / 100).toFixed(2)}`; const conv = `fo_conv_${Math.random().toString(36).slice(2, 10)}`;
  const rep = c.type === "card_dispute" ? "Dana (Disputes)" : c.type === "package_claim" ? "Marcus (Claims)" : "Claims rep";
  const domain = (c.counterparty ?? "").toLowerCase().replace(/[^a-z]/g, "") || "counterparty";
  schedule([
    () => { audit(id, "fo", "ask_fo_sent", { mock: true, channel: "call", target: c.counterparty }); addEvent(id, {
      kind: "call_placed", actor: "fo", title: `Fo called ${c.counterparty}`, detail: "Call completed · 4m 12s", fo_conversation_id: conv,
      transcript: [
        { speaker: rep, text: `Thanks for calling ${c.counterparty}, how can I help?` },
        { speaker: "Fo", text: `Hi, I'm calling on behalf of my client Dhyey Desai about a ${c.type.replace("_", " ")} for ${amt}.` },
        { speaker: rep, text: "Sure, can you verify the last four digits and the date?" },
        { speaker: "Fo", text: "Last four 4417, transaction on October 9th. Supporting documents are ready to send." },
        { speaker: rep, text: `Got it. I've opened a case and you'll get a confirmation email shortly.` },
        { speaker: "Fo", text: "Great, could you share the reference number? I'll follow up by email with evidence." },
        { speaker: rep, text: "Reference is DSP-55821. Expect an update within 2 business days." },
      ],
    }); },
    () => { patchCase(id, { status: "awaiting_reply" }); audit(id, "fo", "ask_fo_sent", { mock: true, channel: "email", target: `claims@${domain}.example` }); addEvent(id, {
      kind: "email_sent", actor: "fo", title: `Fo emailed ${c.counterparty}`, fo_conversation_id: conv,
      email: { from: "dhyey@fo-agent.example", to: `claims@${domain}.example`, subject: `Ref DSP-55821 — ${c.title}`,
        body: `Hello,\n\nFollowing up on today's call (ref DSP-55821). Attached are the receipt and supporting screenshots for the ${amt} claim.\n\nPlease confirm once reviewed.\n\nThanks,\nFo, on behalf of Dhyey Desai` },
    }); },
    () => addEvent(id, {
      kind: "reply_received", actor: "counterparty", title: `Reply from ${c.counterparty}`,
      email: { from: `claims@${domain}.example`, to: "dhyey@fo-agent.example", subject: `RE: Ref DSP-55821 — ${c.title}`,
        body: `Hi,\n\nThank you for the documentation. We've reviewed your claim and approved ${c.type === "card_dispute" ? "a provisional credit" : "reimbursement"} of ${amt}. It should appear within 3–5 business days.\n\nRegards,\n${c.counterparty} Claims` },
    }),
    () => { patchCase(id, { status: "follow_up_scheduled" }); addEvent(id, { kind: "follow_up_scheduled", actor: "agent", title: "Follow-up scheduled", detail: "Will verify the credit posted in 5 business days." }); },
    () => { patchCase(id, { status: "resolved" }); addEvent(id, { kind: "resolved", actor: "agent", title: "Resolved", detail: `${amt} recovered.` }); },
  ]);
}

// ---------- seed ----------
function seed(s: Store) {
  const put = (c: Case, evs: Omit<CaseEvent, "case_id" | "mock">[]) => {
    s.cases.set(c.id, c); s.events.set(c.id, evs.map((e) => ({ ...e, case_id: c.id, mock: true })));
  };
  const now = Date.now(); const at = (ms: number) => new Date(now - ms).toISOString();
  const sec = (ms: number) => (now - ms) / 1000;
  const A = (cid: string, actor: string, ev: string, d: Record<string, unknown>, ms: number) => audit(cid, actor, ev, d, sec(ms), s);
  A("case_lemonade", "agent", "approval_requested", { action: "email", target: "claims@lemonade.example" }, 6 * DAY - 2 * HOUR);
  A("case_lemonade", "user", "approval_decided", { decision: "approved" }, 5 * DAY + 20 * HOUR);
  A("case_lemonade", "system", "fo_ask_authorized", { target: "claims@lemonade.example" }, 5 * DAY + 20 * HOUR - 1000);
  A("case_lemonade", "fo", "ask_fo_sent", { mock: true, channel: "email", target: "claims@lemonade.example" }, 5 * DAY + 19 * HOUR);
  A("case_ups", "agent", "approval_requested", { action: "call", target: "UPS claims" }, 2 * DAY - 30 * MIN);
  A("case_ups", "user", "approval_decided", { decision: "approved" }, DAY + 20 * HOUR);
  A("case_ups", "system", "fo_ask_authorized", { target: "UPS claims" }, DAY + 20 * HOUR - 1000);
  A("case_ups", "fo", "ask_fo_sent", { mock: true, channel: "call", target: "UPS claims" }, DAY + 19 * HOUR);
  A("case_ups", "fo", "ask_fo_sent", { mock: true, channel: "email", target: "claims@ups.example" }, DAY + 18 * HOUR);
  A("case_chase", "agent", "approval_requested", { action: "call", target: "Chase disputes line" }, 2 * MIN);

  put({ id: "case_chase", type: "card_dispute", title: "Double charge at Blue Bottle Coffee", counterparty: "Chase", amount_cents: 18420, currency: "USD",
    status: "awaiting_approval", created_at: at(14 * MIN), updated_at: at(2 * MIN), confidence: 0.92, mock: true }, [
    { id: "evt_c1", ts: at(14 * MIN), kind: "classified", actor: "agent", title: "Classified as Card dispute", detail: "Counterparty: Chase · Amount: $184.20 · Source: forward" },
    { id: "evt_c2", ts: at(9 * MIN), kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: "Two identical $184.20 charges on Oct 9 (Chase Sapphire ••4417). Merchant receipt shows a single order #BB-20931." },
    { id: "evt_c3", ts: at(2 * MIN), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: true,
      proposed_action: "Call Chase disputes line, request provisional credit of $184.20",
      detail: "Fo will call 1-800-935-9935, cite the duplicate charge and reference receipt #BB-20931. No payment will be made." },
  ]);

  put({ id: "case_ups", type: "package_claim", title: "Lost package — Anker power bank", counterparty: "UPS", amount_cents: 8999, currency: "USD",
    status: "awaiting_reply", created_at: at(2 * DAY), updated_at: at(3 * HOUR), confidence: 0.67, mock: true }, [
    { id: "evt_u1", ts: at(2 * DAY), kind: "classified", actor: "agent", title: "Classified as Package claim", detail: "Counterparty: UPS · Amount: $89.99 · Source: paste" },
    { id: "evt_u2", ts: at(2 * DAY - 20 * MIN), kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: "Tracking 1Z999AA10123456784 marked delivered Oct 12, no photo proof. Order receipt from Amazon attached." },
    { id: "evt_u3", ts: at(2 * DAY - 30 * MIN), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: false, proposed_action: "Call UPS claims line, file a lost-package claim for $89.99" },
    { id: "evt_u4", ts: at(1 * DAY + 20 * HOUR), kind: "approved", actor: "human", title: "Approved by you", detail: "Call UPS claims line, file a lost-package claim for $89.99" },
    { id: "evt_u5", ts: at(1 * DAY + 19 * HOUR), kind: "call_placed", actor: "fo", title: "Fo called UPS", detail: "Call completed · 6m 48s", fo_conversation_id: "fo_conv_8f3k2q1z",
      transcript: [
        { speaker: "UPS IVR", text: "Welcome to UPS. Briefly tell me why you're calling." , ts: "0:00" },
        { speaker: "Fo", text: "File a claim for a missing package.", ts: "0:06" },
        { speaker: "Marcus (UPS)", text: "I can help with that. What's the tracking number?", ts: "1:41" },
        { speaker: "Fo", text: "1Z999AA10123456784. It shows delivered on October 12th, but the recipient never received it and there's no delivery photo.", ts: "1:45" },
        { speaker: "Marcus (UPS)", text: "I see it was left at the front door. What was the declared value?", ts: "2:10" },
        { speaker: "Fo", text: "$89.99 — I can email the receipt right after this call.", ts: "2:14" },
        { speaker: "Marcus (UPS)", text: "Perfect. Claim number is 4417-UPS-2291. Send documents to the address in the confirmation email.", ts: "3:02" },
        { speaker: "Fo", text: "Thank you, Marcus. I'll send them now.", ts: "3:09" },
      ] },
    { id: "evt_u6", ts: at(1 * DAY + 18 * HOUR), kind: "email_sent", actor: "fo", title: "Fo emailed UPS claims", fo_conversation_id: "fo_conv_8f3k2q1z",
      email: { from: "dhyey@fo-agent.example", to: "claims@ups.example", subject: "Claim 4417-UPS-2291 — supporting documents",
        body: "Hello,\n\nPer my call with Marcus today, attached is the Amazon receipt ($89.99) and a screenshot of the tracking history for 1Z999AA10123456784.\n\nPlease let me know if anything else is needed.\n\nThanks,\nFo, on behalf of Dhyey Desai" } },
    { id: "evt_u7", ts: at(3 * HOUR), kind: "note", actor: "agent", title: "Waiting on UPS", detail: "No reply yet. Will follow up tomorrow at 10:00 AM ET if nothing arrives." },
  ]);

  put({ id: "case_lemonade", type: "insurance_claim", title: "Stolen bike — Trek FX 2", counterparty: "Lemonade", amount_cents: 65000, currency: "USD",
    status: "resolved", created_at: at(6 * DAY), updated_at: at(1 * DAY), confidence: 0.96, mock: true }, [
    { id: "evt_l1", ts: at(6 * DAY), kind: "classified", actor: "agent", title: "Classified as Insurance claim", detail: "Counterparty: Lemonade · Amount: $650.00 · Source: upload" },
    { id: "evt_l2", ts: at(6 * DAY - HOUR), kind: "evidence_gathered", actor: "agent", title: "Evidence gathered", detail: "Police report #NYPD-26-118402, purchase receipt, and 2 photos of the cut lock." },
    { id: "evt_l3", ts: at(6 * DAY - 2 * HOUR), kind: "approval_requested", actor: "agent", title: "Approval requested", pending: false, proposed_action: "Email Lemonade claims team, open a claim for $650.00 with attached evidence" },
    { id: "evt_l4", ts: at(5 * DAY + 20 * HOUR), kind: "approved", actor: "human", title: "Approved by you" },
    { id: "evt_l5", ts: at(5 * DAY + 19 * HOUR), kind: "email_sent", actor: "fo", title: "Fo emailed Lemonade", fo_conversation_id: "fo_conv_l2m9x7aa",
      email: { from: "dhyey@fo-agent.example", to: "claims@lemonade.example", subject: "Renters claim — stolen bicycle (policy LM-88213)",
        body: "Hi Lemonade team,\n\nI'd like to open a claim under policy LM-88213 for a stolen Trek FX 2 ($650.00). Police report NYPD-26-118402, receipt and photos attached.\n\nThank you,\nFo, on behalf of Dhyey Desai" } },
    { id: "evt_l6", ts: at(3 * DAY), kind: "reply_received", actor: "counterparty", title: "Reply from Lemonade",
      email: { from: "claims@lemonade.example", to: "dhyey@fo-agent.example", subject: "RE: Renters claim — stolen bicycle",
        body: "Hi Dhyey,\n\nGood news — your claim has been approved. $650.00 minus your $0 deductible will be deposited to your account on file within 2 business days.\n\n— Lemonade Claims" } },
    { id: "evt_l7", ts: at(2 * DAY), kind: "follow_up_scheduled", actor: "agent", title: "Follow-up scheduled", detail: "Verify deposit posted by Oct 16." },
    { id: "evt_l8", ts: at(1 * DAY), kind: "resolved", actor: "agent", title: "Resolved", detail: "$650.00 deposit confirmed." },
  ]);
}
