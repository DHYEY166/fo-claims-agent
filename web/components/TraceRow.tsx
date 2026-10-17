"use client";
import { useState } from "react";
import { ChevronRight, Activity } from "lucide-react";
import type { Trace } from "@/lib/types";
import { maskEmails } from "@/lib/demo";
import { cx } from "./ui";

function fmtMs(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`; }

/** Compact, collapsed per-step trace line; expands to the full trace JSON. Renders nothing without a trace. */
export function TraceRow({ trace }: { trace?: Trace | null }) {
  const [open, setOpen] = useState(false);
  if (!trace || typeof trace !== "object") return null;
  const errors = Array.isArray(trace.errors) ? trace.errors.filter(Boolean) : [];
  const bad = errors.length > 0;
  const grounding = Array.isArray(trace.grounding_problems) ? trace.grounding_problems.filter(Boolean) : [];
  const warn = !bad && grounding.length > 0;
  const tok = trace.tokens ? (trace.tokens.input ?? 0) + (trace.tokens.output ?? 0) : null;
  const parts = [
    trace.agent,
    typeof trace.duration_ms === "number" ? fmtMs(trace.duration_ms) : null,
    tok != null ? `${tok.toLocaleString()} tok` : null,
    trace.model,
    trace.prompt_id,
    trace.retries ? `${trace.retries} retr${trace.retries === 1 ? "y" : "ies"}` : null,
    bad ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : null,
    grounding.length ? `${grounding.length} grounding issue${grounding.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return (
    <div className="mt-1.5" data-trace>
      <button onClick={() => setOpen((o) => !o)} title="Per-step trace"
        className={cx("group inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] transition",
          bad ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : warn ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600")}>
        <ChevronRight className={cx("h-3 w-3 shrink-0 transition", open && "rotate-90")} />
        <Activity className="h-3 w-3 shrink-0" />
        <span className="truncate">trace · {parts.join(" · ")}</span>
      </button>
      {open && (
        <div className="mt-1 animate-fade-in space-y-1.5">
          {bad && (
            <ul className="space-y-0.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {errors.map((er, i) => <li key={i}>• {maskEmails(String(er))}</li>)}
            </ul>
          )}
          <pre className={cx("overflow-x-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed",
            bad ? "border-rose-200 bg-white text-rose-900" : "border-zinc-200 bg-zinc-50 text-zinc-600")}>
            {maskEmails(JSON.stringify(trace, null, 2))}
          </pre>
        </div>
      )}
    </div>
  );
}
