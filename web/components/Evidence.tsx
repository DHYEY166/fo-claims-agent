"use client";
import { useState } from "react";
import type { EvidenceValue } from "@/lib/types";
import { maskEmails } from "@/lib/demo";
import { cx } from "./ui";

type Norm = { key: string; value: string; status: string | null; citation: string | null };

const isField = (v: unknown): v is { value: unknown; status?: unknown; citation?: unknown } =>
  !!v && typeof v === "object" && !Array.isArray(v) && ("status" in v || "value" in v);

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}

/** Normalises both plain {key: value} and per-field {key: {value, status, citation}} evidence. */
export function normalizeEvidence(ev: Record<string, EvidenceValue>): Norm[] {
  return Object.entries(ev).map(([key, v]) => isField(v)
    ? { key, value: show(v.value), status: typeof v.status === "string" ? v.status : null, citation: typeof v.citation === "string" && v.citation ? v.citation : null }
    : { key, value: show(v), status: null, citation: null });
}

const DOT: Record<string, { cls: string; label: string }> = {
  present: { cls: "bg-emerald-500", label: "present" },
  absent: { cls: "bg-zinc-300", label: "absent" },
  ambiguous: { cls: "bg-amber-500", label: "ambiguous" },
};

export function EvidenceGrid({ evidence }: { evidence?: Record<string, EvidenceValue> | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!evidence || typeof evidence !== "object") return null;
  const rows = normalizeEvidence(evidence);
  if (!rows.length) return null;
  const hasStatus = rows.some((r) => r.status);
  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs" data-evidence>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows.map((r) => {
          const d = r.status ? DOT[r.status] ?? { cls: "bg-zinc-400", label: r.status } : null;
          const open = openKey === r.key;
          return (
            <div key={r.key} className="contents">
              <dt className="flex items-center gap-1.5 text-zinc-400">
                {hasStatus && <span title={d?.label ?? "no status"} className={cx("h-1.5 w-1.5 shrink-0 rounded-full", d?.cls ?? "bg-transparent")} />}
                {r.key.replace(/_/g, " ")}
              </dt>
              <dd className="min-w-0">
                <button type="button" disabled={!r.citation} onClick={() => setOpenKey(open ? null : r.key)} title={r.citation ? maskEmails(r.citation) : undefined}
                  className={cx("text-left", r.status === "absent" ? "text-zinc-400" : "text-zinc-700", r.citation && "cursor-pointer decoration-zinc-300 decoration-dotted underline-offset-2 hover:underline")}>
                  {maskEmails(r.value)}
                  {r.status === "ambiguous" && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">ambiguous</span>}
                </button>
                {open && r.citation && <span className="mt-0.5 block border-l-2 border-zinc-200 pl-2 italic text-zinc-400">{maskEmails(r.citation)}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {hasStatus && (
        <div className="mt-2 flex gap-3 border-t border-zinc-200/70 pt-1.5 text-[10px] text-zinc-400">
          {Object.values(DOT).map((x) => <span key={x.label} className="inline-flex items-center gap-1"><span className={cx("h-1.5 w-1.5 rounded-full", x.cls)} />{x.label}</span>)}
          <span className="ml-auto">click a value to see its source</span>
        </div>
      )}
    </div>
  );
}
