"use client";
import { useEffect, useState } from "react";
import { CreditCard, Package, ShieldCheck } from "lucide-react";
import type { CaseStatus, CaseType } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
}

export function useNow(ms = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function relTime(isoStr: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(isoStr).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return `${d}d ago`;
}

export function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const TYPE_META: Record<CaseType, { label: string; Icon: typeof CreditCard; tone: string }> = {
  card_dispute: { label: "Card dispute", Icon: CreditCard, tone: "bg-sky-50 text-sky-600 ring-sky-100" },
  insurance_claim: { label: "Insurance claim", Icon: ShieldCheck, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  package_claim: { label: "Package claim", Icon: Package, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
};
export const typeLabel = (t: CaseType) => TYPE_META[t]?.label ?? t;

export function TypeIcon({ type, size = "md" }: { type: CaseType; size?: "sm" | "md" }) {
  const m = TYPE_META[type] ?? TYPE_META.card_dispute;
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <span title={m.label} className={cx("inline-flex shrink-0 items-center justify-center rounded-lg ring-1", box, m.tone)}>
      <m.Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2} />
    </span>
  );
}

const STATUS_META: Record<CaseStatus, { label: string; dot: string; pill: string; pulse?: boolean }> = {
  new: { label: "New", dot: "bg-zinc-400", pill: "bg-zinc-100 text-zinc-700" },
  classified: { label: "Classified", dot: "bg-zinc-500", pill: "bg-zinc-100 text-zinc-700", pulse: true },
  gathering_evidence: { label: "Gathering evidence", dot: "bg-sky-500", pill: "bg-sky-50 text-sky-700", pulse: true },
  awaiting_approval: { label: "Needs approval", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", pulse: true },
  contacting: { label: "Contacting", dot: "bg-accent-500", pill: "bg-accent-50 text-accent-700", pulse: true },
  awaiting_reply: { label: "Awaiting reply", dot: "bg-indigo-400", pill: "bg-indigo-50 text-indigo-700" },
  follow_up_scheduled: { label: "Follow-up scheduled", dot: "bg-indigo-400", pill: "bg-indigo-50 text-indigo-700" },
  resolved: { label: "Resolved", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", dot: "bg-zinc-400", pill: "bg-zinc-100 text-zinc-500" },
  failed: { label: "Failed", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700" },
};

export function StatusPill({ status }: { status: CaseStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", m.pill)}>
      <span className="relative flex h-1.5 w-1.5">
        {m.pulse && <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", m.dot)} />}
        <span className={cx("relative inline-flex h-1.5 w-1.5 rounded-full", m.dot)} />
      </span>
      {m.label}
    </span>
  );
}

export function SimBadge() {
  return <span className="rounded border border-dashed border-zinc-300 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-zinc-500">simulated</span>;
}

export function ConfidenceChip({ value }: { value: number }) {
  const low = value < 0.7;
  return (
    <span title={low ? "Low confidence — please double-check the classification" : "Classification confidence"}
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        low ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-zinc-100 text-zinc-600")}>
      {low && <span aria-hidden>⚠</span>}confidence {Math.round(value * 100)}%
    </span>
  );
}

export function LiveDot({ mode }: { mode: "connecting" | "live" | "polling" }) {
  const m = { live: ["bg-emerald-500", "Live"], polling: ["bg-amber-500", "Polling · 3s"], connecting: ["bg-zinc-400", "Connecting"] }[mode];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="relative flex h-2 w-2">
        {mode === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cx("relative inline-flex h-2 w-2 rounded-full", m[0])} />
      </span>
      {m[1]}
    </span>
  );
}
