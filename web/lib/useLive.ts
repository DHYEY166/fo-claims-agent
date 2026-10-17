"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Case, CaseEvent } from "./types";

export type LiveMode = "connecting" | "live" | "polling";

/** Subscribes to SSE; on failure falls back to calling `poll` every 3s. */
export function useLive(handlers: { onCase?: (c: Case) => void; onEvent?: (e: CaseEvent) => void; poll: () => void }) {
  const h = useRef(handlers); h.current = handlers;
  const [mode, setMode] = useState<LiveMode>("connecting");
  useEffect(() => {
    let es: EventSource | null = null; let timer: ReturnType<typeof setInterval> | null = null; let closed = false;
    const startPolling = () => { if (timer || closed) return; setMode("polling"); timer = setInterval(() => h.current.poll(), 3000); };
    try {
      es = new EventSource(api.streamUrl());
      es.onopen = () => { setMode("live"); h.current.poll(); };
      es.addEventListener("case_updated", (m) => { try { h.current.onCase?.(JSON.parse((m as MessageEvent).data)); } catch {} });
      es.addEventListener("case_event", (m) => { try { h.current.onEvent?.(JSON.parse((m as MessageEvent).data)); } catch {} });
      es.onerror = () => { if (es && es.readyState === EventSource.CLOSED) { es.close(); startPolling(); } else { setMode("connecting"); } };
      // If it never opens within 5s, poll in parallel.
      setTimeout(() => { if (es && es.readyState !== EventSource.OPEN) startPolling(); }, 5000);
    } catch { startPolling(); }
    return () => { closed = true; es?.close(); if (timer) clearInterval(timer); };
  }, []);
  return mode;
}
