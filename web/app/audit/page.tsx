"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Hand, Link2, Loader2, Send, ShieldCheck, ShieldX, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { maskEmails } from "@/lib/demo";
import type { AuditResponse } from "@/lib/types";
import { LiveDot, cx, fmtTime, relTime, toDate, useNow } from "@/components/ui";

const EVENT: Record<string, { label: string; Icon: typeof Check; tone: string }> = {
  approval_requested: { label: "Requested", Icon: Hand, tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  approval_decided: { label: "Decided", Icon: Check, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  fo_ask_authorized: { label: "Authorized", Icon: KeyRound, tone: "bg-accent-50 text-accent-700 ring-accent-100" },
  ask_fo_sent: { label: "Asked Fo", Icon: Send, tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  ask_fo_go_sent: { label: "Told Fo go", Icon: Send, tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  fo_turn_closed: { label: "Fo replied", Icon: Check, tone: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
  fo_send_outcome: { label: "Send outcome", Icon: Check, tone: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
  recipient_check: { label: "Recipient check", Icon: KeyRound, tone: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
  classified: { label: "Classified", Icon: Check, tone: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
  intake: { label: "Intake", Icon: Check, tone: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
};

function parseDetail(d: string | null): Record<string, unknown> | null {
  if (!d) return null; try { const v = JSON.parse(d); return v && typeof v === "object" ? v : { detail: d }; } catch { return { detail: d }; }
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(5000);
  const load = useCallback(() => { api.audit().then((d) => { setData(d); setError(null); }).catch((e) => setError(String(e))); }, []);
  useEffect(load, [load]);
  const mode = useLive({ poll: load, onCase: load, onEvent: load });

  const rows = data ? [...data.rows].sort((a, b) => b.id - a.id) : [];
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-zinc-500">Every approval and every action Fo takes, append-only and hash-chained so it can&apos;t be silently edited.</p>
        </div>
        <div className="flex items-center gap-4">
          <LiveDot mode={mode} />
          {data && (data.chain_ok ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200"><ShieldCheck className="h-4 w-4" /> Hash chain verified</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700 ring-1 ring-rose-200"><ShieldX className="h-4 w-4" /> Hash chain broken</span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid grid-cols-[48px_130px_120px_150px_80px_minmax(0,1fr)_150px] items-center gap-4 border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <span>#</span><span>When</span><span>Step</span><span>Case</span><span>Actor</span><span>Detail</span><span>Row hash</span>
        </div>
        {error && <div className="px-5 py-6 text-sm text-rose-600">Couldn&apos;t load audit log: {error}</div>}
        {!data && !error && <div className="flex items-center gap-2 px-5 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {data && rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-zinc-500">No audit rows yet — they appear when an approval is requested.</div>}
        <ul>
          {rows.map((r) => {
            const m = EVENT[r.event] ?? { label: r.event.replace(/_/g, " "), Icon: Link2, tone: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
            const d = parseDetail(r.detail);
            return (
              <li key={r.id} className="grid grid-cols-[48px_130px_120px_150px_80px_minmax(0,1fr)_150px] items-center gap-4 border-b border-zinc-100 px-5 py-2.5 text-sm last:border-0">
                <span className="font-mono text-xs tabular-nums text-zinc-400">{r.id}</span>
                <span className="text-xs text-zinc-500" title={fmtTime(r.ts)}>{relTime(toDate(r.ts).toISOString(), now)}</span>
                <span><span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", m.tone)}><m.Icon className="h-3 w-3" />{m.label}</span></span>
                <Link href={`/cases/${r.case_id}`} className="truncate font-mono text-xs text-accent-600 hover:underline">{r.case_id}</Link>
                <span className="text-xs text-zinc-600">{r.actor}</span>
                <span className="flex min-w-0 flex-wrap gap-1">
                  {d && Object.entries(d).filter(([k]) => k !== "approval_id").map(([k, v]) => (
                    <span key={k} className="max-w-full truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600"><span className="text-zinc-400">{k}</span> {maskEmails(String(v))}</span>
                  ))}
                </span>
                <span className="truncate font-mono text-[11px] text-zinc-400" title={r.row_hash}>{r.row_hash.slice(0, 16)}…</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
