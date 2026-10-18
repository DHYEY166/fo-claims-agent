"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Bot, Check, CheckCircle2, ChevronDown, Clock, FileSearch, Hand, Loader2, Mail, MailOpen, Phone,
  ShieldAlert, ShieldCheck, StickyNote, Tag, TriangleAlert, UserRound, X, XCircle, CreditCard,
} from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { TraceRow } from "@/components/TraceRow";
import { EvidenceGrid } from "@/components/Evidence";
import { DEMO_HIDE_CALLS, isCallEvent, maskAddress, maskEmails } from "@/lib/demo";
import type { CaseEvent, CaseWithEvents } from "@/lib/types";
import { ConfidenceChip, LiveDot, SimBadge, StatusPill, TypeIcon, cx, describeAction, fmtTime, money, relTime, typeLabel, useNow } from "@/components/ui";

const KIND: Record<string, { Icon: typeof Phone; tone: string }> = {
  classified: { Icon: Tag, tone: "bg-zinc-100 text-zinc-600" },
  evidence_gathered: { Icon: FileSearch, tone: "bg-sky-50 text-sky-600" },
  approval_requested: { Icon: Hand, tone: "bg-amber-50 text-amber-600" },
  approved: { Icon: Check, tone: "bg-emerald-50 text-emerald-600" },
  rejected: { Icon: X, tone: "bg-rose-50 text-rose-600" },
  call_placed: { Icon: Phone, tone: "bg-accent-50 text-accent-600" },
  email_sent: { Icon: Mail, tone: "bg-accent-50 text-accent-600" },
  reply_received: { Icon: MailOpen, tone: "bg-indigo-50 text-indigo-600" },
  follow_up_scheduled: { Icon: Clock, tone: "bg-zinc-100 text-zinc-600" },
  resolved: { Icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
  escalated_to_human: { Icon: UserRound, tone: "bg-amber-100 text-amber-700" },
  note: { Icon: StickyNote, tone: "bg-zinc-100 text-zinc-500" },
};
const ACTOR: Record<string, string> = { agent: "Agent", fo: "Fo", human: "You", counterparty: "Counterparty" };

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CaseWithEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const now = useNow(5000);

  const load = useCallback(() => { api.getCase(id).then((d) => { setData(d); setError(null); }).catch((e) => setError(String(e))); }, [id]);
  useEffect(load, [load]);

  const mode = useLive({
    poll: load,
    onCase: (c) => { if (c.id === id) setData((d) => (d ? { ...d, ...c } : d)); },
    onEvent: (e) => {
      if (e.case_id !== id) return;
      setData((d) => {
        if (!d) return d;
        const exists = d.events.some((x) => x.id === e.id);
        const events = exists ? d.events.map((x) => (x.id === e.id ? e : x)) : [...d.events, e];
        return { ...d, events: events.sort((a, b) => a.ts.localeCompare(b.ts)) };
      });
      setFresh((s) => new Set(s).add(e.id));
    },
  });

  if (error) return <div className="text-sm text-rose-600">Couldn&apos;t load case: {error} <Link className="ml-2 text-accent-600" href="/">Back</Link></div>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading case…</div>;

  const visible = DEMO_HIDE_CALLS ? data.events.filter((e) => !isCallEvent(e)) : data.events;
  const pending = data.events.filter((e) => e.kind === "approval_requested" && e.pending);
  const escalation = [...data.events].reverse().find((e) => e.kind === "escalated_to_human");
  const escReasons = escalation ? escalationReasons(escalation) : [];
  const sendStates = foSendStates(data.events, { status: data.status, fo_sent: data.fo_sent, held: data.held });
  const reports = data.events.filter(isFoReportEvent);
  const lastReport = reports[reports.length - 1];
  const confirmedSent = data.events.some(isConfirmedSentStep);
  const caseHeld = !confirmedSent && (data.held === true || pending.some(isFoGo) || (!!lastReport && sendStates[lastReport.id] === "held"
    && (data.status === "escalated" || data.status === "awaiting_approval")));
  const isHoldEscalation = !!escalation && isHoldingStep(escalation);
  const working = ["new", "classified", "gathering_evidence", "contacting"].includes(data.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" /> All cases</Link>
        <LiveDot mode={mode} />
      </div>

      <div className="flex items-start gap-4">
        <TypeIcon type={data.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{maskEmails(data.title)}</h1>
            {data.mock && <SimBadge />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <StatusPill status={data.status} />
            {caseHeld && <HeldBadge />}
            <span>{typeLabel(data.type)}</span>
            {data.counterparty && <><span className="text-zinc-300">·</span><span>{maskEmails(data.counterparty)}</span></>}
            {!!data.amount_cents && <><span className="text-zinc-300">·</span><span className="font-medium tabular-nums text-zinc-900">{money(data.amount_cents, data.currency)}</span></>}
            {typeof data.confidence === "number" && <ConfidenceChip value={data.confidence} />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-6">
        <div className="space-y-5">
          {escalation && !(isHoldingStep(escalation) && data.events.slice(data.events.indexOf(escalation) + 1).some(isConfirmedSentStep)) && (data.status === "escalated" || (!pending.length && !isHoldingStep(escalation))) && (
            <section className="animate-fade-in overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60">
              <div className="flex items-start gap-3 px-5 py-4">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-900">{escalation.title}</div>
                  {escReasons.length > 0 && (
                    <p className="mt-1.5 text-sm text-amber-900"><span className="font-medium">Reason:</span> {escReasons.map(maskEmails).join("; ")}</p>
                  )}
                  {escalation.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900/80">{maskEmails(escalation.detail)}</p>}
                  <p className="mt-2 text-xs font-medium text-amber-700">{isHoldEscalation
                    ? "Fo drafted the email but nothing was sent. Handed to a human EA."
                    : escalation && isUnconfirmedStep(escalation) ? "Fo's reply didn't confirm a send, so the agent isn't assuming one. Handed to a human EA."
                    : "The agent stopped before contacting anyone and handed this to a human EA."}</p>
                </div>
              </div>
            </section>
          )}
          {pending.map((e) => <ApprovalCard key={e.id} caseId={id} event={e} onConflict={load} />)}

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Timeline</h2>
            <ol className="relative">
              {visible.map((e, i) => (
                <TimelineItem key={e.id} e={e} last={i === visible.length - 1 && !working} fresh={fresh.has(e.id)} now={now}
                  sendState={sendStates[e.id] ?? null} sentLater={data.events.slice(data.events.indexOf(e) + 1).some(isConfirmedSentStep)} />
              ))}
              {working && (
                <li className="flex items-center gap-3 pl-0.5 text-sm text-zinc-400">
                  <span className="flex h-7 w-7 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></span>
                  Agent is working…
                </li>
              )}
              {data.events.length === 0 && !working && <li className="text-sm text-zinc-400">No events yet.</li>}
            </ol>
          </section>
        </div>

        <aside className="sticky top-20 space-y-4 self-start">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Details</h3>
            <dl className="space-y-2.5">
              <Row k="Case ID"><span className="font-mono text-xs">{data.id}</span></Row>
              <Row k="Counterparty">{data.counterparty ?? "—"}</Row>
              <Row k="Amount"><span className="tabular-nums">{data.amount_cents ? money(data.amount_cents, data.currency) : "—"}</span></Row>
              <Row k="Opened">{fmtTime(data.created_at)}</Row>
              <Row k="Updated">{relTime(data.updated_at, now)}</Row>
              <Row k="Events"><span className="tabular-nums">{visible.length}</span></Row>
            </dl>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-500 shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Trust by design</div>
            The agent never calls, emails, or spends on your behalf without an explicit approval. Every action Fo takes is logged here with a full transcript.
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Pretty-print raw ISO timestamps that backends embed in free-text details. */
function prettyDetail(d: string) {
  return d.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, (m) => fmtTime(m));
}

/** Escalation reasons: explicit `reason` field if present, else the text after "...: " in the title. */
function escalationReasons(e: CaseEvent): string[] {
  if (Array.isArray(e.reason)) return e.reason.filter(Boolean).map(String);
  if (typeof e.reason === "string" && e.reason.trim()) return [e.reason.trim()];
  const i = e.title.indexOf(": ");
  return i > 0 ? e.title.slice(i + 2).split(/;\s*/).filter(Boolean) : [];
}

function MockBadge() {
  return (
    <span title="Simulated step: nothing real was sent" data-mock-badge
      className="rounded border border-amber-300 bg-amber-50 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-amber-800">MOCK</span>
  );
}

/** The real-path "Fo replied" step (FO_MOCK=0): a non-simulated Fo note produced by get_fo_reply. */
function isFoReportEvent(e: CaseEvent) {
  const mock = e.mock === true || /^\[MOCK\]\s*/i.test(e.title);
  if (isConfirmedSentStep(e) || isUnconfirmedStep(e) || isHoldingStep(e)) return false;
  return !mock && e.actor === "fo" && (String(e.trace?.tool ?? "").includes("get_fo_reply") || e.title === "Fo replied");
}

// Text fallback only, for "Fo replied" steps with no backend signal (pre-hold-detection backends).
// Narrow on purpose: "Thanks for the go-ahead. I sent the email" must not read as held.
const SENT_TEXT = [/^\s*sent\b/i, /\bI(?:'ve| have)? sent\b/i, /message id/i];
const HELD_TEXT = /held for your go-ahead|say go and I(?:'|’)?ll send|waiting for your go-ahead/i;
const isFoGo = (e: CaseEvent) => e.kind === "approval_requested" && typeof e.proposed_action === "object" && e.proposed_action?.kind === "fo_go";
const isHoldingStep = (e: CaseEvent) => /^Fo is holding the email/i.test(e.title);
const isFollowUp = (e: CaseEvent) => e.kind === "follow_up_scheduled" || /^Follow-up scheduled/i.test(e.title);
// Backend send confirmation. A step titled exactly "Fo confirmed it sent the email" counts (any kind).
// An email_sent step counts only if it isn't simulated AND it comes from Fo, carries that same title,
// or is the recorded honesty event on case_cbd0d1cf1a (evt_0138216f9e, actor human). Any other human or
// system email_sent does not count.
const CONFIRMED_TITLE = "Fo confirmed it sent the email";
const HONESTY_TITLE = "Dhyey gave the go-ahead directly in Fo, and Fo confirmed it sent at 4:36 PM ET";
const isConfirmedSentStep = (e: CaseEvent) => {
  const title = e.title.trim();
  if (title === CONFIRMED_TITLE) return true;
  if (String(e.kind) !== "email_sent" || e.mock === true || /^\[MOCK\]/i.test(title)) return false;
  return e.actor === "fo" || title === HONESTY_TITLE;
};
const isUnconfirmedStep = (e: CaseEvent) => /^Couldn(?:'|’)?t confirm Fo sent the email/i.test(e.title);
type SendState = "sent" | "held" | "drafted" | "unconfirmed";

/**
 * Send state of each live "Fo replied" step. Never "sent" without backend confirmation:
 * a later "Follow-up scheduled" step (before the next Fo reply) or, for the latest reply, case status awaiting_reply.
 * A later "Couldn't confirm Fo sent the email" step makes the reply "unconfirmed", whatever its text says.
 * The text fallback only applies to old cases where the backend gave no signal at all.
 */
function foSendStates(events: CaseEvent[], c: { status?: string; fo_sent?: boolean; held?: boolean }): Record<string, SendState> {
  const out: Record<string, SendState> = {};
  const caseHasSignal = c.status === "awaiting_reply"
    || events.some((x) => isConfirmedSentStep(x) || isHoldingStep(x) || isFoGo(x) || isUnconfirmedStep(x) || isFollowUp(x));
  events.forEach((e, i) => {
    if (!isFoReportEvent(e)) return;
    let j = i + 1;
    while (j < events.length && !isFoReportEvent(events[j])) j++;
    const after = events.slice(i + 1, j);
    const latest = j === events.length;
    const anySent = SENT_TEXT.some((r) => r.test(e.detail ?? ""));
    const anyHeld = HELD_TEXT.test(e.detail ?? "");
    const textSent = anySent && !anyHeld; // mixed wording is "unclear" (backend rule), never sent or held
    const textHeld = anyHeld && !anySent;
    // (a) backend signals, strongest first. An explicit "Fo confirmed it sent the email" anywhere after
    // this reply overrides HELD, unconfirmed and the old-case exception.
    if (events.slice(i + 1).some(isConfirmedSentStep)) out[e.id] = "sent";
    else if (after.some(isUnconfirmedStep)) out[e.id] = "unconfirmed";
    else if (after.some(isHoldingStep) || after.some(isFoGo) || e.held === true || e.fo_sent === false || c.held === true) out[e.id] = "held";
    // Pre-hold-detection backends (e8a5889, e.g. case_cbd0d1cf1a) scheduled a follow-up even when Fo held
    // the email; Fo's own narrow "held" words win there so we never claim a send that didn't happen.
    else if (after.some(isFollowUp)) out[e.id] = textHeld ? "held" : "sent";
    else if (latest && c.status === "awaiting_reply") out[e.id] = textHeld ? "held" : "sent";
    // (b) text fallback, only for old cases with no backend signal at all
    else if (!caseHasSignal && textSent) out[e.id] = "sent";
    else if (!caseHasSignal && textHeld) out[e.id] = "held";
    else out[e.id] = "drafted";
  });
  return out;
}

function HeldBadge() {
  return (
    <span title="Fo drafted the email and is holding it for your go-ahead" data-held-badge
      className="rounded border border-amber-300 bg-amber-50 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-amber-800">HELD BY FO: waiting for go-ahead</span>
  );
}

function UnconfirmedBadge() {
  return (
    <span title="The backend couldn't confirm Fo sent this email" data-unconfirmed-badge
      className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-zinc-600">UNCONFIRMED</span>
  );
}

function LiveBadge() {
  return (
    <span title="Real Fo step (not simulated)" data-live-badge
      className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-emerald-800">LIVE</span>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="truncate text-right text-zinc-900">{children}</dd></div>;
}

function ApprovalCard({ caseId, event, onConflict }: { caseId: string; event: CaseEvent; onConflict: () => void }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [decided, setDecided] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const a = describeAction(event.proposed_action);
  const foGo = isFoGo(event);
  const [confirming, setConfirming] = useState(false);
  async function decide(decision: "approve" | "reject") {
    if (decided) return;
    setBusy(decision); setDecided(true); setErr(null);
    try { await api.decide(caseId, { event_id: event.id, decision }); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) { setInfo("Already decided — this approval was handled already. Refreshing…"); setTimeout(onConflict, 800); }
      else { setErr(e instanceof Error ? e.message : String(e)); if (!foGo) setDecided(false); /* go-ahead: one click, never re-armed */ }
    } finally { setBusy(null); }
  }
  const ActionIcon = a?.channel === "email" ? Mail : a?.channel === "card" ? CreditCard : Phone;
  return (
    <>
    <section data-approval-card data-fo-go={foGo || undefined} className="animate-fade-in overflow-hidden rounded-xl border border-amber-300 bg-white shadow-[0_0_0_4px_rgba(251,191,36,0.12)]">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-amber-900">{foGo ? "Give Fo the go-ahead" : "Approve before action"}</span>
        <span className="ml-auto text-xs text-amber-700">Waiting on you</span>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{foGo ? "Fo will" : "The agent will"}</div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <ActionIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
            <p className="text-[15px] font-medium leading-snug text-zinc-900">{foGo ? "Send the email it already drafted, in the same conversation" : maskEmails(a?.headline ?? event.title)}</p>
          </div>
          {(a?.to || a?.spend_cents != null) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs text-zinc-500">
              {a?.to && <span>To <span className="font-medium text-zinc-700">{maskAddress(a.to)}</span></span>}
              {a?.spend_cents != null && <span>Spend <span className="font-medium tabular-nums text-zinc-700">{money(a.spend_cents)}</span></span>}
            </div>
          )}
          {a?.message && !foGo && <p className="mt-2 border-l-2 border-zinc-200 pl-3 ml-7 text-sm leading-relaxed text-zinc-600">{maskEmails(a.message)}</p>}
        </div>
        {event.detail && <p className="text-sm leading-relaxed text-zinc-600">{maskEmails(event.detail)}</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {info && <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">{info}</p>}
        <div className="flex items-center gap-2 pt-1">
          <div>
            <button onClick={() => (foGo ? setConfirming(true) : decide("approve"))} disabled={decided} data-approve
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {foGo ? "Give Fo the go-ahead" : "Approve"}
            </button>
          </div>
          <button onClick={() => decide("reject")} disabled={decided}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Reject
          </button>
          <span className="ml-auto text-xs text-zinc-400">Every step is logged below</span>
        </div>
        {foGo && <p className="-mt-1 text-xs text-zinc-400">Second approval, on Fo&apos;s side. Same email, no new send slot.</p>}
      </div>
    </section>
    {confirming && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30" role="dialog" aria-modal="true" data-go-ahead-confirm>
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
          <div className="text-sm font-semibold text-zinc-900">Give Fo the go-ahead?</div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">This tells Fo to send the drafted email to the test bank inbox. One send, no retries. Continue?</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirming(false)} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button onClick={() => { setConfirming(false); decide("approve"); }} data-go-ahead-continue className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700">Continue</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function TimelineItem({ e, last, fresh, now, sendState, sentLater }: { e: CaseEvent; last: boolean; fresh: boolean; now: number; sendState: SendState | null; sentLater: boolean }) {
  const confirmed = isConfirmedSentStep(e);
  const k = confirmed ? { Icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" } : KIND[e.kind] ?? KIND.note;
  // Simulated steps: backend flags them with mock:true and/or a "[MOCK] " title prefix.
  const prefixed = /^\[MOCK\]\s*/i.test(e.title);
  const isMock = e.mock === true || prefixed;
  const title = isMock ? e.title.replace(/^\[MOCK\]\s*/i, "") : e.title;
  // A real (non-simulated) outbound email gets a LIVE badge so the on-stage send is unmistakable.
  // Real (FO_MOCK=0) path: the send is reported as a "Fo replied" note from get_fo_reply, not an email_sent event.
  const isFoReport = isFoReportEvent(e);
  const isLiveSend = (/^email_sen[td]/.test(String(e.kind)) && !isMock) || isFoReport;
  const showTranscript = !!e.transcript?.length && !DEMO_HIDE_CALLS;
  const expandable = showTranscript || !!e.email;
  const [open, setOpen] = useState(false);
  return (
    <li data-event-id={e.id} data-kind={e.kind} className={cx("relative flex gap-3 pb-5", fresh && "animate-fade-in")}>
      {!last && <span className="absolute left-[13.5px] top-8 h-[calc(100%-28px)] w-px bg-zinc-200" />}
      <span className={cx("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white", k.tone)}>
        <k.Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-900">{maskEmails(title)}</span>
          {isMock && <MockBadge />}
          {isLiveSend && <LiveBadge />}
          {(sendState === "held" || (isHoldingStep(e) && !sentLater)) && <HeldBadge />}
          {sendState === "unconfirmed" && <UnconfirmedBadge />}
          {e.kind === "approval_requested" && e.pending && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">pending</span>}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-400" title={fmtTime(e.ts)}>{relTime(e.ts, now)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
          {e.actor === "fo" ? <Bot className="h-3 w-3" /> : null}{ACTOR[e.actor] ?? e.actor}
        </div>
        {isFoReport && (
          <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2" data-fo-report>
            <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">
              Fo reported
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{e.detail ? maskEmails(e.detail) : "(no text in Fo's reply)"}</p>
          </div>
        )}
        {isFoReport && (
          <p data-fo-send-state={sendState} className={cx("mt-1.5 text-sm", sendState === "held" ? "font-medium text-amber-800" : sendState === "sent" ? "text-emerald-800" : "text-zinc-600")}>
            {sendState === "held" ? "Fo drafted it and is holding it for your go-ahead. Nothing has been sent yet."
              : sendState === "sent" ? `Sent to ${maskAddress(e.proposed_email?.to) || "test bank inbox"}`
              : `Asked Fo to email ${maskAddress(e.proposed_email?.to) || "test bank inbox"}. Its reply didn't clearly confirm the send, so the agent isn't assuming it went out.`}
          </p>
        )}
        {isFoReport ? null : e.pending ? <p className="mt-1.5 text-sm text-amber-700">Waiting for your decision — see the approval card above.</p>
          : e.detail && !(e.evidence && Object.keys(e.evidence).length) && <p className={cx("mt-1.5 whitespace-pre-wrap text-sm leading-relaxed", confirmed ? "rounded-md bg-emerald-50 px-3 py-2 text-emerald-800" : e.kind === "escalated_to_human" ? "rounded-md bg-amber-50 px-3 py-2 text-amber-900" : "text-zinc-600")}>{maskEmails(prettyDetail(e.detail))}</p>}
        <EvidenceGrid evidence={e.evidence} />
        {e.fo_conversation_id && <p className="mt-1 font-mono text-[11px] text-zinc-400">fo conversation · {e.fo_conversation_id}</p>}
        <TraceRow trace={e.trace} />
        {expandable && (
          <button onClick={() => setOpen((o) => !o)} data-expand
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50">
            <ChevronDown className={cx("h-3.5 w-3.5 transition", open && "rotate-180")} />
            {open ? "Hide" : "Show"} {showTranscript ? `transcript · ${e.transcript!.length} turns` : "email"}
          </button>
        )}
        {open && showTranscript && e.transcript && (
          <div className="mt-2 animate-fade-in space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
            {e.transcript.map((t, i) => {
              const fo = t.speaker.toLowerCase() === "fo";
              return (
                <div key={i} className={cx("flex gap-2", fo && "flex-row-reverse")}>
                  <div className={cx("max-w-[80%] rounded-lg px-3 py-2 text-sm leading-snug", fo ? "bg-accent-600 text-white" : "border border-zinc-200 bg-white text-zinc-800")}>
                    <div className={cx("mb-0.5 text-[11px] font-medium", fo ? "text-accent-100" : "text-zinc-500")}>{t.speaker}{t.ts && <span className="ml-1.5 font-normal opacity-70">{t.ts}</span>}</div>
                    {maskEmails(t.text)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {open && e.email && (
          <div className="mt-2 animate-fade-in overflow-hidden rounded-lg border border-zinc-200">
            <div className="space-y-0.5 border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 text-xs">
              <div><span className="inline-block w-14 text-zinc-400">From</span><span className="font-mono text-zinc-700">{maskAddress(e.email.from)}</span></div>
              <div><span className="inline-block w-14 text-zinc-400">To</span><span className="font-mono text-zinc-700">{maskAddress(e.email.to)}</span></div>
              {e.email.cc && (Array.isArray(e.email.cc) ? e.email.cc.length > 0 : true) && (
                <div><span className="inline-block w-14 text-zinc-400">Cc</span><span className="font-mono text-zinc-700">{(Array.isArray(e.email.cc) ? e.email.cc : [e.email.cc]).map(maskAddress).join(", ")}</span></div>
              )}
              <div><span className="inline-block w-14 text-zinc-400">Subject</span><span className="font-medium text-zinc-900">{maskEmails(e.email.subject)}</span></div>
            </div>
            <pre className="whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed text-zinc-700">{maskEmails(e.email.body)}</pre>
          </div>
        )}
      </div>
    </li>
  );
}
