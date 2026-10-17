"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import type { Case } from "@/lib/types";
import { LiveDot, SimBadge, StatusPill, TypeIcon, cx, money, relTime, typeLabel, useNow } from "@/components/ui";

const OPEN = new Set(["new", "classified", "gathering_evidence", "awaiting_approval", "contacting", "awaiting_reply", "follow_up_scheduled", "escalated"]);

export default function CasesPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const now = useNow(5000);
  const flashT = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(() => { api.listCases().then((c) => { setCases(c); setError(null); }).catch((e) => setError(String(e))); }, []);
  useEffect(load, [load]);

  const mode = useLive({
    poll: load,
    onCase: (c) => {
      setCases((prev) => {
        const list = prev ? prev.filter((x) => x.id !== c.id) : [];
        return [c, ...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      });
      setFlash((f) => ({ ...f, [c.id]: Date.now() }));
      clearTimeout(flashT.current[c.id]);
      flashT.current[c.id] = setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[c.id]; return n; }), 1600);
    },
  });

  const open = cases?.filter((c) => OPEN.has(c.status)).length ?? 0;
  const needs = cases?.filter((c) => c.status === "awaiting_approval").length ?? 0;
  const recovered = cases?.filter((c) => c.status === "resolved").reduce((s, c) => s + (c.amount_cents ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-zinc-500">Disputes and claims your agent is working — it follows up until they&apos;re resolved.</p>
        </div>
        <LiveDot mode={mode} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open cases" value={String(open)} />
        <Stat label="Waiting on you" value={String(needs)} highlight={needs > 0} />
        <Stat label="Recovered" value={money(recovered)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_140px_110px_170px_90px_20px] items-center gap-4 border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <span>Case</span><span>Counterparty</span><span className="text-right">Amount</span><span>Status</span><span className="text-right">Updated</span><span />
        </div>
        {error && <div className="px-5 py-6 text-sm text-rose-600">Couldn&apos;t load cases: {error}</div>}
        {!cases && !error && [0, 1, 2].map((i) => <div key={i} className="h-[62px] animate-pulse border-b border-zinc-100 bg-zinc-50/40 last:border-0" />)}
        {cases?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center text-sm text-zinc-500">
            <Inbox className="h-5 w-5" /> No cases yet. <Link href="/new" className="font-medium text-accent-600">Submit your first claim</Link>
          </div>
        )}
        <ul>
          {cases?.map((c) => (
            <li key={c.id} className="border-b border-zinc-100 last:border-0">
              <Link href={`/cases/${c.id}`}
                className={cx("group grid grid-cols-[minmax(0,1fr)_140px_110px_170px_90px_20px] items-center gap-4 px-5 py-3 transition-colors duration-700 hover:bg-zinc-50",
                  !!flash[c.id] && "bg-accent-50/70")}>
                <div className="flex min-w-0 items-center gap-3">
                  <TypeIcon type={c.type} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900">{c.title}</span>
                      {c.mock && <SimBadge />}
                    </div>
                    <div className="text-xs text-zinc-500">{typeLabel(c.type)}</div>
                  </div>
                </div>
                <span className="truncate text-sm text-zinc-700">{c.counterparty ?? "—"}</span>
                <span className="text-right text-sm font-medium tabular-nums text-zinc-900">{c.amount_cents ? money(c.amount_cents, c.currency) : "—"}</span>
                <span><StatusPill status={c.status} /></span>
                <span className="text-right text-xs tabular-nums text-zinc-500">{relTime(c.updated_at, now)}</span>
                <ChevronRight className="h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cx("rounded-xl border bg-white px-4 py-3 shadow-sm", highlight ? "border-amber-200" : "border-zinc-200")}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cx("mt-1 text-xl font-semibold tabular-nums tracking-tight", highlight && "text-amber-700")}>{value}</div>
    </div>
  );
}
